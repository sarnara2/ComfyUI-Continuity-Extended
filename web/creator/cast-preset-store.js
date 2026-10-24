// Personal phrase presets have their own userdata file, never a workflow field.
import { api } from "../../../scripts/api.js";

export const CAST_PRESET_FILE = "continuity.cast-presets.json";
const KEY = "continuity-cast-preset-prefs";
const PENDING = KEY + "-pending";
const FIELDS = new Set(["description", "usage_rules", "replaces_what", "piece_description", "piece_usage_rules"]);
let cache = null, loading = null, writing = Promise.resolve(), revision = 0, cacheRevision = 0;

export function normalizeCastPresetPrefs(raw) {
  const seen = new Set();
  const custom = (Array.isArray(raw?.custom) ? raw.custom : []).filter((row) => {
    if (!row || typeof row.id !== "string" || !row.id.startsWith("custom:") || seen.has(row.id)
        || !FIELDS.has(row.field) || typeof row.label !== "string" || !row.label.trim()
        || typeof row.text !== "string" || !row.text.trim()) return false;
    seen.add(row.id); return true;
  }).map((row) => ({
    id: row.id, field: row.field, label: row.label, text: row.text,
    category: typeof row.category === "string" ? row.category : "use",
    keywords: typeof row.keywords === "string" ? row.keywords : "",
  }));
  const ids = (value) => [...new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === "string"))];
  return { version: 1, custom, favorites: ids(raw?.favorites), recent: ids(raw?.recent).slice(0, 24) };
}

export async function loadCastPresetPrefs() {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    let raw = null;
    // A browser-only save must not be replaced by an older server copy when
    // connectivity returns. A later successful write clears this marker.
    try {
      if (localStorage.getItem(PENDING)) raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch { /* userdata can still load */ }
    try {
      if (!raw) {
        const response = await api.getUserData(CAST_PRESET_FILE);
        if (response.status === 200) raw = await response.json();
      }
    } catch { /* browser copy below also works offline */ }
    if (!raw) {
      try { raw = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { /* fresh browser */ }
    }
    cache = normalizeCastPresetPrefs(raw);
    return cache;
  })();
  try { return await loading; }
  finally { loading = null; }
}

export function saveCastPresetPrefs(prefs) {
  const snapshot = normalizeCastPresetPrefs(prefs);
  const ownRevision = ++revision;
  let local = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
    localStorage.setItem(PENDING, "1");
    local = true;
    cache = snapshot; cacheRevision = ownRevision;
  } catch { /* userdata can still save */ }
  // Serialize writes so a slow star update cannot overwrite a newer custom preset.
  const saved = writing.catch(() => {}).then(async () => {
    try {
      const response = await api.storeUserData(CAST_PRESET_FILE, snapshot, { stringify: true });
      if (response?.ok === false || response?.status >= 400) throw new Error("Preset save failed");
      if (ownRevision >= cacheRevision) { cache = snapshot; cacheRevision = ownRevision; }
      // A queued older snapshot must not clear the newer pending browser copy.
      if (ownRevision === revision) {
        try { localStorage.removeItem(PENDING); } catch { /* harmless pending copy */ }
      }
      return { location: "user" };
    } catch (error) {
      if (local) return { location: "browser" };
      throw error;
    }
  });
  writing = saved;
  return saved;
}
