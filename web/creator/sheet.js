// A separate workspace over the installed Builder, never its canvas-mounted panel.
import { api } from "../../../scripts/api.js";
import { el, icon, mountOverlay } from "./dom.js";
import { openPicker } from "./picker.js";
import { upload, viewUrl } from "./api.js";
import { follow, cancelPrompt } from "./queue.js";
import { st } from "./sheet-locales.js";
import { SHEET_PROMPT_GUIDE, SHEET_PROMPT_EXAMPLES, applySheetPrompt, sheetPromptValues } from "./sheet-prompt-data.js";
import { openSheetPrompts, saveSheetPromptRecord } from "./sheet-prompts.js";
import { SheetStudio } from "./sheet-studio.js";
import { copySheet, sheetState, fillSheetDefaults, applySheetPreset, sheetFile,
         sheetCastFile, rememberSheetRun } from "./sheet-support.js";

let opened = null;
const GROUPS = { image: ["pictures", "imageFile"], video: ["videos", "videoFile"], audio: ["audios", "audioFile"] };
const MODEL_LABELS = { model: "Diffusion model", clip: "Text encoder", video_vae: "Video VAE", audio_vae: "Audio VAE" };
const KNOB_LABELS = { cell_size: "Cell size", cell_aspect: "Cell shape", frames_per_cell: "Frames",
  steps: "Steps", sampler_name: "Sampler", scheduler: "Scheduler", seed: "Seed",
  shift_video: "Shift video", shift_audio: "Shift audio", ref_image_size: "Reference size",
  ref_scope: "Reference scope", sheet_layout: "Layout", sheet_columns: "Columns",
  sheet_aspect: "Sheet aspect", sheet_short_edge: "Sheet size (custom)", sheet_fit: "Fit",
  sheet_captions: "Captions", keep_frames: "Keep frames", single_pass: "One pass",
  continuity: "Continuity", export_video: "Keep generated clips" };

async function request(path, body) {
  const response = await api.fetchApi(path, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  let answer;
  try { answer = await response.json(); }
  catch {
    const error = new Error(response.ok ? st("Builder returned an invalid response.") : st("Request failed ({status})", { status: response.status }));
    error.status = response.status;
    error.path = path;
    throw error;
  }
  if (!response.ok || answer.ok === false) {
    const error = new Error(answer.error ? st(answer.error) : st("Request failed ({status})", { status: response.status }));
    error.status = response.status;
    error.path = path;
    throw error;
  }
  return answer;
}

function button(text, onclick, primary = false) {
  return el("button", { class: `mmc-sheet-button${primary ? " primary" : ""}`, text: st(text), onclick });
}

function field(label, control, wide = false) {
  return el("label", { class: `mmc-sheet-field${wide ? " wide" : ""}` }, [el("span", { text: st(label) }), control]);
}

function textInput(value, changed, { multiline = false, placeholder = "" } = {}) {
  const input = el(multiline ? "textarea" : "input", {
    ...(multiline ? { rows: 3 } : { type: "text" }), placeholder: st(placeholder),
    oninput: () => changed(input.value),
  });
  input.value = value ?? "";
  return input;
}

function selectInput(values, value, changed) {
  const select = el("select", { onchange: () => changed(select.value) });
  for (const row of values) {
    const [key, label] = Array.isArray(row) ? row : [row, row];
    select.appendChild(el("option", { value: String(key), text: st(String(label)) }));
  }
  if (value !== undefined && !values.some((row) => String(Array.isArray(row) ? row[0] : row) === String(value))) {
    select.appendChild(el("option", { value: String(value), text: String(value) }));
  }
  select.value = String(value ?? "");
  return select;
}

function installStyles() {
  if (document.getElementById("mmc-sheet-style")) return;
  document.head.appendChild(el("style", { id: "mmc-sheet-style", text: `
.mmc-sheet-overlay { color:var(--fg-color,#ddd); background:rgba(0,0,0,.68); display:flex; align-items:center; justify-content:center; padding:16px; }
.mmc-sheet-room { display:flex; flex-direction:column; width:min(1500px,96vw); height:94vh; border:1px solid #454545; border-radius:18px; background:var(--comfy-menu-bg,#1c1c1c); box-shadow:0 18px 70px #0009; font:13px/1.5 sans-serif; }
.mmc-sheet-head { display:flex; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid #393939; flex:none; }
.mmc-sheet-head h2 { margin:0; font-size:17px; flex:1; }
.mmc-sheet-head .mmc-close { border:0; border-radius:50%; width:34px; height:34px; color:inherit; background:#ffffff09; cursor:pointer; }
.mmc-sheet-content { display:grid; grid-template-columns:minmax(340px,.95fr) minmax(400px,1.15fr); min-height:0; flex:1; }
/* This is the full sheet workspace, not a small modal. Its two work areas can scroll. */
.mmc-sheet-form,.mmc-sheet-results { overflow:auto; min-width:0; min-height:0; padding:20px; }
.mmc-sheet-form { border-right:1px solid #393939; }
.mmc-sheet-card { background:#ffffff06; border:1px solid #444; border-radius:14px; padding:16px; margin-bottom:18px; }
.mmc-sheet-card h3 { margin:0 0 12px; font-size:14px; }
.mmc-sheet-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.mmc-sheet-field { display:flex; flex-direction:column; gap:5px; min-width:0; color:#aaa; }
.mmc-sheet-field.wide { grid-column:1/-1; }
.mmc-sheet-field-head { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.mmc-sheet-field-head .mmc-sheet-button { padding:3px 9px; font-size:11px; }
.mmc-sheet-field-head .mmc-sheet-help-button { border-radius:50%; width:22px; height:22px; padding:0; }
.mmc-sheet-prompt-edit { grid-column:1/-1; padding:12px; background:#563c1d55; border:1px solid #9e7029; border-radius:12px; }
.mmc-sheet-prompt-edit .mmc-sheet-note { margin:8px 0; font-size:12px; }
.mmc-sheet-small.mmc-sheet-help { width:min(1340px,calc(100vw - 32px)); box-sizing:border-box; font-size:12px; line-height:1.35; padding:16px 20px; }
.mmc-sheet-help h3 { margin-bottom:8px; }
.mmc-sheet-help-guide { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; margin-bottom:10px; }
.mmc-sheet-help-guide p { margin:3px 0 0; color:#aaa; }
.mmc-sheet-help-guide strong { color:#e8b564; }
.mmc-sheet-help .mmc-sheet-note { margin-bottom:8px; font-size:11px; }
.mmc-sheet-help table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:11.5px; line-height:1.3; margin-bottom:10px; }
.mmc-sheet-help th,.mmc-sheet-help td { text-align:left; vertical-align:top; padding:4px 8px; border-bottom:1px solid #393939; overflow-wrap:anywhere; }
.mmc-sheet-help th:first-child { width:13%; }
.mmc-sheet-help th:nth-child(2) { width:45%; }
.mmc-sheet-help th { color:#aaa; font-weight:normal; }
.mmc-sheet-help td:first-child { color:#e8b564; }
@media(max-height:780px) { .mmc-sheet-small.mmc-sheet-help { font-size:11px; padding:12px 16px; } .mmc-sheet-help table { font-size:10.5px; } .mmc-sheet-help th,.mmc-sheet-help td { padding:3px 6px; } .mmc-sheet-help-guide { gap:5px 12px; } }
.mmc-sheet-room input,.mmc-sheet-room textarea,.mmc-sheet-room select,.mmc-sheet-small input,.mmc-sheet-small select { box-sizing:border-box; min-width:0; width:100%; background:#181818; color:#ddd; border:1px solid #4a4a4a; border-radius:8px; padding:8px 10px; font:inherit; }
.mmc-sheet-room textarea { resize:vertical; }
.mmc-sheet-room input[type=checkbox],.mmc-sheet-small input[type=checkbox] { width:auto; accent-color:#eca538; }
.mmc-sheet-buttons { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.mmc-sheet-button { border:1px solid #4c4c4c; border-radius:999px; padding:7px 12px; background:#282828; color:inherit; font:inherit; cursor:pointer; white-space:nowrap; }
.mmc-sheet-button.primary { border-color:#b07c2d; color:#ffc776; background:#5c401b; }
.mmc-sheet-button:disabled { opacity:.4; cursor:default; }
.mmc-sheet-note { color:#aaa; margin:0 0 14px; }
.mmc-sheet-status { flex:1; color:#ccc; overflow-wrap:anywhere; }
.mmc-sheet-foot { padding:14px 20px; display:flex; gap:12px; align-items:center; border-top:1px solid #393939; flex:none; }
.mmc-sheet-error { color:#ffaaaa; }
.mmc-sheet-ticks { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:14px; }
.mmc-sheet-tick { display:flex; align-items:center; gap:5px; padding:5px 9px; border:1px solid #444; border-radius:999px; cursor:pointer; }
.mmc-sheet-tick:has(input:checked) { border-color:#9e7029; background:#563c1d; }
.mmc-sheet-cells { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
.mmc-sheet-cell { background:#151515; border:1px solid #444; border-radius:9px; padding:8px; min-width:0; }
.mmc-sheet-cell .mmc-sheet-button { padding:3px 8px; font-size:11px; }
.mmc-sheet-cell img { width:100%; height:120px; object-fit:contain; }
.mmc-sheet-cell-name { color:#bbb; font-size:12px; overflow-wrap:anywhere; margin:5px 0; }
.mmc-sheet-reference { display:grid; grid-template-columns:66px minmax(0,1fr) auto; gap:10px; align-items:center; background:#191919; border:1px solid #444; border-radius:10px; padding:10px; margin-bottom:10px; }
.mmc-sheet-reference img,.mmc-sheet-reference video { width:66px; height:66px; object-fit:contain; border-radius:8px; }
.mmc-sheet-reference .mmc-sheet-ref-name { display:block; color:#aaa; overflow-wrap:anywhere; font-size:11px; margin-bottom:5px; }
.mmc-sheet-preview { width:100%; max-height:55vh; object-fit:contain; border-radius:10px; background:#111; display:block; margin-bottom:12px; }
.mmc-sheet-result-head { display:flex; align-items:center; gap:8px; margin-bottom:10px; overflow-wrap:anywhere; }
.mmc-sheet-result-head strong { flex:1; }
.mmc-sheet-check { display:flex; align-items:center; gap:6px; }
.mmc-sheet-history { margin-bottom:14px; }
.mmc-sheet-advanced { margin-top:12px; }
.mmc-sheet-advanced summary { cursor:pointer; color:#d6b57d; padding:5px 0; }
.mmc-sheet-small { width:min(600px,calc(100vw - 32px)); height:auto; max-height:none; overflow:visible; border:1px solid #494949; border-radius:16px; padding:20px; background:var(--comfy-menu-bg,#1c1c1c); box-shadow:0 18px 70px #0009; font:13px/1.5 sans-serif; }
.mmc-sheet-small h3 { margin:0 0 12px; font-size:16px; }
.mmc-sheet-small .mmc-sheet-grid { margin-bottom:18px; }
.mmc-sheet-small .mmc-sheet-preview { max-height:min(32vh,250px); }
.mmc-sheet-warning .mmc-sheet-room { height:auto; width:min(640px,94vw); }
.mmc-sheet-warning .mmc-sheet-content { display:block; }
.mmc-sheet-warning .mmc-sheet-form { overflow:visible; border:0; }
.mmc-sheet-warning .mmc-sheet-results,.mmc-sheet-warning .mmc-sheet-foot { display:none; }
@media(max-width:900px) { .mmc-sheet-content { grid-template-columns:1fr; overflow:auto; } .mmc-sheet-form,.mmc-sheet-results { overflow:visible; min-height:auto; } .mmc-sheet-form { border-right:0; border-bottom:1px solid #393939; } }
` }));
}

export function openSheet({ node, peer = null } = {}) {
  if (!node) return;
  opened?.close();
  const room = new SheetRoom(node, peer);
  opened = room;
  room.mount();
  return room;
}

class SheetRoom {
  constructor(node, peer) {
    this.node = node;
    this.peer = peer;
    node.properties ??= {};
    this.state = sheetState(node.properties);
    this.closed = false;
    this.resultVersion = 0;
    this.selected = new Map();
    this.sheets = [];
    this.following = null;
    this.smallWindows = new Set();
  }

  commit() { this.node.graph?.setDirtyCanvas(true, true); }
  ownerLive() {
    const graph = this.node.graph;
    if (!graph) return false;
    if (typeof graph.getNodeById === "function") return graph.getNodeById(this.node.id) === this.node;
    return !Array.isArray(graph._nodes) || graph._nodes.includes(this.node);
  }
  ownsState() { return this.ownerLive() && this.node.properties?.continuity_sheet === this.state; }
  alive() { return !this.closed && this.ownsState(); }
  action(action, body = {}) { return request(`${this.capabilities.builder_base}/action`, { action, ...body }); }
  status(text, error = false) {
    if (!this.alive()) return;
    this.statusLine.textContent = st(text);
    this.statusLine.classList.toggle("mmc-sheet-error", error);
  }

  mount() {
    installStyles();
    this.form = el("div", { class: "mmc-sheet-form" }, [el("p", { text: st("Loading Builder…") })]);
    this.results = el("div", { class: "mmc-sheet-results" });
    this.statusLine = el("span", { class: "mmc-sheet-status" });
    this.generateButton = button("Generate sheet", () => this.generate(), true);
    this.generateButton.disabled = true;
    this.cancelButton = button("Cancel sheet job", () => this.cancel());
    this.cancelButton.hidden = true;
    this.content = el("div", { class: "mmc-sheet-content" }, [this.form, this.results]);
    this.overlay = el("div", { class: "mmc-overlay mmc-sheet-overlay" }, [
      el("section", { class: "mmc-sheet-room", role: "dialog", "aria-modal": true, "aria-label": st("Character sheets") }, [
        el("header", { class: "mmc-sheet-head" }, [icon("gallery"), el("h2", { text: st("Character sheets") }),
          button("Help", () => this.help()),
          el("button", { class: "mmc-close", text: "✕", title: st("Close"), onclick: () => this.close() })]),
        this.content,
        el("footer", { class: "mmc-sheet-foot" }, [this.statusLine, this.cancelButton, this.generateButton]),
      ]),
    ]);
    this.unmount = mountOverlay(this.overlay, () => this.close());
    this.load().catch((error) => {
      if (!this.alive()) return;
      this.warning(error.status === 404 && error.path === "/continuity/sheet/capabilities"
        ? st("Restart ComfyUI to activate the sheet integration.") : st(error.message));
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.resultVersion++;
    this.following?.abandon();
    this.following = null;
    this.studio?.close();
    for (const close of [...this.smallWindows]) close();
    this.unmount?.();
    if (opened === this) opened = null;
  }

  warning(message) {
    this.overlay.classList.add("mmc-sheet-warning");
    this.form.replaceChildren(el("p", { class: "mmc-sheet-error", text: message }),
      el("p", { class: "mmc-sheet-note", text: st("No changes to your regular PreStage settings.") }),
      el("div", { class: "mmc-sheet-buttons" }, [button("Close", () => this.close())]));
  }

  async load() {
    const cap = await request("/continuity/sheet/capabilities");
    if (!this.alive()) return;
    this.capabilities = cap;
    if (!cap.installed || !cap.available) {
      const messages = {
        builder_missing: "Builder is not installed. Install and restart ComfyUI to use sheets.",
        builder_incompatible: "This Builder version is incompatible with the sheet integration. Update the integration or use the Builder node directly.",
        builder_routes_missing: "Builder routes are unavailable. Check its startup errors and restart ComfyUI.",
        nodes_missing: "Required H3 nodes are missing. Update ComfyUI and restart.",
      };
      const reason = st(messages[cap.reason] ?? "Builder could not be loaded. Check ComfyUI startup errors and restart.");
      this.warning(`${reason}${cap.missing_nodes?.length ? ` (${cap.missing_nodes.join(", ")})` : ""}`);
      return;
    }
    if (!cap.builder_core_url) throw new Error(st("Unsupported Builder schema."));
    const coreUrl = new URL(api.fileURL(cap.builder_core_url), location.href);
    if (coreUrl.origin !== location.origin) throw new Error(st("Unsupported Builder schema."));
    this.core = await import(/* @vite-ignore */ coreUrl.href);
    if (!this.alive()) return;
    for (const name of ["VIEWS", "POSES", "EXPRESSIONS", "defaultCells", "buildCells", "readState"]) {
      if ((name.endsWith("S") && !Array.isArray(this.core[name]))
          || (!name.endsWith("S") && typeof this.core[name] !== "function")) throw new Error(st("Unsupported Builder schema."));
    }
    const [presetAnswer, knobAnswer] = await Promise.all([this.action("presets"), this.action("knobs")]);
    if (!this.alive()) return;
    fillSheetDefaults(this.state, cap);
    this.presets = presetAnswer.presets ?? [];
    // Only sizes published by the installed backend, not the core's legacy fallback.
    this.resolutions = (presetAnswer.resolutions ?? []).filter((row) => row.key
      && Number.isFinite(Number(row.sheetShortEdge)) && Number(row.sheetShortEdge) > 0
      && Number.isFinite(Number(row.cellShortEdge)) && Number(row.cellShortEdge) > 0);
    this.knobs = knobAnswer.knobs ?? [];
    const fresh = !this.state.initialized;
    if (fresh) {
      const quality = this.presets.find((item) => item.id === presetAnswer.default);
      const layout = this.presets.find((item) => item.id === presetAnswer.defaultLayout);
      if (quality) this.applyPreset(quality);
      if (layout) this.applyPreset(layout);
      if (!this.state.sheet_data.cells.length) this.state.sheet_data.cells = this.core.defaultCells();
      this.state.initialized = true;
      this.commit();
    }
    this.studio = new SheetStudio(this);
    this.renderForm();
    this.setRunning(Boolean(this.state.active));
    if (this.state.last_run) await this.loadResults(this.state.last_run);
    else this.renderResults();
    this.ready = true;
    if (this.alive() && this.state.active?.prompt_id && !this.following) await this.resumeJob();
    else this.status(st(this.state.active ? "Submitting sheet job…" : "Ready"));
  }

  applyPreset(preset) {
    if (this.state.active) return;
    applySheetPreset(this.state, preset);
    if (preset.build && Object.values(preset.build).some((values) => values?.length)) {
      const build = this.core.readState(this.state.sheet_data).build;
      this.state.sheet_data.cells = this.core.buildCells(build.views, build.poses, build.expressions);
    }
    this.commit();
  }

  syncResolution() {
    const key = this.resolutions?.length && typeof this.core.resolutionKeyFor === "function"
      ? this.core.resolutionKeyFor({ resolutions: this.resolutions }, this.state.settings) : "";
    this.state.sheet_data.render.resolution = key;
    return key;
  }

  showTab(key) { this.studio?.show(key); }

  card(title, contents, raw = false) { return el("section", { class: "mmc-sheet-card" }, [el("h3", { text: raw ? title : st(title) }), ...contents]); }
  change(fn) {
    if (!this.alive() || this.state.active) return;
    fn(); this.commit(); this.studio?.draftChanged();
  }

  renderForm() {
    const payload = this.state.sheet_data;
    const identityInput = textInput(payload.globalPrompt, (value) => this.change(() => { payload.globalPrompt = value; }), { multiline: true });
    identityInput.dataset.sheetField = "identity";
    identityInput.setAttribute("aria-label", st("Identity description"));
    const negativeInput = textInput(payload.negativePrompt, (value) => this.change(() => { payload.negativePrompt = value; }), { multiline: true });
    negativeInput.dataset.sheetField = "negative";
    negativeInput.setAttribute("aria-label", st("Negative prompt"));
    const promptButton = button("Prompt presets", () => this.promptPresets());
    const promptHelp = button("?", () => this.help());
    promptHelp.classList.add("mmc-sheet-help-button");
    promptHelp.title = promptHelp.ariaLabel = st("Prompt writing help");
    const identityField = el("div", { class: "mmc-sheet-field wide" }, [
      el("div", { class: "mmc-sheet-field-head" }, [el("span", { text: st("Identity description") }), promptButton, promptHelp]), identityInput,
    ]);
    const identity = this.card("Character", [el("div", { class: "mmc-sheet-grid" }, [
      field("Title", textInput(this.state.title, (value) => this.change(() => { this.state.title = value; })), true),
      identityField,
      field("Negative prompt", negativeInput, true),
      ...(this.promptEdit ? [this.promptEditControls()] : []),
    ])]);
    const models = this.card("Models", [el("div", { class: "mmc-sheet-grid" }, Object.entries(MODEL_LABELS).map(([key, label]) =>
      field(label, selectInput([["", "Select a model"], ...(this.capabilities.models[key] ?? []).map((name) => [name, name])],
        this.state.models[key], (value) => this.change(() => { this.state.models[key] = value; })))))]);
    const cells = this.renderCells();
    const refs = this.renderReferences();
    const settings = this.renderSettings();
    const loras = this.renderLoras();
    const advanced = this.renderAdvanced();
    this.studio.render({ identity, refs, cells, models, settings, loras, advanced });
  }

  ticks(choices, values, changed) {
    const selected = new Set(values);
    return el("div", { class: "mmc-sheet-ticks" }, choices.map(([key, label, raw]) => {
      const checkbox = el("input", { type: "checkbox", checked: selected.has(key), onchange: () => {
        if (this.state.active) return;
        if (checkbox.checked) selected.add(key); else selected.delete(key);
        changed(choices.filter(([choice]) => selected.has(choice)).map(([choice]) => choice));
      } });
      return el("label", { class: "mmc-sheet-tick" }, [checkbox, el("span", { text: raw ? label : st(label) })]);
    }));
  }

  renderCells() {
    const payload = this.state.sheet_data;
    const build = { ...(payload.build ?? {}), ...this.core.readState(payload).build };
    payload.build = build;
    const card = this.card("Cells", []);
    let selectionResult = el("div", {});
    const updateSelectionResult = () => {
      const preview = this.studio.selectionSummary(build, this.core.buildCells(build.views ?? [], build.poses ?? [], build.expressions ?? []));
      selectionResult.className = preview.className;
      selectionResult.replaceChildren(...Array.from(preview.childNodes));
    };
    const changed = (key, values) => {
      if (this.state.active) return;
      build[key] = values; this.commit(); this.studio?.draftChanged(); updateSelectionResult();
    };
    const poseBasedViews = this.core.VIEWS.filter(([key]) => ["front", "profile", "back"].includes(key));
    const expressionBasedViews = this.core.VIEWS.filter(([key]) => !["front", "profile", "back"].includes(key));
    const selectedViews = new Set(build.views ?? []);
    const updateViewGroup = (group, values) => {
      group.forEach(([key]) => selectedViews.delete(key));
      values.forEach((key) => selectedViews.add(key));
      changed("views", this.core.VIEWS.filter(([key]) => selectedViews.has(key)).map(([key]) => key));
    };
    card.appendChild(el("h4", { text: st("Framing") }));
    card.appendChild(el("h5", { text: st("Front, side and back views (combine with poses)") }));
    card.appendChild(this.studio.choices("views", poseBasedViews, build.views, (values) => updateViewGroup(poseBasedViews, values)));
    card.appendChild(el("hr", { class: "mmc-sheet-studio-divider" }));
    card.appendChild(el("h5", { text: st("Face, detail and other views (combine with expressions)") }));
    card.appendChild(this.studio.choices("views", expressionBasedViews, build.views, (values) => updateViewGroup(expressionBasedViews, values)));
    card.appendChild(el("hr", { class: "mmc-sheet-studio-divider" }));
    card.appendChild(el("h4", { text: st("Poses — for front, side and back views") }));
    card.appendChild(this.ticks(this.core.POSES, build.poses, (values) => changed("poses", values)));
    card.appendChild(el("h4", { text: st("Expressions — for face, detail and other views") }));
    card.appendChild(this.studio.choices("expressions", this.core.EXPRESSIONS, build.expressions, (values) => changed("expressions", values)));
    updateSelectionResult();
    card.appendChild(selectionResult);
    card.appendChild(el("div", { class: "mmc-sheet-buttons" }, [button("Build cells", () => {
      if (this.state.active) return;
      payload.cells = this.core.buildCells(build.views, build.poses, build.expressions);
      payload.render.suite = [];
      this.commit(); this.renderForm();
    }), el("span", { class: "mmc-sheet-context-note", text: st("Existing cells: {count}", { count: payload.cells.length }) })]));
    const list = el("div", { class: "mmc-sheet-cells", style: { marginTop: "12px" } });
    for (const [index, cell] of payload.cells.entries()) {
      const enabled = el("input", { type: "checkbox", checked: cell.enabled !== false, onchange: () => {
        this.change(() => { cell.enabled = enabled.checked; }); this.renderForm();
      } });
      const labelOf = (choices, key) => st(choices.find(([id]) => id === key)?.[1] ?? key ?? "");
      const extra = textInput(cell.extraPrompt, (value) => this.change(() => { cell.extraPrompt = value; }), { placeholder: "Cell instructions" });
      extra.dataset.sheetCellInstructions = index;
      list.appendChild(el("div", { class: "mmc-sheet-cell", "data-sheet-cell-detail": index }, [el("label", { class: "mmc-sheet-check" }, [enabled,
        el("span", { text: labelOf(this.core.VIEWS, cell.view) })]),
        el("div", { class: "mmc-sheet-cell-name", text: `${labelOf(this.core.POSES, cell.pose)} · ${labelOf(this.core.EXPRESSIONS, cell.expression)}` }),
        extra,
      ]));
    }
    const details = el("details", { class: "mmc-sheet-advanced", open: true }, [el("summary", { text: st("Cell details") }), list]);
    card.appendChild(details);
    return card;
  }

  renderReferences() {
    const referenceSettings = ["ref_image_size", "ref_scope"].map((name) => this.knobField(name)).filter(Boolean);
    const card = this.card("References", [
      el("div", { class: "mmc-sheet-buttons", style: { marginBottom: "12px" } }, [
        button("Add reference", () => this.pickReferences()), button("Upload reference", () => this.uploadReferences()),
      ]),
      ...(referenceSettings.length ? [el("h4", { text: st("Reference controls") }),
        el("p", { class: "mmc-sheet-context-note", text: st("Image size affects reference images; scope controls which attached references are used across cells.") }),
        el("div", { class: "mmc-sheet-context-grid", style: { marginBottom: "12px" } }, referenceSettings)] : []),
    ]);
    const gallery = el("div", { class: "mmc-sheet-ref-gallery" });
    card.appendChild(gallery);
    for (const [kind, [group, fileKey]] of Object.entries(GROUPS)) {
      for (const ref of this.state.sheet_data.refs[group]) {
        const filename = ref[fileKey] ?? ref.file ?? "";
        const referenceKey = `${group}:${filename}`;
        const enabled = el("input", { type: "checkbox", checked: ref.enabled !== false, onchange: () => {
          this.changeReferences(() => { ref.enabled = enabled.checked; }); this.renderForm();
        } });
        let preview;
        if (kind === "image") preview = el("img", { src: viewUrl(filename), loading: "lazy", alt: filename });
        else if (kind === "video") preview = el("video", { src: viewUrl(filename), muted: true, playsinline: true, preload: "metadata" });
        else preview = el("span", {}, [icon("audio")]);
        if (kind === "video") preview.muted = true;
        const thumb = el("button", { type: "button", class: "mmc-sheet-ref-thumb", title: st("Select a reference"),
          "aria-label": `${st("Select a reference")}: ${filename}`, onclick: () => this.studio.selectReference(referenceKey) }, [preview]);
        const role = textInput(ref.role, (value) => this.change(() => { ref.role = value; }), { placeholder: "Role" });
        role.setAttribute("aria-label", `${st("Role")}: ${filename}`);
        const details = el("div", {}, [el("span", { class: "mmc-sheet-ref-name", text: filename, title: filename }), role,
          el("div", { class: "mmc-sheet-buttons", style: { marginTop: "7px" } }, [
            el("label", { class: "mmc-sheet-check" }, [enabled, el("span", { text: st("Use reference") })]),
            selectInput(kind === "audio" ? [["auto", "Keep voice automatically"], ["off", "Keep voice"], ["on", "Mute voice"]]
              : [["auto", "Automatic face blur"], ["off", "Keep face"], ["on", "Blur face"]], ref.blurFace ?? "auto",
              (value) => this.change(() => { ref.blurFace = value; })),
          ]),
        ]);
        gallery.appendChild(el("div", { class: "mmc-sheet-reference", "data-sheet-ref-key": referenceKey, "data-sheet-file": filename }, [thumb, details,
          el("div", { class: "mmc-sheet-ref-actions" }, [button("Replace", () => this.replaceReference(group, ref, kind, fileKey)), button("Remove", () => {
          this.changeReferences(() => { this.state.sheet_data.refs[group] = this.state.sheet_data.refs[group].filter((item) => item !== ref); });
          this.renderForm();
        })])]));
      }
    }
    return card;
  }

  backgroundReferences() {
    const choices = [];
    for (const [kind, [group, fileKey]] of Object.entries(GROUPS)) {
      if (kind === "audio") continue;
      const wired = this.state.sheet_data.refs[group].filter((ref) => ref.enabled !== false && (ref[fileKey] ?? ref.file));
      wired.forEach((ref, index) => choices.push({ key: `${group}:${index}`, file: ref[fileKey] ?? ref.file, group }));
    }
    return choices;
  }

  changeReferences(change) {
    if (!this.alive() || this.state.active) return;
    const render = this.state.sheet_data.render;
    const before = this.backgroundReferences().find((ref) => ref.key === render.backgroundRef);
    change();
    if (before) render.backgroundRef = this.backgroundReferences().find((ref) => ref.file === before.file && ref.group === before.group)?.key ?? "";
    this.commit();
  }

  addReference(path, kind) {
    if (!this.alive() || this.state.active) return;
    const [group, fileKey] = GROUPS[kind] ?? [];
    if (!group) return;
    const list = this.state.sheet_data.refs[group];
    if (!list.some((ref) => (ref[fileKey] ?? ref.file) === path)) list.push({ [fileKey]: path, role: "", enabled: true, blurFace: "auto" });
  }

  async pickReferences() {
    if (!this.alive() || this.state.active) return;
    const chosen = await openPicker({ selectionPurpose: "prestage-character-sheet-reference", kinds: ["image", "video", "audio", "renders"], kind: "image" });
    if (!chosen || !this.alive() || this.state.active) return;
    for (const row of chosen) this.addReference(row.path, row.kind);
    this.commit(); this.renderForm();
  }

  async replaceReference(group, ref, kind, fileKey) {
    if (!this.alive() || this.state.active) return;
    const chosen = await openPicker({ selectionPurpose: "prestage-character-sheet-reference", kinds: [kind, "renders"], kind });
    if (!this.alive() || this.state.active || !(this.state.sheet_data.refs[group] ?? []).includes(ref)) return;
    const replacement = chosen?.find((row) => row.kind === kind);
    if (!replacement) return;
    const render = this.state.sheet_data.render;
    const selected = this.backgroundReferences().find((item) => item.key === render.backgroundRef);
    const wasBackground = selected?.group === group && selected.file === (ref[fileKey] ?? ref.file);
    this.changeReferences(() => { ref[fileKey] = replacement.path; if (ref.file !== undefined) ref.file = replacement.path; });
    if (wasBackground) render.backgroundRef = this.backgroundReferences().find((item) => item.group === group && item.file === replacement.path)?.key ?? "";
    this.studio.referenceKey = `${group}:${replacement.path}`;
    this.commit(); this.renderForm();
  }

  uploadReferences() {
    if (!this.alive() || this.state.active) return;
    const input = el("input", { type: "file", accept: "image/*,video/*,audio/*", multiple: true });
    input.addEventListener("change", async () => {
      try {
        for (const file of input.files) {
          const row = await upload(file, "continuity/sheets/references");
          if (!this.alive() || this.state.active) return;
          this.addReference(row.path, row.kind);
        }
        this.commit(); this.renderForm();
      } catch (error) { this.status(error.message, true); }
    });
    input.click();
  }

  knobField(name) {
    const knob = this.knobs.find((item) => item.name === name);
    if (!knob) return null;
    const definition = this.capabilities.schema.required?.[name] ?? this.capabilities.schema.optional?.[name];
    if (!definition) return null;
    const [type, options = {}] = definition;
    const changed = (value) => {
      if (!this.alive() || this.state.active) return;
      this.change(() => {
        this.state.settings[name] = value;
        if (["sheet_layout", "sheet_columns", "sheet_aspect"].includes(name)) this.state.sheet_data.render.layoutPreset = "";
      });
      if (["cell_size", "sheet_short_edge"].includes(name)) this.syncResolution();
      if (["sheet_layout", "sheet_columns", "sheet_aspect", "cell_aspect"].includes(name)) this.renderForm();
    };
    const value = this.state.settings[name] ?? options.default;
    let control;
    if (Array.isArray(type)) control = selectInput(type, value, changed);
    else if (type === "COMBO" && Array.isArray(options.options)) control = selectInput(options.options, value, changed);
    else if (type === "BOOLEAN") control = el("input", { type: "checkbox", checked: value === true, onchange: () => changed(control.checked) });
    else if (type === "INT" || type === "FLOAT") {
      control = el("input", { type: "number", step: options.step ?? (type === "INT" ? 1 : "any"),
        onchange: () => { const next = Number(control.value); if (Number.isFinite(next)) changed(next); } });
      control.value = value ?? 0;
    } else if (type === "STRING") control = textInput(value, changed);
    else return null;
    if (name === "seed") control = el("div", { class: "mmc-sheet-buttons" }, [control, button("Random seed", () => {
      if (this.state.active) return;
      const words = new Uint32Array(1); crypto.getRandomValues(words);
      this.state.settings.seed = words[0]; this.commit(); this.renderForm();
    })]);
    const label = name === "sheet_background" ? "Sheet canvas background" : knob.label ?? KNOB_LABELS[name] ?? name;
    return field(label, control);
  }

  renderSettings() {
    const controls = [];
    const contextual = new Set(["ref_image_size", "ref_scope", "sheet_layout", "sheet_columns", "sheet_aspect", "cell_aspect"]);
    for (const knob of this.knobs) {
      const name = knob.name;
      if (["sheet_data", "output_name", "single_pass"].includes(name)) continue;
      const control = this.knobField(name);
      if (contextual.has(name) && control) continue;
      if (control) controls.push(control);
    }
    const background = this.core.BACKGROUNDS;
    if (Array.isArray(background)) controls.push(field("Generation background", selectInput(background, this.state.sheet_data.render.background ?? "neutral",
      (value) => { if (this.state.active) return; this.state.sheet_data.render.background = value; this.commit(); this.renderForm(); })));
    if (this.state.sheet_data.render.background === "custom") controls.push(field("Custom background", textInput(this.state.sheet_data.render.backgroundCustom,
      (value) => this.change(() => { this.state.sheet_data.render.backgroundCustom = value; }))));
    if (this.state.sheet_data.render.background === "reference") {
      controls.push(field("Background reference", selectInput([["", "Choose a background reference"], ...this.backgroundReferences().map((ref) => [ref.key, ref.file])],
        this.state.sheet_data.render.backgroundRef ?? "", (value) => this.change(() => { this.state.sheet_data.render.backgroundRef = value; }))));
    }
    const restore = button("Restore Builder settings", () => this.restoreSettings());
    restore.disabled = Boolean(this.state.active);
    return this.card("Generation", [el("div", { class: "mmc-sheet-grid" }, controls),
      el("div", { class: "mmc-sheet-buttons", style: { marginTop: "14px" } }, [restore])]);
  }

  restoreSettings() {
    if (this.state.active) return;
    this.small("Restore Builder settings", (close, content) => {
      content.appendChild(el("p", { class: "mmc-sheet-note", text: st("Restore generation and layout controls to the installed Builder defaults? Your prompt, references, cells, models and saved results stay unchanged.") }));
      content.appendChild(el("p", { class: "mmc-sheet-note", text: st("Only sheet controls are reset. Regular PreStage settings are not changed.") }));
      content.appendChild(el("div", { class: "mmc-sheet-buttons" }, [button("Restore", () => {
        if (this.state.active || !this.alive()) return;
        this.state.settings = copySheet(this.capabilities.defaults);
        this.commit(); this.renderForm(); close(); this.status(st("Builder settings restored."));
      }, true), button("Close", close)]));
    });
  }

  renderLoras() {
    const payload = this.state.sheet_data;
    payload.loras ??= [];
    const card = this.card("LoRAs", []);
    for (const lora of payload.loras) {
      const strength = el("input", { type: "number", step: .05, onchange: () => this.change(() => { lora.strength = Number(strength.value); }) });
      strength.value = lora.strength ?? 1;
      const on = el("input", { type: "checkbox", checked: lora.on !== false, onchange: () => this.change(() => { lora.on = on.checked; }) });
      card.appendChild(el("div", { class: "mmc-sheet-grid", style: { marginBottom: "12px" } }, [
        field("LoRA file", textInput(lora.file, (value) => this.change(() => { lora.file = value; }))), field("Strength", strength),
        el("label", { class: "mmc-sheet-check" }, [on, el("span", { text: st("Use LoRA") })]),
        button("Remove", () => { if (this.state.active) return; payload.loras = payload.loras.filter((item) => item !== lora); this.commit(); this.renderForm(); }),
      ]));
    }
    card.appendChild(button("Add LoRA", async () => {
      try {
        const answer = await request(`${this.capabilities.builder_base}/loras`);
        if (!this.alive() || this.state.active) return;
        const rows = answer.loras ?? answer.items ?? [];
        const names = rows.map((row) => typeof row === "string" ? row : row.file ?? row.filename ?? row.path).filter(Boolean);
        if (!names.length) { this.status(st("No LoRA files found."), true); return; }
        this.small("Add LoRA", (close, content) => {
          const select = selectInput(names, names[0], () => {});
          content.appendChild(field("LoRA file", select));
          content.appendChild(el("div", { class: "mmc-sheet-buttons", style: { marginTop: "18px" } }, [button("Add", () => {
            if (!this.alive() || this.state.active) return;
            payload.loras.push({ file: select.value, strength: 1, on: true }); this.commit(); this.renderForm(); close();
          }, true), button("Close", close)]));
        });
      } catch (error) { this.status(error.message, true); }
    }));
    return card;
  }

  renderAdvanced() {
    const details = el("details", { class: "mmc-sheet-card mmc-sheet-advanced" }, [el("summary", { text: st("Advanced settings") }),
      el("p", { class: "mmc-sheet-note", text: st("Edit the installed Builder payload. Technical IDs and your prompt are kept unchanged.") })]);
    const json = el("textarea", { rows: 12, spellcheck: false });
    json.value = JSON.stringify(this.state.sheet_data, null, 2);
    details.appendChild(json);
    details.appendChild(el("div", { class: "mmc-sheet-buttons", style: { marginTop: "12px" } }, [button("Apply", () => {
      if (this.state.active) return;
      try {
        const payload = JSON.parse(json.value);
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error(st("Sheet data must be a JSON object."));
        if ((payload.cells !== undefined && !Array.isArray(payload.cells))
            || (payload.refs !== undefined && (!payload.refs || typeof payload.refs !== "object" || Array.isArray(payload.refs)))
            || (payload.render !== undefined && (!payload.render || typeof payload.render !== "object" || Array.isArray(payload.render)))
            || Object.values(GROUPS).some(([group]) => payload.refs?.[group] !== undefined && !Array.isArray(payload.refs[group]))) {
          throw new Error(st("Sheet cells and reference groups must be arrays."));
        }
        if (payload.render?.suite !== undefined && !Array.isArray(payload.render.suite)) throw new Error(st("Sheet suite must be an array."));
        const isRecord = (item) => item !== null && typeof item === "object" && !Array.isArray(item);
        if ((payload.cells ?? []).some((item) => !isRecord(item))
            || Object.values(GROUPS).some(([group]) => (payload.refs?.[group] ?? []).some((item) => !isRecord(item)))
            || (payload.loras !== undefined && (!Array.isArray(payload.loras) || payload.loras.some((item) => !isRecord(item))))) {
          throw new Error(st("Sheet cells, references and LoRAs must contain JSON objects."));
        }
        this.state.sheet_data = payload;
        fillSheetDefaults(this.state, this.capabilities);
        this.state.sheet_data.cells ??= [];
        this.commit(); this.renderForm(); this.status(st("Ready"));
      } catch (error) { this.status(error.message, true); }
    })]));
    return details;
  }

  setRunning(running) {
    if (!this.alive()) return;
    this.generateButton.disabled = running;
    this.cancelButton.hidden = !running;
    this.cancelButton.disabled = running && !this.state.active?.prompt_id;
    this.studio?.setRunning(running);
  }

  watchJob() {
    this.following?.abandon();
    const watcher = follow({ started: () => this.status(st("Generating…")), progress: (nodes) => {
      const running = Object.values(nodes).find((node) => node.state === "running" || node.state === "executing");
      const value = running?.value ?? running?.current;
      const max = running?.max;
      this.status(max ? `${st("Generating…")} ${value ?? 0}/${max}` : st("Generating…"));
    } });
    // Attaching a rejection handler now avoids an unhandled error during the POST round trip.
    watcher.promise.catch(() => {});
    this.following = watcher;
    return watcher;
  }

  async generate() {
    if (this.state.active || !this.alive()) return;
    if (Object.keys(MODEL_LABELS).some((key) => !this.state.models[key])) {
      this.status(st("Check the model selections before generating."), true); return;
    }
    this.syncResolution();
    const submitted = copySheet(this.state.sheet_data);
    const settings = copySheet(this.state.settings);
    const models = copySheet(this.state.models);
    settings.output_name = this.state.title || "sheet";
    this.state.active = { prompt_id: null, name: null };
    this.commit(); this.setRunning(true); this.status(st("Submitting sheet job…"));
    const watcher = this.watchJob();
    let accepted = false;
    let submittedName = null;
    try {
      const result = await request("/continuity/sheet/run", { sheet_data: submitted, settings, models, client_id: api.clientId });
      accepted = true;
      submittedName = result.name;
      if (!this.ownsState()) { watcher.abandon(); return; }
      this.state.active = { prompt_id: result.prompt_id, name: result.name };
      rememberSheetRun(this.state, result.name);
      this.commit();
      if (!this.alive()) { watcher.abandon(); this.notifySubmission(); return; }
      watcher.expect(result.prompt_id);
      this.setRunning(true); this.status(st("Queued"));
      await watcher.promise;
      await this.finishJob(true);
    } catch (error) {
      watcher.abandon();
      if (this.ownsState() && (!accepted || this.alive())) { this.state.active = null; this.commit(); }
      if (!this.alive() && !accepted) this.notifySubmission(error);
      if (this.alive()) {
        this.setRunning(false);
        this.status(error.cancelled ? st("Sheet job cancelled.") : error.message, !error.cancelled);
        if (accepted && submittedName) this.loadResults(submittedName).catch(() => {});
      }
    }
  }

  notifySubmission(error) {
    const room = opened;
    if (room === this || !room?.alive() || room.node !== this.node || room.state !== this.state || !room.ready) return;
    room.setRunning(Boolean(this.state.active));
    if (error) room.status(error.message, true);
    else if (this.state.active?.prompt_id && !room.following) room.resumeJob();
  }

  async finishJob(reveal = false) {
    if (!this.ownsState()) return;
    const name = this.state.active?.name ?? this.state.last_run;
    this.state.active = null; this.commit();
    if (!this.alive()) return;
    this.following = null;
    this.setRunning(false);
    if (name) await this.loadResults(name);
    if (this.alive() && !this.state.active) {
      this.status(st("Ready"));
      if (reveal && this.state.last_run === name && this.sheets.some((sheet) => sheet.sheetUrl)) this.showTab("results");
    }
  }

  async resumeJob() {
    const active = this.state.active;
    const watcher = this.watchJob();
    watcher.expect(active.prompt_id);
    try {
      const [history, queue] = await Promise.all([request(`/history/${encodeURIComponent(active.prompt_id)}`), request("/queue")]);
      if (!this.alive()) { watcher.abandon(); return; }
      if (history[active.prompt_id]) {
        watcher.abandon();
        const record = history[active.prompt_id];
        await this.finishJob(record.status?.status_str !== "error");
        if (record.status?.status_str === "error") this.status(st("The previous sheet job failed. Check the queue error."), true);
        return;
      }
      const waiting = [...(queue.queue_running ?? []), ...(queue.queue_pending ?? [])].some((entry) => entry[1] === active.prompt_id);
      if (!waiting) {
        watcher.abandon(); await this.finishJob();
        this.status(st("The previous sheet job is no longer in the queue.")); return;
      }
      this.status(st("Queued"));
      await watcher.promise;
      await this.finishJob(true);
    } catch (error) {
      watcher.abandon();
      if (this.alive()) {
        this.state.active = null; this.commit(); this.setRunning(false);
        this.status(error.cancelled ? st("Sheet job cancelled.") : error.message, !error.cancelled);
      }
    }
  }

  async cancel() {
    const id = this.state.active?.prompt_id;
    if (!id) return;
    this.cancelButton.disabled = true;
    let result;
    try { result = await cancelPrompt(id); }
    catch (error) {
      if (this.state.active?.prompt_id !== id) return;
      this.status(error.message, true);
      if (this.alive()) this.cancelButton.disabled = false;
      return;
    }
    if (!this.alive()) return;
    if (this.state.active?.prompt_id !== id) return;
    if (result === "running" && this.state.active?.prompt_id === id) {
      this.status(st("Cancellation requested."));
      return;
    }
    this.following?.abandon();
    this.state.active = null; this.commit(); this.setRunning(false);
    this.status(st("Sheet job cancelled."));
  }

  async loadResults(name) {
    const version = ++this.resultVersion;
    const base = this.capabilities.builder_base;
    const first = await request(`${base}?name=${encodeURIComponent(name)}`);
    const sheets = [];
    if (first.sheet) sheets.push(first.sheet);
    for (const board of first.boards ?? []) {
      const id = typeof board === "string" ? board : board.folder ?? board.id;
      if (!id || id === first.sheet?.board) continue;
      const result = await request(`${base}?name=${encodeURIComponent(name)}&board=${encodeURIComponent(id)}`);
      if (result.sheet) sheets.push(result.sheet);
    }
    if (!this.alive() || version !== this.resultVersion) return;
    this.state.last_run = name; this.commit();
    this.sheets = sheets;
    this.selected.clear();
    this.renderResults();
  }

  renderResults() {
    const history = this.state.history ?? [];
    const historySelect = selectInput([["", "Select a run"], ...history.map((run) => [run.name, run.name])], this.state.last_run ?? "",
      (name) => { if (name) this.loadResults(name).catch((error) => this.status(error.message, true)); });
    const reload = button("Reload results", () => this.loadResults(this.state.last_run).catch((error) => this.status(error.message, true)));
    reload.disabled = !this.state.last_run;
    const controls = el("div", { class: "mmc-sheet-buttons", style: { marginBottom: "14px" } }, [
      reload,
      button("New cast member", () => this.attachSelected(false)), button("Add to existing cast", () => this.attachSelected(true)),
    ]);
    this.results.replaceChildren(el("h3", { text: st("Sheet results") }),
      el("p", { class: "mmc-sheet-note", text: st("Generated originals stay in ComfyUI output. Save copies individually or add them to cast.") }),
      field("Previous runs", historySelect), controls);
    if (!this.sheets.some((sheet) => sheet.sheetUrl)) this.results.appendChild(el("p", { class: "mmc-sheet-note", text: st("No generated sheets yet.") }));
    for (const sheet of this.sheets) {
      if (!sheet.sheetUrl) continue;
      const file = sheetFile(sheet.sheetUrl, location.href);
      if (!file) continue;
      const select = el("input", { type: "checkbox", onchange: () => {
        if (select.checked) this.selected.set(sheet.board || sheet.name, { file, sheet });
        else this.selected.delete(sheet.board || sheet.name);
      } });
      const card = this.card(sheet.board || sheet.name, [el("div", { class: "mmc-sheet-result-head" }, [
        el("label", { class: "mmc-sheet-check" }, [select, el("span", { text: st("Select for cast") })]),
      ]), el("img", { class: "mmc-sheet-preview", src: this.localMediaUrl(sheet.sheetUrl), alt: sheet.sheetFile ?? sheet.name }),
      el("div", { class: "mmc-sheet-buttons" }, [button("Save to…", () => this.saveFile(file)),
        button("New cast member", () => this.attachFiles([{ file, sheet }], false)),
        button("Add to existing cast", () => this.attachFiles([{ file, sheet }], true)),
      ])], true);
      if (sheet.cells?.some((cell) => cell.cellUrl || cell.frames?.length)) {
        const details = el("details", { class: "mmc-sheet-advanced" }, [el("summary", { text: st("Cell frames") })]);
        const cells = el("div", { class: "mmc-sheet-cells" });
        for (const cell of sheet.cells) {
          if (!cell.cellUrl && !cell.frames?.length) continue;
          cells.appendChild(el("div", { class: "mmc-sheet-cell" }, [
            ...(cell.cellUrl ? [el("img", { src: this.localMediaUrl(cell.cellUrl), loading: "lazy", alt: cell.id })] : []),
            el("div", { class: "mmc-sheet-cell-name", text: cell.id }),
            ...(cell.frames?.length ? [button("Choose frame", () => this.pickFrame(sheet, cell))] : []),
          ]));
        }
        details.appendChild(cells); card.appendChild(details);
      }
      if (sheet.onePass?.prompt) card.appendChild(el("details", { class: "mmc-sheet-advanced" }, [
        el("summary", { text: st("Actual generated prompt") }), el("p", { text: sheet.onePass.prompt }),
      ]));
      this.results.appendChild(card);
    }
    this.studio?.resultsChanged();
  }

  localMediaUrl(value) {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith("/view")) throw new Error(st("Invalid sheet file."));
    return new URL(api.apiURL(`/view${url.search}`), location.href).href;
  }

  async saveFile(file) {
    try {
      const answer = await request("/continuity/sheet/export", { ...file, title: st("Save sheet to…") });
      if (answer.saved) this.status(st("Saved to {path}", { path: answer.path }));
    } catch (error) { this.status(error.message, true); }
  }

  small(title, build) {
    let closed = false;
    const content = el("div", { class: "mmc-sheet-small", role: "dialog", "aria-modal": true }, [el("h3", { text: st(title) })]);
    const overlay = el("div", { class: "mmc-overlay mmc-sheet-overlay" }, [content]);
    const close = () => { if (closed) return; closed = true; this.smallWindows.delete(close); unmount(); };
    const unmount = mountOverlay(overlay, close);
    this.smallWindows.add(close);
    build(close, content, () => !closed && this.alive());
  }

  attachSelected(existing) {
    if (!this.selected.size) { this.status(st("Select one or more sheets first."), true); return; }
    this.attachFiles([...this.selected.values()], existing);
  }

  attachFiles(entries, existing) {
    const peer = this.peer?.();
    if (!peer?.attachSheet) { this.status(st("Connect this PreStage to a timeline before adding cast."), true); return; }
    const choices = existing ? peer.sheetCast?.() ?? [] : [];
    const descriptions = [...new Set(entries.map(({ sheet }) => String(sheet?.spec?.globalPrompt ?? sheet?.spec?.global_prompt ?? "").trim()))];
    const description = descriptions.length === 1 ? descriptions[0] : "";
    if (existing && !choices.length) { this.status(st("No existing cast members."), true); return; }
    this.small(existing ? "Add to existing cast" : "New cast member", (close, content, alive) => {
      const name = textInput("subject", () => {});
      const selected = selectInput(choices.map((entry) => [entry.handle, entry.label || `@${entry.handle}`]), choices[0]?.handle, () => {});
      content.appendChild(el("p", { class: "mmc-sheet-note", text: st("{count} selected sheets will be added to one cast member.", { count: entries.length }) }));
      content.appendChild(field(existing ? "Select an existing cast member" : "Cast name", existing ? selected : name));
      if (!existing) content.appendChild(el("p", { class: "mmc-sheet-note", text: st("Use up to 32 letters, numbers or underscores for the cast handle, starting with a letter.") }));
      const attach = button("Attach", async () => {
        attach.disabled = true;
        try {
          // The captured peer validates its identity at confirmation. A new pair must not
          // receive sheets intended for the timeline that opened this dialog.
          const current = peer;
          if (!current?.attachSheet) throw new Error(st("The target timeline is no longer available."));
          if (existing && !(current.sheetCast?.() ?? []).some((entry) => entry.handle === selected.value)) {
            throw new Error(st("The selected cast member no longer exists."));
          }
          const result = await current.attachSheet({ files: entries.map(({ file }) => sheetCastFile(file)),
            targetHandle: existing ? selected.value : null, handle: name.value || "subject",
            description: existing ? "" : description });
          if (alive()) { close(); this.status(st("Added to @{handle}.", { handle: result?.handle ?? selected.value })); }
        } catch (error) {
          if (alive()) { notice.textContent = error.message; attach.disabled = false; }
        }
      }, true);
      const notice = el("p", { class: "mmc-sheet-error", style: { overflowWrap: "anywhere" } });
      content.appendChild(notice);
      content.appendChild(el("div", { class: "mmc-sheet-buttons", style: { marginTop: "18px" } }, [attach, button("Close", close)]));
    });
  }

  pickFrame(sheet, cell) {
    this.small("Choose frame", (close, content, alive) => {
      let index = Math.max(0, Math.min(cell.frames.length - 1, Number(cell.pickIndex) || 0));
      const image = el("img", { class: "mmc-sheet-preview", src: this.localMediaUrl(cell.frames[index].url), alt: cell.id });
      const label = el("p", { text: `${index + 1} / ${cell.frames.length}` });
      const slider = el("input", { type: "range", min: 0, max: cell.frames.length - 1, step: 1, oninput: () => {
        index = Number(slider.value); image.src = this.localMediaUrl(cell.frames[index].url); label.textContent = `${index + 1} / ${cell.frames.length}`;
      } });
      slider.value = index;
      content.append(image, slider, label);
      const notice = el("p", { class: "mmc-sheet-error" });
      content.appendChild(notice);
      const apply = button("Apply", async () => {
        apply.disabled = true;
        try {
          await this.action("pick", { name: sheet.name, board: sheet.board, cell: cell.id, mode: "manual", index, spec: sheet.spec });
          if (alive()) { close(); await this.loadResults(this.state.last_run); }
        } catch (error) { if (alive()) { notice.textContent = st(error.message); apply.disabled = false; } }
      }, true);
      content.appendChild(el("div", { class: "mmc-sheet-buttons" }, [apply, button("Close", close)]));
    });
  }

  promptPresets() {
    if (this.state.active) { this.status(st("Generating…")); return; }
    this.promptLibrary?.close();
    let library;
    const close = () => library.close();
    library = openSheetPrompts({
      getValues: () => sheetPromptValues(this.state), isAlive: () => this.alive() && !this.state.active,
      onApply: (preset) => {
        if (!this.alive() || this.state.active) return;
        this.promptEdit = null;
        applySheetPrompt(this.state, preset); this.commit(); this.renderForm(); this.status(st("Prompt preset loaded."));
      },
      onEdit: (preset) => this.beginPromptEdit(preset),
      onClose: () => { this.smallWindows.delete(close); if (this.promptLibrary === library) this.promptLibrary = null; },
    });
    this.promptLibrary = library;
    this.smallWindows.add(close);
    return library;
  }

  beginPromptEdit(preset) {
    if (!this.alive() || this.state.active) return;
    this.promptEdit = { id: preset.id, label: preset.label, original: sheetPromptValues(this.state) };
    applySheetPrompt(this.state, preset); this.commit(); this.renderForm();
    this.showTab("references");
    this.overlay.querySelector('[data-sheet-field="identity"]')?.focus();
  }

  promptEditControls() {
    const editing = this.promptEdit;
    const name = textInput(editing.label, (value) => { editing.label = value; });
    const save = button("Save changes to preset", async () => {
      if (!this.alive() || this.promptEdit !== editing) return;
      save.disabled = true;
      try {
        const result = await saveSheetPromptRecord({ id: editing.id, label: editing.label, ...sheetPromptValues(this.state) });
        if (!this.alive() || this.promptEdit !== editing) return;
        this.promptEdit = null; this.renderForm();
        this.status(st(result.location === "browser" ? "Saved in this browser only." : "Prompt preset saved."));
      } catch (error) {
        if (this.alive() && this.promptEdit === editing) { this.status(st(error.message), true); save.disabled = false; }
      }
    }, true);
    return el("div", { class: "mmc-sheet-prompt-edit" }, [
      field("Preset name", name),
      el("p", { class: "mmc-sheet-note", text: st("Edit the two prompt fields above, then save. Cancel restores the previous sheet prompt; references and settings are never changed.") }),
      el("div", { class: "mmc-sheet-buttons" }, [save, button("Cancel editing", () => {
        if (!this.alive() || this.state.active || this.promptEdit !== editing) return;
        applySheetPrompt(this.state, editing.original); this.promptEdit = null; this.commit(); this.renderForm();
      })]),
    ]);
  }

  help() {
    this.small("Sheet prompt help", (close, content) => {
      content.classList.add("mmc-sheet-help");
      content.appendChild(el("div", { class: "mmc-sheet-help-guide" }, SHEET_PROMPT_GUIDE.map(([heading, text]) =>
        el("div", {}, [el("strong", { text: st(heading) }), el("p", { text: st(text) })]))));
      content.appendChild(el("p", { class: "mmc-sheet-note", text: st("English examples below remain unchanged when copied. They are alternatives for different fields, not one prompt to paste together.") }));
      content.appendChild(el("table", {}, [
        el("thead", {}, [el("tr", {}, ["Input field", "English example", "Purpose"].map((text) => el("th", { text: st(text) })))]),
        el("tbody", {}, SHEET_PROMPT_EXAMPLES.map((example) => el("tr", {}, [
          el("td", { text: st(example.field) }), el("td", { text: example.text }), el("td", { text: st(example.meaning) }),
        ]))),
      ]));
      content.appendChild(el("p", { class: "mmc-sheet-note", text: st("One pass builds a whole-sheet prompt; per cell adds the shared description and that cell's instructions. Cell plans are not the exact one-pass prompt.") }));
      content.appendChild(el("p", { class: "mmc-sheet-note", text: st("Match steps to the checkpoint: Builder's low-step presets target TURBO. Non-TURBO models generally need 20–30 steps. Do not add a turbo LoRA to a checkpoint that already includes it.") }));
      content.appendChild(el("p", { class: "mmc-sheet-note", text: st("Sheet settings are independent, but jobs share the ComfyUI queue and GPU. Save finished sheets individually or add them to cast; closing the workspace does not cancel a job.") }));
      content.appendChild(button("Close", close));
    });
  }
}
