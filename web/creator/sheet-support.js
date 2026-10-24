// Payload and file bookkeeping for the optional Builder adapter; no generation logic.
export const SHEET_VERSION = 1;
export const copySheet = (value) => JSON.parse(JSON.stringify(value));

export function sheetState(properties) {
  const saved = properties.continuity_sheet;
  if (saved?.version === SHEET_VERSION && saved.sheet_data && typeof saved.sheet_data === "object"
      && !Array.isArray(saved.sheet_data)) {
    return saved;
  }
  const state = {
    version: SHEET_VERSION,
    title: "",
    sheet_data: { version: 1, refs: { pictures: [], videos: [], audios: [] }, cells: [],
                  globalPrompt: "", negativePrompt: "", render: {} },
    settings: {}, models: {}, history: [], active: null,
  };
  properties.continuity_sheet = state;
  // Read back the canonical host value: ComfyUI may wrap node properties in Vue.
  return properties.continuity_sheet;
}

export function fillSheetDefaults(state, capabilities) {
  state.settings = { ...(capabilities.defaults ?? {}), ...(state.settings ?? {}) };
  state.models = { ...(capabilities.model_defaults ?? {}), ...(state.models ?? {}) };
  state.history ??= [];
  state.sheet_data.refs ??= {};
  state.sheet_data.render ??= {};
  for (const group of ["pictures", "videos", "audios"]) state.sheet_data.refs[group] ??= [];
}

// A preset comes from the installed plugin. Unknown payload fields are retained.
export function applySheetPreset(state, preset) {
  const payload = state.sheet_data;
  payload.render = { ...(payload.render ?? {}), ...(preset.render ?? {}) };
  payload.sheet = { ...(payload.sheet ?? {}), ...(preset.sheet ?? {}) };
  state.settings = { ...state.settings, ...(preset.widgets ?? {}) };
  const keys = { layout: "sheet_layout", columns: "sheet_columns", aspect: "sheet_aspect", shortEdge: "sheet_short_edge" };
  for (const [key, widget] of Object.entries(keys)) {
    if (preset.sheet?.[key] !== undefined) state.settings[widget] = preset.sheet[key];
  }
  if (preset.render?.singlePass !== undefined) state.settings.single_pass = preset.render.singlePass;
  // Settings-only presets send build: {}; they must not reset authored choices.
  for (const [axis, values] of Object.entries(preset.build ?? {})) {
    if (Array.isArray(values) && values.length) {
      payload.build ??= {};
      payload.build[axis] = copySheet(values);
    }
  }
  if (preset.cells) payload.cells = copySheet(preset.cells);
  if (preset.kind === "suite") {
    payload.render.suite = [...(preset.boards ?? [])];
    payload.render.layoutPreset = preset.id;
  } else if (preset.kind === "layout") {
    payload.render.suite = [];
    payload.render.layoutPreset = preset.id;
  } else payload.render.preset = preset.id;
}

export function sheetFile(url, base = "http://localhost/") {
  if (!url) return null;
  let origin, parsed;
  try { origin = new URL(base); parsed = new URL(url, origin); }
  catch { return null; }
  if (parsed.origin !== origin.origin || !parsed.pathname.endsWith("/view")) return null;
  const filename = parsed.searchParams.get("filename");
  const subfolder = parsed.searchParams.get("subfolder") ?? "";
  const type = parsed.searchParams.get("type") ?? "output";
  if (!filename || type !== "output" || !/\.png$/i.test(filename)
      || /[\\/:*?"<>|\u0000-\u001f]/.test(filename)
      || !/^minimax_sheets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?$/.test(subfolder)) return null;
  return { filename, subfolder, type: "output", kind: "image" };
}

export function sheetCastFile(file) {
  const path = `${file.subfolder ? `${file.subfolder}/` : ""}${file.filename}`;
  return { filename: `${path} [output]`, kind: "image" };
}

export function rememberSheetRun(state, name) {
  state.history = [{ name, at: Date.now() }, ...state.history.filter((run) => run.name !== name)].slice(0, 40);
  state.last_run = name;
}
