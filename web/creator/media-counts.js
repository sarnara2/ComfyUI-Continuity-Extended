// Read-only file-kind counts for the reference and cast shelf headers.
import { el } from "./dom.js";
import { t } from "./i18n.js";

/** Count attached rows, not citations or active references. A RefMod keeps its
 *  own type even when its asset entry is otherwise labelled image or video. */
export function referenceFileCounts(assets = []) {
  const counts = { image: 0, video: 0, audio: 0, refmod: 0, other: 0 };
  for (const asset of assets) {
    const kind = String(asset?.filename ?? "").startsWith("refmod:")
      ? "refmod" : ["image", "video", "audio"].includes(asset?.kind) ? asset.kind : "other";
    counts[kind] += 1;
  }
  return counts;
}

/** Resolve each exact claimed handle once. The first matching asset is the
 *  same file the existing shelf resolves; missing claims add no phantom file. */
export function resolvedReferenceFiles(handles = [], assets = []) {
  const files = [];
  for (const handle of new Set(handles)) {
    const asset = assets.find((entry) => entry?.handle === handle);
    if (asset) files.push(asset);
  }
  return files;
}

/** Separate, non-interactive pills. The cast's image wording distinguishes
 *  supporting files from the representative face, which is not another file. */
export function mediaCountPills(assets = [], { supportingImages = false } = {}) {
  const counts = referenceFileCounts(assets);
  const labels = [
    ["image", supportingImages ? "Supporting images {n}" : "Images {n}"],
    ["video", "Videos {n}"], ["audio", "Audio {n}"],
    ["refmod", "RefMod {n}"], ["other", "Other files {n}"],
  ];
  const pills = labels.filter(([kind]) => counts[kind] > 0).map(([kind, label]) =>
    el("span", { class: `mmc-media-count mmc-media-count-${kind}`, text: t(label, { n: counts[kind] }) }));
  if (!pills.length) pills.push(el("span", {
    class: "mmc-media-count mmc-media-count-empty", text: t("Reference files {n}", { n: 0 }),
  }));
  return el("span", { class: "mmc-media-counts" }, pills);
}
