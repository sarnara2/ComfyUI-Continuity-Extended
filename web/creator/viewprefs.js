// Display-only library memory. Never share this store with workflow or LoRA
// application settings: opening a window must not apply anything to a piece.
const STORE = "continuity-extended-view-prefs-v1";
const VERSION = 1;
const MAX_RECORDS = 64;
const MAX_BYTES = 65536;
const KINDS = ["image", "video", "audio", "renders", "guides", "refmods", "meshes"];
const SCOPES = ["piece", "shot", "prestage", "cast", "style"];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = (value) => value && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
let session = { version: VERSION, records: Object.create(null) };
let unavailable = false;

function fields(context) {
  if (typeof context !== "string" || context.length > 180) return null;
  if (/^picker:(?:image|video|audio|renders|guides|refmods|meshes)(?:,(?:image|video|audio|renders|guides|refmods|meshes))*:(?:\*|image|video|audio|meshes):(?:single|multiple):(?:view|select)$/.test(context)) {
    return { kind: KINDS, sort: ["recent", "name"], query: 512,
      view: ["large", "small", "details"], externalFolder: 64, directory: 1024 };
  }
  if (["loras:normal", "loras:swap"].includes(context)) {
    return { tab: context === "loras:swap" ? ["loras"] : ["loras", "library", "stacks"], query: 512, folder: 256 };
  }
  if (context === "presets:browse") return { scope: SCOPES };
  if (SCOPES.some((scope) => context === `presets:scope:${scope}`)) return { query: 512, shelf: 256 };
  if (context === "wears:family") return { family: 96 };
  if (context === "timeline:preview") return { preview: ["on", "off"] };
  return null;
}

function record(context, value) {
  const allowed = fields(context);
  const result = {};
  if (!allowed || !plain(value)) return result;
  for (const [key, rule] of Object.entries(allowed)) {
    const stored = Object.getOwnPropertyDescriptor(value, key)?.value;
    if (typeof stored !== "string") continue;
    if (Array.isArray(rule) ? rule.includes(stored) : stored.length <= rule) result[key] = stored;
  }
  return result;
}

function normalize(value) {
  const result = { version: VERSION, records: Object.create(null) };
  if (!plain(value) || !own(value, "version") || value.version !== VERSION
      || !own(value, "records") || !plain(value.records)) return result;
  for (const context of Object.keys(value.records).slice(0, MAX_RECORDS)) {
    const row = record(context, value.records[context]);
    if (Object.keys(row).length) result.records[context] = row;
  }
  return result;
}

function current() {
  if (!unavailable) {
    try {
      const raw = globalThis.localStorage.getItem(STORE);
      session = raw && raw.length <= MAX_BYTES ? normalize(JSON.parse(raw)) : normalize(null);
    } catch (error) {
      // Bad JSON is replaceable; denied storage is a session-only fallback.
      if (error instanceof SyntaxError) session = normalize(null);
      else unavailable = true;
    }
  }
  return session;
}

function write(value) {
  session = normalize(value);
  // Directory memory makes an individual picker record larger. Keep the
  // complete store under its read limit rather than losing all prefs next open.
  while (Object.keys(session.records).length > 1 && JSON.stringify(session).length > MAX_BYTES) {
    delete session.records[Object.keys(session.records)[0]];
  }
  if (!unavailable) {
    try { globalThis.localStorage.setItem(STORE, JSON.stringify(session)); }
    catch { unavailable = true; }
  }
}

export function readViewPrefs(context) {
  return { ...current().records[context] };
}

export function patchViewPrefs(context, patch) {
  if (!fields(context)) return {};
  // Read today's records, not the modal's opening snapshot: another library
  // may have changed a different context while this one was still open.
  const value = current();
  const next = { ...value.records[context], ...record(context, patch) };
  const records = { ...value.records };
  delete records[context];
  records[context] = next;
  // Retain the context being patched when the bounded store is already full.
  if (Object.keys(records).length > MAX_RECORDS) delete records[Object.keys(records)[0]];
  write({ version: VERSION, records });
  return { ...session.records[context] };
}

export function clearViewPrefs(context = null) {
  if (context == null) write({ version: VERSION, records: {} });
  else if (fields(context)) {
    const records = { ...current().records };
    delete records[context];
    write({ version: VERSION, records });
  }
}

export function pickerViewContext(options) {
  const kinds = [...new Set(options.kinds.filter((kind) => KINDS.includes(kind)))].sort();
  const only = ["image", "video", "audio", "meshes"].includes(options.only) ? options.only : "*";
  return `picker:${kinds.join(",")}:${only}:${options.single ? "single" : "multiple"}:${options.viewOnly ? "view" : "select"}`;
}

export function pickerViewKind(options, remembered) {
  const allowed = options.kinds.filter((kind) => KINDS.includes(kind)
    && (!options.only || kind === options.only || ["renders", "guides", "refmods"].includes(kind)));
  return [remembered, options.kind, ...allowed].find((kind) => allowed.includes(kind)) ?? options.kinds[0];
}
