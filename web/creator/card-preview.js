// Read-only players for delivered card files. Nothing here writes timeline data.
import { el, dismissable, placeNear } from "./dom.js";
import { viewUrl } from "./api.js";
import { t } from "./i18n.js";
import * as S from "./state.js";

const players = new Set();
// Playback-only session memory, written solely by the preview volume slider.
// A new card/file starts silent, independently of the workflow or source audio.
const cardVolumes = new Map();
let volumeSequence = 0;
let lifecycle = null;

const finite = (value) => Number.isFinite(value) && value >= 0;
// Python round() (crop.py) rounds an exact half to the even integer.
const pixelRound = (value) => {
  const floor = Math.floor(value);
  return value - floor === .5 ? floor + floor % 2 : Math.round(value);
};
const savedRange = (asset) => {
  const trim = asset?.trim;
  return trim && finite(trim.start) && finite(trim.end) && trim.end > trim.start
    ? { start: trim.start, end: trim.end }
    : { start: 0, end: finite(asset?.duration_s) && asset.duration_s > 0 ? asset.duration_s : null };
};

/** Saved takes remain previewable when unlocked or edited. A merged take has
 * no historical cut snapshot: showing its whole saved pass is more honest than
 * inventing old boundaries from today's durations (even a matching head stamp
 * does not cover followers). No queuedCards/normalization or state mutation. */
export function cardPreviewSource({ timeline, segment, index, pass = null, gone = null }) {
  const clip = S.isClip(segment);
  const owner = clip ? null : pass ?? S.passOf(timeline, index);
  const asset = clip ? segment : S.takeOn(owner?.segments[0] ?? segment);
  if (!asset?.filename || !String(asset.filename).trim() || gone?.has(asset.filename)) return null;
  return {
    filename: asset.filename,
    range: savedRange(asset),
    crop: asset.crop ? { ...asset.crop } : null,
    width: asset.width, height: asset.height,
    hasAudio: asset.has_audio !== false,
    shared: !clip && (owner?.segments.length ?? 1) > 1,
  };
}

/** crop.py's clockwise turn -> mirror -> fractional window, rounded on the
 * oriented source size. Invalid crops fall back to the complete frame. */
export function cardPreviewFraming(crop, width, height) {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const h = Math.max(1, Math.round(Number(height) || 1));
  let turn = Math.trunc(Number(crop?.turn) || 0);
  let mirror = String(crop?.mirror || "");
  let x = Number(crop?.x ?? 0), y = Number(crop?.y ?? 0), cw = Number(crop?.w ?? 1), ch = Number(crop?.h ?? 1);
  if (![0, 90, 180, 270].includes(turn) || !["", "h", "v", "hv"].includes(mirror)
      || ![x, y, cw, ch].every(Number.isFinite) || x < 0 || y < 0 || x >= 1 || y >= 1
      || cw < .01 || ch < .01 || x + cw > 1 + 1e-6 || y + ch > 1 + 1e-6) {
    turn = 0; mirror = ""; x = 0; y = 0; cw = 1; ch = 1;
  }
  const orientedWidth = turn % 180 ? h : w;
  const orientedHeight = turn % 180 ? w : h;
  const left = Math.min(orientedWidth - 1, pixelRound(x * orientedWidth));
  const top = Math.min(orientedHeight - 1, pixelRound(y * orientedHeight));
  const right = Math.min(orientedWidth, Math.max(left + 1, pixelRound((x + cw) * orientedWidth)));
  const bottom = Math.min(orientedHeight, Math.max(top + 1, pixelRound((y + ch) * orientedHeight)));
  return { turn, mirror, orientedWidth, orientedHeight, left, top,
    width: right - left, height: bottom - top };
}

export function pauseCardPreviews() {
  for (const player of players) player.pause();
}

function watchPlayers() {
  if (lifecycle || !players.size) return;
  const play = (event) => {
    if (!(event.target instanceof HTMLMediaElement)) return;
    const emitter = [...players].find((player) => player.media === event.target);
    // A late native play from a stopped/suspended owner must not interrupt
    // the newer player before its own media listener can reject the event.
    if (emitter && !emitter.currentPlaybackAllowed()) { emitter.pause(); return; }
    for (const player of players) if (player.media !== event.target) player.pause();
  };
  const visible = () => { if (document.hidden) pauseCardPreviews(); };
  const observer = new MutationObserver(() => {
    for (const player of [...players]) player.checkMount();
  });
  document.addEventListener("play", play, true);
  document.addEventListener("visibilitychange", visible);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  lifecycle = () => {
    observer.disconnect();
    document.removeEventListener("play", play, true);
    document.removeEventListener("visibilitychange", visible);
    lifecycle = null;
  };
}

/** One player, shared by inline cards and the optional framed large viewer.
 * Inline playback needs the pointer inside its preview. The large viewer's
 * hover:false controls allow explicit keyboard/click playback instead. */
export function createCardPreview(source, {
  key = null, label = "", hover = true, onOpen = null, onError = null,
} = {}) {
  let destroyed = false, suspended = false, hovered = false, mounted = false, intersecting = true;
  let frame = null, failed = false, blockedAudio = false, playEpoch = 0;
  let pendingPlay = null, playWanted = false;
  const rememberedVolume = key != null ? cardVolumes.get(key) : null;
  let volume = source.hasAudio === false || rememberedVolume?.filename !== source.filename
    ? 0 : rememberedVolume.volume;
  let volumePopover = null, volumeSlider = null, volumeRead = null, volumeClose = null;
  let volumePointerMove = null, volumeWasOpenOnPointerDown = false;
  let start = source.range?.start ?? 0, end = source.range?.end ?? null;
  const listeners = [];
  const listen = (node, name, handler) => {
    node.addEventListener(name, handler);
    listeners.push(() => node.removeEventListener(name, handler));
  };
  const media = el("video", { class: "mmc-card-preview-media", playsinline: true,
    preload: "metadata", src: viewUrl(source.filename), "aria-hidden": "true", tabindex: "-1" });
  const canvas = el("canvas", { class: "mmc-card-preview-frame", "aria-hidden": "true" });
  const oriented = document.createElement("canvas");
  const status = el("div", { class: "mmc-card-preview-status", role: "status", hidden: true });
  const hint = onOpen
    ? t("Hover to preview this card. Double-click or press Enter for a larger preview.")
    : label || t("Ready preview");
  const stage = el("div", { class: "mmc-card-preview-stage", tabindex: "0", role: "button",
    "aria-label": hint, ...(hover ? {} : { title: hint }) }, [media, canvas]);
  const play = el("button", { class: "mmc-card-preview-play", type: "button", text: "▶",
    title: t("Play"), "aria-label": t("Play") });
  const scrub = el("input", { class: "mmc-card-preview-scrub", type: "range", min: "0", max: "1",
    step: ".001", value: "0", disabled: true, "aria-label": t("Preview position") });
  const clock = el("span", { class: "mmc-card-preview-clock", text: "0:00" });
  const mute = el("button", { class: "mmc-card-preview-mute", type: "button",
    disabled: source.hasAudio === false, "aria-expanded": "false", "aria-haspopup": "true" });
  const root = el("div", { class: "mmc-card-preview", "aria-label": label }, [
    ...(source.shared ? [el("div", { class: "mmc-card-preview-shared",
      text: t("Shared generated pass preview") })] : []),
    stage, status, el("div", { class: "mmc-card-preview-controls" }, [play, scrub, clock, mute]),
  ]);
  const seconds = (value) => `${Math.floor(Math.max(0, value) / 60)}:${String(Math.floor(Math.max(0, value) % 60)).padStart(2, "0")}`;
  const syncVolume = ({ playing = !media.paused } = {}) => {
    media.volume = volume;
    media.muted = volume === 0 || blockedAudio || source.hasAudio === false
      || !playing || !usable() || hover && !hovered;
    mute.textContent = volume === 0 || blockedAudio || source.hasAudio === false ? "🔇" : "🔊";
    const percent = Math.round(volume * 100);
    const text = source.hasAudio === false ? t("silent")
      : t("Preview volume: {percent}%", { percent });
    mute.title = text; mute.setAttribute("aria-label", text);
    if (volumeSlider) {
      volumeSlider.value = String(percent);
      volumeSlider.setAttribute("aria-valuetext", `${percent}%`);
      volumeRead.textContent = `${percent}%`;
    }
  };
  const syncTime = () => {
    const length = end == null ? 0 : Math.max(0, end - start);
    const at = Math.max(0, Math.min(length, (Number(media.currentTime) || 0) - start));
    scrub.value = String(at); scrub.max = String(length || 1);
    scrub.setAttribute("aria-valuetext", `${at.toFixed(2)} / ${length.toFixed(2)} s`);
    clock.textContent = `${seconds(at)} / ${seconds(length)}`;
  };
  const draw = () => {
    if (destroyed || !media.videoWidth || media.readyState < 2) return;
    const box = cardPreviewFraming(source.crop, media.videoWidth, media.videoHeight);
    const scale = Math.min(1, (hover ? 640 : 1600) / Math.max(box.orientedWidth, box.orientedHeight));
    const ow = Math.max(1, Math.round(box.orientedWidth * scale));
    const oh = Math.max(1, Math.round(box.orientedHeight * scale));
    if (oriented.width !== ow) oriented.width = ow;
    if (oriented.height !== oh) oriented.height = oh;
    const ctx = oriented.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ow, oh);
    if (box.mirror.includes("h")) { ctx.translate(ow, 0); ctx.scale(-1, 1); }
    if (box.mirror.includes("v")) { ctx.translate(0, oh); ctx.scale(1, -1); }
    if (box.turn === 90) { ctx.translate(ow, 0); ctx.rotate(Math.PI / 2); }
    else if (box.turn === 180) { ctx.translate(ow, oh); ctx.rotate(Math.PI); }
    else if (box.turn === 270) { ctx.translate(0, oh); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(media, 0, 0, media.videoWidth * scale, media.videoHeight * scale);
    const width = Math.max(1, Math.round(box.width * scale));
    const height = Math.max(1, Math.round(box.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.getContext("2d").drawImage(oriented, box.left * scale, box.top * scale,
      box.width * scale, box.height * scale, 0, 0, width, height);
    stage.style.aspectRatio = `${box.width} / ${box.height}`;
    root.classList.toggle("mmc-card-preview-portrait", box.height > box.width);
    root.classList.toggle("mmc-card-preview-wide", box.width / box.height >= 2.1);
  };
  const usable = () => !destroyed && !suspended && !failed && root.isConnected
    && intersecting && !document.hidden && !root.closest("[hidden]") && root.getClientRects().length > 0
    && (root.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
  const pause = () => {
    playEpoch += 1; pendingPlay = null; playWanted = false;
    media.pause(); media.muted = true; cancelAnimationFrame(frame); frame = null;
    play.textContent = "▶"; play.title = t("Play"); play.setAttribute("aria-label", t("Play"));
    if (!usable()) volumeClose?.();
  };
  const tick = () => {
    frame = null;
    if (!usable()) { pause(); return; }
    if (!media.paused && end != null && media.currentTime >= end - .015) {
      pause(); media.currentTime = start; syncTime(); draw(); return;
    }
    draw(); syncTime();
    if (!media.paused) frame = requestAnimationFrame(tick);
  };
  const requestPlay = async () => {
    if (!usable() || scrub.disabled || hover && !hovered) return;
    controller.refreshVolume({ playing: true });
    playWanted = true;
    // Slider changes still update volume while a native play promise is
    // pending. Only one request owns the current epoch, without duplicate play.
    if (pendingPlay === playEpoch) return;
    const epoch = ++playEpoch;
    pendingPlay = epoch;
    const wanted = () => playWanted && usable() && (!hover || hovered);
    try {
      for (const other of document.querySelectorAll(".mmc-card-preview-media, .mmc-stage video, .mmc-reference-preview-stage video, .mmc-reference-preview-stage audio")) {
        if (other !== media) other.pause();
      }
      if (media.currentTime < start || end != null && media.currentTime >= end - .015) media.currentTime = start;
      try { await media.play(); }
      catch {
        if (!wanted()) { pause(); return; }
        if (epoch !== playEpoch) return;
        // A rejected audible attempt falls back to muted playback. The icon
        // never unlocks audio: only another deliberate volume-slider input can.
        blockedAudio = true; syncVolume({ playing: true });
        status.textContent = t("Set preview volume above 0% to allow audio."); status.hidden = false;
        try { await media.play(); }
        catch {
          if (epoch === playEpoch || !wanted()) pause();
          return;
        }
      }
      // An obsolete completion cannot pause a newer, still-wanted request.
      // An explicit stop or lost hover/lifecycle must remain silent instead.
      if (!wanted()) pause();
    } finally {
      if (pendingPlay === epoch) pendingPlay = null;
    }
  };
  const toggle = () => media.paused && pendingPlay == null ? requestPlay() : pause();
  const error = () => {
    failed = true; pause(); play.disabled = true; scrub.disabled = true; mute.disabled = true;
    status.textContent = t("Preview unavailable. The file may be missing, or this browser may not support its format.");
    status.hidden = false; onError?.();
  };
  const controller = {
    root, media, key,
    currentPlaybackAllowed() { return playWanted && usable() && (!hover || hovered); },
    pause() { volumeClose?.(); pause(); },
    refreshVolume(options) {
      if (source.hasAudio === false) volume = 0;
      else if (key != null && cardVolumes.has(key)) {
        const remembered = cardVolumes.get(key);
        volume = remembered.filename === source.filename ? remembered.volume : 0;
      }
      syncVolume(options);
    },
    suspend() { suspended = true; hovered = false; pause(); },
    resume() { suspended = false; hovered = false; },
    checkMount() {
      if (root.isConnected) mounted = true;
      else if (mounted) controller.destroy();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; pause(); listeners.splice(0).forEach((off) => off());
      intersection?.disconnect(); players.delete(controller);
      media.onerror = null; media.removeAttribute("src"); media.load();
      root.remove();
      if (!players.size) lifecycle?.();
    },
  };
  const intersection = typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => {
    intersecting = entries.every((entry) => entry.isIntersecting);
    if (!intersecting) { hovered = false; pause(); }
  }) : null;
  intersection?.observe(root);
  listen(root, "pointerdown", (event) => event.stopPropagation());
  listen(root, "click", (event) => event.stopPropagation());
  listen(root, "dblclick", (event) => event.stopPropagation());
  // The portal and its tiny anchor-to-popup gap are part of this preview's
  // hover area. No timer keeps audio playing after the pointer leaves it.
  const pointerInVolume = (event) => {
    if (!volumePopover) return false;
    if (volumePopover.contains(event.relatedTarget)) return true;
    const pop = volumePopover.getBoundingClientRect(), anchor = mute.getBoundingClientRect();
    const x = event.clientX, y = event.clientY;
    const inPop = x >= pop.left && x <= pop.right && y >= pop.top && y <= pop.bottom;
    const bridgeTop = Math.min(pop.bottom, anchor.bottom), bridgeBottom = Math.max(pop.top, anchor.top);
    const inBridge = x >= Math.max(pop.left, anchor.left) && x <= Math.min(pop.right, anchor.right)
      && y >= bridgeTop && y <= bridgeBottom;
    return inPop || inBridge;
  };
  const openVolume = () => {
    if (destroyed || suspended || failed || source.hasAudio === false || !usable()) return;
    const id = `mmc-preview-volume-${++volumeSequence}`;
    volumeSlider = el("input", { class: "mmc-card-preview-volume-slider", type: "range",
      min: "0", max: "100", step: "1", value: String(Math.round(volume * 100)), orient: "vertical",
      "aria-label": t("Preview volume"), "aria-orientation": "vertical" });
    volumeRead = el("output", { class: "mmc-card-preview-volume-read",
      text: `${Math.round(volume * 100)}%`, "aria-hidden": "true" });
    volumePopover = el("div", { class: "mmc-pop mmc-card-preview-volume-pop", id,
      role: "group", "aria-label": t("Preview volume") }, [volumeRead, volumeSlider]);
    const pop = volumePopover, slider = volumeSlider;
    const input = () => {
      const percent = Math.max(0, Math.min(100, Math.round(Number(slider.value) || 0)));
      volume = percent / 100; blockedAudio = false;
      if (key != null) {
        cardVolumes.set(key, { filename: source.filename, volume });
        if (cardVolumes.size > 512) cardVolumes.delete(cardVolumes.keys().next().value);
        for (const other of players) if (other !== controller && other.key === key) other.refreshVolume();
      }
      syncVolume(); status.hidden = true;
      if (hover && hovered && media.paused) requestPlay();
    };
    slider.addEventListener("input", input);
    const stopPointer = (event) => event.stopPropagation();
    pop.addEventListener("pointerdown", stopPointer);
    pop.addEventListener("click", stopPointer);
    const rangeKey = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
        event.stopPropagation(); // Keep native range keys away from the graph.
      }
    };
    pop.addEventListener("keydown", rangeKey);
    pop.addEventListener("keyup", rangeKey);
    volumePointerMove = (event) => {
      if (!hover) return;
      const box = root.getBoundingClientRect();
      const inside = event.clientX >= box.left && event.clientX <= box.right
        && event.clientY >= box.top && event.clientY <= box.bottom || pointerInVolume(event);
      if (inside && usable()) {
        if (!hovered) { hovered = true; requestPlay(); }
      } else if (hovered) { hovered = false; pause(); }
    };
    document.addEventListener("pointermove", volumePointerMove, true);
    let returnFocus = false;
    const escape = (event) => {
      if (event.key !== "Escape" || volumePopover !== pop) return;
      returnFocus = pop.contains(document.activeElement);
      // Answer immediately: dismissable defers its shared listeners so the
      // opening gesture cannot dismiss it, but Escape must work in that gap.
      event.preventDefault(); event.stopImmediatePropagation(); volumeClose?.();
    };
    const moved = (event) => { if (!(event.target instanceof Node) || !pop.contains(event.target)) volumeClose?.(); };
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    document.body.appendChild(pop);
    mute.setAttribute("aria-expanded", "true"); mute.setAttribute("aria-controls", id);
    volumeClose = dismissable(pop, () => {
      document.removeEventListener("pointermove", volumePointerMove, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
      slider.removeEventListener("input", input);
      pop.removeEventListener("pointerdown", stopPointer); pop.removeEventListener("click", stopPointer);
      pop.removeEventListener("keydown", rangeKey); pop.removeEventListener("keyup", rangeKey);
      volumePopover = null; volumeSlider = null; volumeRead = null; volumeClose = null; volumePointerMove = null;
      mute.setAttribute("aria-expanded", "false"); mute.removeAttribute("aria-controls");
      if (hover && !root.matches(":hover")) { hovered = false; pause(); }
      if (returnFocus && !destroyed && mute.isConnected) mute.focus({ preventScroll: true });
    });
    placeNear(pop, mute);
    syncVolume();
    slider.focus({ preventScroll: true });
  };
  // Runs before dismissable's deferred outside listener. A second pointer click
  // on the icon must close rather than immediately reopen the dismissed portal.
  const anchorPointerDown = (event) => {
    if (mute.contains(event.target)) volumeWasOpenOnPointerDown = Boolean(volumePopover);
  };
  document.addEventListener("pointerdown", anchorPointerDown, true);
  listeners.push(() => document.removeEventListener("pointerdown", anchorPointerDown, true));
  if (hover) {
    listen(root, "pointerenter", () => { hovered = true; requestPlay(); });
    listen(root, "pointerleave", (event) => {
      if (pointerInVolume(event)) return;
      hovered = false; pause();
    });
  }
  listen(stage, "dblclick", (event) => {
    event.preventDefault(); event.stopPropagation();
    if (onOpen) { controller.suspend(); pauseCardPreviews(); onOpen(controller); }
  });
  listen(stage, "keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault(); event.stopPropagation();
    if (event.repeat) return;
    if (event.key === "Enter" && onOpen) { controller.suspend(); pauseCardPreviews(); onOpen(controller); }
    else if (hover && !hovered && onOpen) { controller.suspend(); pauseCardPreviews(); onOpen(controller); }
    else toggle();
  });
  listen(play, "click", toggle);
  listen(mute, "click", (event) => {
    if (event.detail > 0 && volumeWasOpenOnPointerDown) {
      volumeWasOpenOnPointerDown = false; volumeClose?.(); return;
    }
    volumeWasOpenOnPointerDown = false;
    if (volumePopover) volumeClose?.(); else openVolume();
  });
  listen(scrub, "input", () => {
    if (scrub.disabled) return;
    media.currentTime = Math.min(end ?? Infinity, start + Number(scrub.value));
    syncTime(); draw();
  });
  listen(media, "loadedmetadata", () => {
    if (!Number.isFinite(media.duration) || media.duration <= 0) { error(); return; }
    start = Math.max(0, Math.min(media.duration, source.range?.start ?? 0));
    end = Math.min(media.duration, source.range?.end ?? media.duration);
    if (end <= start) { error(); return; }
    scrub.disabled = false; media.currentTime = start; syncTime();
    const box = cardPreviewFraming(source.crop, media.videoWidth, media.videoHeight);
    stage.style.aspectRatio = `${box.width} / ${box.height}`;
    root.classList.toggle("mmc-card-preview-portrait", box.height > box.width);
    root.classList.toggle("mmc-card-preview-wide", box.width / box.height >= 2.1);
    if (hovered) requestPlay();
  });
  listen(media, "loadeddata", draw); listen(media, "seeked", draw);
  listen(media, "timeupdate", () => { syncTime(); if (!media.paused && end != null && media.currentTime >= end) tick(); });
  listen(media, "play", () => {
    if (!playWanted || !usable() || hover && !hovered) { pause(); return; }
    syncVolume();
    play.textContent = "Ⅱ"; play.title = t("Pause"); play.setAttribute("aria-label", t("Pause"));
    cancelAnimationFrame(frame); frame = requestAnimationFrame(tick);
  });
  listen(media, "pause", () => { cancelAnimationFrame(frame); frame = null;
    play.textContent = "▶"; play.title = t("Play"); play.setAttribute("aria-label", t("Play")); });
  listen(media, "ended", () => { pause(); syncTime(); });
  media.onerror = error;
  syncVolume();
  const box = cardPreviewFraming(source.crop, source.width, source.height);
  stage.style.aspectRatio = source.width && source.height ? `${box.width} / ${box.height}` : "16 / 9";
  root.classList.toggle("mmc-card-preview-portrait", Boolean(source.width && source.height) && box.height > box.width);
  root.classList.toggle("mmc-card-preview-wide", Boolean(source.width && source.height) && box.width / box.height >= 2.1);
  players.add(controller); watchPlayers();
  return controller;
}
