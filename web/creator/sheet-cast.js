import * as P from "./presets.js";
import * as S from "./state.js";
import { st } from "./sheet-locales.js";

export function sheetCastChoices(timeline) {
  return (timeline?.subjects ?? []).map(({ handle }) => ({ handle, label: `@${handle}` }));
}

export function sheetCastFiles(files) {
  if (!Array.isArray(files) || !files.length) throw new Error(st("Select at least one sheet."));
  const seen = new Set();
  return files.map((file) => {
    const filename = String(file?.filename ?? "").replaceAll("\\", "/");
    const path = filename.endsWith(" [output]") ? filename.slice(0, -9) : "";
    const parts = path.split("/");
    if (parts[0] !== "minimax_sheets" || parts.length < 3 || !/\.png$/i.test(path)
      || parts.some((part) => !part || part === "." || part === ".." || /[:\x00-\x1f]/.test(part))) {
      throw new Error(st("Only generated sheet images can be added here."));
    }
    return { filename, kind: "image", slot: "from" };
  }).filter((file) => {
    if (seen.has(file.filename)) return false;
    seen.add(file.filename);
    return true;
  });
}

export function addSheetToCast(timeline, { files, targetHandle = null, handle = "subject", description = "" }) {
  const arrivals = sheetCastFiles(files);
  const existing = targetHandle == null ? null
    : (timeline.subjects ?? []).find((subject) => subject.handle === targetHandle);
  if (targetHandle != null && !existing) throw new Error(st("The selected cast member no longer exists."));
  const wanted = String(handle || "subject").replace(/^@/, "").trim();
  if (!existing && !S.SUBJECT_HANDLE_RE.test(wanted)) {
    throw new Error(st("Use up to 32 letters, numbers or underscores for the cast handle, starting with a letter."));
  }
  const added = P.addSubjectToPiece({
    handle: existing?.handle ?? wanted,
    takes: existing?.takes ?? "person",
    files: arrivals,
    ...(!existing && description.trim() ? { description: description.trim() } : {}),
  }, timeline);
  if (!existing) return added;
  existing.from = [...new Set([...(existing.from ?? []), ...added.from])];
  timeline.subjects.splice(timeline.subjects.indexOf(added), 1);
  return existing;
}
