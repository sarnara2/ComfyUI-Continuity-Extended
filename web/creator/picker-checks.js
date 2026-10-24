// Pending attachment checks only. Never store import settings, organize marks,
// workflow objects or media here, and never perform attachment while reading.
const STORE = "continuity-picker-checks-v1";
const VERSION = 1;
const MAX_RECORDS = 64;
const MAX_CHARS = 131072;
const MAX_PATHS = 256;
const MAX_PATH_CHARS = 2048;
const MAX_RECORD_CHARS = 64000;
const KINDS = ["image", "video", "audio", "renders", "guides", "refmods", "meshes"];
const plain = (value) => value && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const validContext = (value) => typeof value === "string" && value.length <= 180
  && /^pickerchecks:[a-z][a-z0-9-]{0,63}:(?:image|video|audio|renders|guides|refmods|meshes):(?:\*|image|video|audio|meshes):(?:single|multiple)$/.test(value);
let session = { version: VERSION, records: Object.create(null) };
let unavailable = false;

function paths(value) {
  if (!Array.isArray(value)) return [];
  const result = [], seen = new Set();
  let size = 0;
  for (const entry of value.slice(0, MAX_PATHS)) {
    if (typeof entry !== "string" || !entry.length || entry.length > MAX_PATH_CHARS
        || /[\u0000-\u001f\u007f]/.test(entry) || seen.has(entry)) continue;
    const cost = JSON.stringify(entry).length + 1;
    if (size + cost > MAX_RECORD_CHARS) break;
    size += cost;
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function normalize(value) {
  const next = { version: VERSION, records: Object.create(null) };
  if (!plain(value) || Object.getOwnPropertyDescriptor(value, "version")?.value !== VERSION
      || !plain(Object.getOwnPropertyDescriptor(value, "records")?.value)) return next;
  for (const key of Object.keys(value.records).slice(0, MAX_RECORDS)) {
    if (validContext(key)) next.records[key] = paths(Object.getOwnPropertyDescriptor(value.records, key)?.value);
  }
  return next;
}

function current() {
  if (!unavailable) {
    try {
      const raw = globalThis.localStorage.getItem(STORE);
      session = raw && raw.length <= MAX_CHARS ? normalize(JSON.parse(raw)) : normalize(null);
    } catch (error) {
      if (error instanceof SyntaxError) session = normalize(null);
      else unavailable = true;
    }
  }
  return session;
}

function write(records) {
  session = normalize({ version: VERSION, records });
  while (Object.keys(session.records).length > 1 && JSON.stringify(session).length > MAX_CHARS) {
    delete session.records[Object.keys(session.records)[0]];
  }
  if (!unavailable) {
    try { globalThis.localStorage.setItem(STORE, JSON.stringify(session)); }
    catch { unavailable = true; }
  }
}

export function pickerSelectionContext(options, kind) {
  const purpose = options?.selectionPurpose;
  if (options?.rememberSelection !== true || options?.viewOnly || options?.plate?.panels?.length
      || typeof purpose !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(purpose)
      || !KINDS.includes(kind) || !options.kinds?.includes(kind)) return null;
  const only = ["image", "video", "audio", "meshes"].includes(options.only) ? options.only : "*";
  return `pickerchecks:${purpose}:${kind}:${only}:${options.single ? "single" : "multiple"}`;
}

export function readPickedPaths(context) {
  if (!validContext(context)) return [];
  return [...(current().records[context] ?? [])];
}

export function writePickedPaths(context, selected) {
  if (!validContext(context)) return [];
  const records = { ...current().records };
  // Move this context to the end so it survives bounded oldest-record eviction.
  delete records[context];
  records[context] = paths(selected);
  while (Object.keys(records).length > MAX_RECORDS) delete records[Object.keys(records)[0]];
  write(records);
  return readPickedPaths(context);
}

export function clearPickedPaths(context = null) {
  if (context == null) write({});
  else if (validContext(context)) {
    const records = { ...current().records };
    delete records[context];
    write(records);
  }
}
