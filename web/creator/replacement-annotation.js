// A replacement locator is a new PNG, never a mask or an edit of the source.
import { el, icon, mountOverlay } from "./dom.js";
import { upload, viewUrl } from "./api.js";
import { t } from "./i18n.js";

export function openReplacementAnnotation(asset) {
  return new Promise((resolve) => new ReplacementAnnotation(asset, resolve).mount());
}

export class ReplacementAnnotation {
  constructor(asset, resolve) {
    this.asset = asset;
    this.resolve = resolve;
    this.color = "#ef4444";
    this.width = 8;
    this.erase = false;
    this.strokes = [];
    this.stroke = null;
    this.busy = false;
    this.ready = false;
    this.closed = false;
    this.duration = 0;
    this.time = 0;
  }

  mount() {
    const video = this.asset.kind === "video";
    this.base = document.createElement("canvas");
    this.ink = document.createElement("canvas");
    this.stage = el("canvas", {
      class: "mmc-replacement-stage", "aria-label": t("Mark the replacement target"),
      onpointerdown: (event) => this.startStroke(event),
      onpointermove: (event) => this.moveStroke(event),
      onpointerup: (event) => this.endStroke(event),
      onpointercancel: (event) => this.endStroke(event),
    });
    this.status = el("span", { class: "mmc-replacement-status", role: "status", text: t("Loading…") });
    this.saveButton = el("button", {
      class: "mmc-btn mmc-btn-primary", text: t("Save replacement reference"), disabled: true,
      onclick: () => this.save(),
    });
    this.cancelButton = el("button", { class: "mmc-btn", text: t("Cancel"), onclick: () => this.close(null) });
    this.undoButton = el("button", {
      class: "mmc-btn", text: t("Undo"), disabled: true,
      onclick: () => { this.strokes.pop(); this.renderInk(); },
    });
    this.resetButton = el("button", {
      class: "mmc-btn", text: t("Reset marks"), disabled: true,
      onclick: () => { this.strokes = []; this.renderInk(); },
    });
    this.eraseButton = el("button", {
      class: "mmc-btn", text: t("Eraser"), "aria-pressed": false,
      onclick: () => {
        this.erase = !this.erase;
        this.eraseButton.setAttribute("aria-pressed", String(this.erase));
      },
    });
    const color = el("input", {
      type: "color", value: this.color, "aria-label": t("Brush color"),
      oninput: (event) => { this.color = event.target.value; this.erase = false;
        this.eraseButton.setAttribute("aria-pressed", "false"); },
    });
    const width = el("input", {
      type: "range", min: "2", max: "32", value: String(this.width), "aria-label": t("Brush width"),
      oninput: (event) => { this.width = Number(event.target.value); },
    });
    const transport = video ? this.transport() : null;
    this.card = el("div", {
      class: "mmc-replacement-card", role: "dialog", "aria-modal": true,
      "aria-label": t("Replacement reference"), onpointerdown: (event) => event.stopPropagation(),
    }, [
      el("div", { class: "mmc-replacement-head" }, [icon("image", 18),
        el("span", { text: t("Replacement reference") }),
        el("span", { class: "mmc-replacement-file", text: this.asset.filename.split("/").pop() }),
      ]),
      el("p", { class: "mmc-replacement-note", text: t("Mark who or what to replace. Describe the mark in Replacement target. The original file is never changed.") }),
      el("div", { class: "mmc-replacement-tools" }, [
        el("label", {}, [el("span", { text: t("Brush color") }), color]),
        el("label", {}, [el("span", { text: t("Brush width") }), width]),
        this.eraseButton, this.undoButton, this.resetButton,
      ]),
      el("div", { class: "mmc-replacement-viewport" }, [this.stage]), transport,
      el("div", { class: "mmc-replacement-actions" }, [this.status, this.cancelButton, this.saveButton]),
    ]);
    this.overlay = el("div", { class: "mmc-overlay", onpointerdown: () => this.close(null) }, [this.card]);
    this.unmount = mountOverlay(this.overlay, () => this.close(null));
    if (video) {
      this.media = el("video", { src: viewUrl(this.asset.filename), preload: "auto", playsinline: true });
      this.media.muted = true;
      this.media.addEventListener("loadedmetadata", () => {
        this.duration = this.media.duration || 0;
        this.scrub.max = String(this.duration);
        const start = Math.max(0, Number(this.asset.trim?.[0]) || 0);
        if (start) this.seek(start);
      });
      this.media.addEventListener("loadeddata", () => this.capture());
      this.media.addEventListener("seeked", () => this.capture());
    } else {
      this.media = new Image();
      this.media.onload = () => this.capture();
      this.media.src = viewUrl(this.asset.filename);
    }
    this.media.onerror = () => {
      this.ready = false; this.saveButton.disabled = true;
      this.status.textContent = t("Could not load the reference. Check that the file exists and the browser supports it.");
    };
  }

  transport() {
    this.scrub = el("input", {
      type: "range", min: "0", max: "0", step: "0.001", value: "0", "aria-label": t("Choose source frame"),
      oninput: () => this.seek(Number(this.scrub.value)),
    });
    this.timeLabel = el("span", { class: "mmc-replacement-time", text: "0.000 s" });
    const step = (name, delta) => el("button", {
      class: "mmc-btn", text: name,
      onclick: () => this.seek(this.time + delta),
    });
    return el("div", { class: "mmc-replacement-transport" }, [
      step("−1s", -1), step("−f", -1 / (Number(this.asset.fps) || 24)),
      this.scrub, step("+f", 1 / (Number(this.asset.fps) || 24)), step("+1s", 1), this.timeLabel,
    ]);
  }

  seek(time) {
    if (this.busy || this.closed || !this.duration) return;
    const next = Math.max(0, Math.min(this.duration, time));
    if (this.strokes.length) {
      if (!window.confirm(t("Changing the frame clears the current marks. Continue?"))) {
        this.scrub.value = String(this.time); return;
      }
      this.strokes = []; this.stroke = null;
    }
    this.ready = false; this.saveButton.disabled = true;
    this.scrub.value = String(next);
    this.timeLabel.textContent = `${next.toFixed(3)} s`;
    if (this.media.currentTime === next) { this.capture(); return; }
    this.media.currentTime = next;
    this.status.textContent = t("Loading frame…");
  }

  capture() {
    if (this.closed || this.busy) return;
    const width = this.media.videoWidth || this.media.naturalWidth;
    const height = this.media.videoHeight || this.media.naturalHeight;
    if (!width || !height || this.media.seeking) return;
    for (const canvas of [this.base, this.ink, this.stage]) { canvas.width = width; canvas.height = height; }
    this.base.getContext("2d").drawImage(this.media, 0, 0, width, height);
    this.time = Number(this.media.currentTime) || 0;
    if (this.scrub) { this.scrub.value = String(this.time); this.timeLabel.textContent = `${this.time.toFixed(3)} s`; }
    this.ready = true; this.saveButton.disabled = false;
    this.status.textContent = t("Only Save creates a new PNG. Cancel saves nothing.");
    this.renderInk();
  }

  point(event) {
    const box = this.stage.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))];
  }

  startStroke(event) {
    if (event.button !== 0 || !this.ready || this.busy) return;
    event.preventDefault(); event.stopPropagation();
    this.stage.setPointerCapture(event.pointerId);
    const box = this.stage.getBoundingClientRect();
    this.stroke = { color: this.color, width: this.width / box.width, erase: this.erase, points: [this.point(event)] };
    this.strokes.push(this.stroke);
    this.renderInk();
  }

  moveStroke(event) {
    if (!this.stroke || !this.stage.hasPointerCapture(event.pointerId)) return;
    this.stroke.points.push(this.point(event)); this.renderInk();
  }

  endStroke(event) {
    if (!this.stroke) return;
    this.stroke = null;
    if (this.stage.hasPointerCapture(event.pointerId)) this.stage.releasePointerCapture(event.pointerId);
    this.renderInk();
  }

  renderInk() {
    const context = this.ink.getContext("2d");
    const width = this.ink.width, height = this.ink.height;
    context.clearRect(0, 0, width, height);
    for (const stroke of this.strokes) {
      context.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
      context.strokeStyle = stroke.color; context.fillStyle = stroke.color;
      context.lineWidth = stroke.width * width; context.lineCap = "round"; context.lineJoin = "round";
      context.beginPath();
      stroke.points.forEach(([x, y], index) => index
        ? context.lineTo(x * width, y * height) : context.moveTo(x * width, y * height));
      if (stroke.points.length === 1) {
        context.arc(stroke.points[0][0] * width, stroke.points[0][1] * height, context.lineWidth / 2, 0, 2 * Math.PI);
        context.fill();
      } else context.stroke();
    }
    context.globalCompositeOperation = "source-over";
    const shown = this.stage.getContext("2d");
    shown.clearRect(0, 0, width, height); shown.drawImage(this.base, 0, 0); shown.drawImage(this.ink, 0, 0);
    this.undoButton.disabled = !this.strokes.length; this.resetButton.disabled = !this.strokes.length;
  }

  async save() {
    if (this.busy || !this.ready || this.closed || this.stroke) return;
    this.busy = true;
    const controls = [...this.card.querySelectorAll("button, input")].map((node) => [node, node.disabled]);
    for (const [node] of controls) node.disabled = true;
    this.status.textContent = t("Saving…");
    try {
      const blob = await new Promise((resolve) => this.stage.toBlob(resolve, "image/png"));
      if (!blob) throw new Error(t("could not read the frame"));
      const stem = this.asset.filename.split("/").pop().replace(/\.[^.]+$/, "");
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const saved = await upload(new File([blob], `${stem}_target_${suffix}.png`, { type: "image/png" }), "continuity_replacement_refs");
      const origin = this.asset.kind === "video"
        ? { handle: this.asset.handle, filename: this.asset.filename, time_s: this.time }
        : this.asset.replacement_origin ? { ...this.asset.replacement_origin } : null;
      this.busy = false;
      this.close({ path: saved.path, kind: "image", width: this.stage.width, height: this.stage.height,
        ...(origin ? { replacement_origin: origin } : {}),
        replacement_annotation: { color: this.color, width: this.width,
          source_filename: this.asset.filename, strokes: this.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => [...point]) })) },
      });
    } catch (error) {
      this.status.textContent = t("failed — {error}", { error: String(error.message || error) });
      this.busy = false;
      for (const [node, disabled] of controls) node.disabled = disabled;
    }
  }

  close(result) {
    if (this.closed || this.busy) return;
    this.closed = true;
    if (this.asset.kind === "video") { this.media.pause(); this.media.removeAttribute("src"); this.media.load(); }
    else { this.media.onload = null; this.media.onerror = null; }
    this.unmount(); this.resolve(result);
  }
}
