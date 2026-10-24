// Personal sheet phrases live outside workflows and generation settings.
import { api } from "../../../scripts/api.js";

export const SHEET_PROMPT_FILE = "continuity.sheet-prompt-presets.json";
const KEY = "continuity-sheet-prompt-presets";
const PENDING = KEY + "-pending";
const CUSTOM_ID = /^custom:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
let cache = null, loading = null, writing = Promise.resolve(), revision = 0, cacheRevision = 0;

export function normalizeSheetPromptPrefs(raw) {
  const seen = new Set(), custom = [];
  for (const row of Array.isArray(raw?.custom) ? raw.custom : []) {
    if (!row || typeof row.id !== "string" || !CUSTOM_ID.test(row.id) || seen.has(row.id)
        || typeof row.label !== "string" || !row.label.trim()) continue;
    const identity = typeof row.identity === "string" ? row.identity : "";
    const negative = typeof row.negative === "string" ? row.negative : "";
    if (!identity.trim() && !negative.trim()) continue;
    seen.add(row.id);
    custom.push({ id: row.id, label: row.label.trim(), identity, negative });
  }
  const favorites = [...new Set((Array.isArray(raw?.favorites) ? raw.favorites : [])
    .filter((id) => typeof id === "string" && id.trim()))];
  return { version: 1, custom, favorites };
}

export async function loadSheetPromptPrefs() {
  if (cache) return cache;
  if (loading) return loading;
  const startedAt = revision;
  loading = (async () => {
    let raw = null;
    try {
      if (localStorage.getItem(PENDING)) raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch { /* userdata can still load */ }
    try {
      if (!raw) {
        const response = await api.getUserData(SHEET_PROMPT_FILE);
        if (response.status === 200) raw = await response.json();
      }
    } catch { /* browser copy also works offline */ }
    if (!raw) {
      try { raw = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { /* fresh browser */ }
    }
    // An old server response must not replace a save made while it was loading.
    if (revision !== startedAt && cache) return cache;
    cache = normalizeSheetPromptPrefs(raw);
    return cache;
  })();
  try { return await loading; }
  finally { loading = null; }
}

export function saveSheetPromptPrefs(prefs) {
  const snapshot = normalizeSheetPromptPrefs(prefs);
  const ownRevision = ++revision;
  let local = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
    localStorage.setItem(PENDING, "1");
    local = true;
    cache = snapshot; cacheRevision = ownRevision;
  } catch { /* userdata can still save */ }
  const saved = writing.catch(() => {}).then(async () => {
    try {
      const response = await api.storeUserData(SHEET_PROMPT_FILE, snapshot, { stringify: true });
      if (response?.ok === false || response?.status >= 400) throw new Error("Sheet prompt preset save failed");
      if (ownRevision >= cacheRevision) { cache = snapshot; cacheRevision = ownRevision; }
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
