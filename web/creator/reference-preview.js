// Read-only reference viewer, shared by a segment's chips and a Cast face.
// Previewing never edits a reference or commits creator_data. In particular a
// video URL must not carry crop: that route returns a still, not playable media.
import { el, mountOverlay } from "./dom.js";
import { viewUrl } from "./api.js";
import { t } from "./i18n.js";
import * as S from "./state.js";
import { createCardPreview } from "./card-preview.js";

export const isVisualReference = (asset) => Boolean(asset?.filename)
  && asset.track !== "sound"
  && (asset.kind === "image" || asset.kind === "video" || S.isRefMod(asset));

// How long a first click waits for a second before it counts as a single.
// Browsers do not expose the OS double-click interval; 250 ms sits under the
// common defaults, and the cost is that much delay before a swap opens.
const DOUBLE_CLICK_MS = 250;

/** Double-click previews. A `click` action (the segment chip's file swap) runs
 *  on a single click only, deferred so the second click of a double can cancel
 *  it — swappable() cannot be combined with this, because its picker would open
 *  on the first click of every double. From the keyboard, Enter is the click
 *  action and Space previews, as Quick Look does; without one, both preview. */
export function previewable(thumb, { title, open, click = null }) {
  thumb.title = title;
  thumb.classList.add("mmc-reference-preview-target");
  // A thumbnail that still swaps looks like the one it replaced.
  if (click) thumb.classList.add("mmc-asset-swap");
  thumb.setAttribute("role", "button");
  thumb.setAttribute("tabindex", "0");
  thumb.setAttribute("aria-label", title);
  thumb.setAttribute("aria-haspopup", "dialog");
  thumb.addEventListener("mousedown", (event) => {
    // Blurring an edited Cast name can redraw this element between clicks.
    if (event.button === 0) event.preventDefault();
  });
  let pending = null;
  thumb.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!click) return;
    clearTimeout(pending);
    pending = event.detail > 1 ? null : setTimeout(() => { pending = null; click(); },
                                                   DOUBLE_CLICK_MS);
  });
  thumb.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearTimeout(pending);
    pending = null;
    open(thumb);
  });
  thumb.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (click && event.key === "Enter") click();
    else open(thumb);
  });
  return thumb;
}

let activeClose = null;

/** Open an isolated modal above the current editor. Returns an idempotent close.
 *  Video playback uses the original file, not a simulation of render framing. */
export function openReferencePreview(assets, {
  initial = 0, caption = "", returnFocus = null, includeAudio = false, onClose = null,
  playback = null, details = null, emptyMessage = "", originalImages = false, onShow = null,
} = {}) {
  const files = (assets ?? []).filter((asset) => isVisualReference(asset)
    || includeAudio && Boolean(asset?.filename)
      && (asset.kind === "audio" || asset.kind === "video" && asset.track === "sound"));
  if (!files.length && !emptyMessage) return () => {};
  activeClose?.();
  const previousFocus = document.activeElement;
  let index = Math.max(0, Math.min(files.length - 1, Math.floor(Number(initial) || 0)));
  let media = null;
  let playbackController = null;
  let closed = false;
  let unmount = () => {};
  const stopMedia = () => {
    playbackController?.destroy();
    playbackController = null;
    if (!media) return;
    media.onerror = null;
    if (media instanceof HTMLMediaElement) {
      media.pause();
      media.removeAttribute("src");
      media.load();
    }
    media.remove();
    media = null;
  };
  const exitVideoFullscreen = () => {
    if (!document.fullscreenElement || !overlay.contains(document.fullscreenElement)) return false;
    // Escape exits native fullscreen first. A second Escape closes the viewer.
    document.exitFullscreen?.().catch(() => {});
    return true;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    exitVideoFullscreen();
    stopMedia();
    unmount();
    if (activeClose === close) activeClose = null;
    onClose?.();
    const focus = returnFocus?.isConnected ? returnFocus : previousFocus;
    if (focus?.isConnected) focus.focus?.({ preventScroll: true });
  };
  const closeButton = el("button", { class: "mmc-close", type: "button", text: "×",
    "aria-label": t("Close"), title: t("Close"), onclick: close });
  const name = el("div", { class: "mmc-reference-preview-name" });
  const note = el("div", { class: "mmc-reference-preview-note" });
  const status = el("div", { class: "mmc-reference-preview-error", role: "status", hidden: true });
  const stage = el("div", { class: "mmc-reference-preview-stage" });
  const count = el("span", { class: "mmc-reference-preview-count", "aria-live": "polite" });
  const previous = el("button", { type: "button", text: "‹", "aria-label": t("Previous reference"),
    onclick: () => show(index - 1) });
  const next = el("button", { type: "button", text: "›", "aria-label": t("Next reference"),
    onclick: () => show(index + 1) });
  const navigation = el("div", { class: "mmc-reference-preview-nav", hidden: files.length < 2 },
    [previous, count, next]);
  const dialog = el("div", {
    class: `mmc-reference-preview${files.length ? "" : " mmc-reference-preview-empty"}`,
    role: "dialog", "aria-modal": true,
    "aria-label": caption || t("Reference preview"), tabindex: "-1",
  }, [
    el("div", { class: "mmc-reference-preview-head" }, [
      el("strong", { text: caption || t("Reference preview") }), closeButton,
    ]),
    details, stage, status,
    el("div", { class: "mmc-reference-preview-foot", hidden: !files.length }, [name, note, navigation]),
  ]);
  const overlay = el("div", {
    class: "mmc-overlay mmc-reference-preview-overlay",
    onpointerdown: (event) => { if (event.target === overlay) close(); },
    // A suspended replacement popover remains mounted. mountOverlay deliberately
    // leaves Escape to popovers, so this viewer also answers its own Escape.
    onkeydown: (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (!exitVideoFullscreen()) close();
    },
  }, [dialog]);

  function show(nextIndex) {
    if (closed || nextIndex < 0 || nextIndex >= files.length) return;
    stopMedia();
    index = nextIndex;
    const asset = files[index];
    onShow?.(asset);
    const audio = includeAudio && (asset.kind === "audio" || asset.track === "sound");
    const playable = asset.kind === "video" && !audio && !S.isRefMod(asset);
    name.textContent = asset.handle ? `@${asset.handle} · ${asset.filename}` : asset.filename;
    // Opt-in only for delivered card previews. Ordinary reference viewing
    // below deliberately retains its original, unframed file behavior.
    if (playable && playback?.source?.filename === asset.filename) {
      note.textContent = t("This preview uses the card's stored range and framing. Rendering and exported audio are unchanged.");
      note.hidden = false;
      status.hidden = true;
      playbackController = createCardPreview(playback.source, {
        key: playback.key, label: playback.label || name.textContent, hover: false,
        onError: () => {
          status.textContent = t("Preview unavailable. The file may be missing, or this browser may not support its format.");
          status.hidden = false;
        },
      });
      media = playbackController.media;
      stage.replaceChildren(playbackController.root);
      count.textContent = `${index + 1} / ${files.length}`;
      previous.disabled = index === 0;
      next.disabled = index === files.length - 1;
      if (document.activeElement === previous && previous.disabled) next.focus();
      if (document.activeElement === next && next.disabled) previous.focus();
      return;
    }
    const notes = [];
    if (playable) {
      notes.push(t("Source video preview — crop, trim and mirroring are not applied."));
      if (Number.isFinite(asset.trim?.start) && Number.isFinite(asset.trim?.end)) {
        notes.push(t("Configured range: {start}–{end} s", { start: asset.trim.start, end: asset.trim.end }));
      }
    } else if (S.isRefMod(asset)) {
      notes.push(t("RefMod preview image — the original video is not stored here."));
    }
    note.textContent = notes.join(" ");
    note.hidden = !notes.length;
    status.hidden = true;
    media = audio
      ? el("audio", { controls: true, preload: "metadata",
          src: viewUrl(asset.filename), "aria-label": name.textContent, tabindex: "0" })
      : playable
      ? el("video", { controls: true, playsinline: true, preload: "metadata",
          src: viewUrl(asset.filename), "aria-label": name.textContent, tabindex: "0" })
      : el("img", { src: viewUrl(asset.filename, { crop: originalImages ? null : S.thumbCrop(asset) }),
          alt: name.textContent });
    const current = media;
    media.onerror = () => {
      if (closed || media !== current) return;
      status.textContent = t("Preview unavailable. The file may be missing, or this browser may not support its format.");
      status.hidden = false;
    };
    stage.replaceChildren(media);
    count.textContent = `${index + 1} / ${files.length}`;
    previous.disabled = index === 0;
    next.disabled = index === files.length - 1;
    // Disabling the focused navigation button must not strand keyboard focus.
    if (document.activeElement === previous && previous.disabled) next.focus();
    if (document.activeElement === next && next.disabled) previous.focus();
  }

  // Focus guards let the browser tab through a video's native shadow controls.
  // Trapping Tab on the video host itself would skip play, seek and volume.
  const focusEdge = (last) => {
    const candidates = [...dialog.querySelectorAll("button:not(:disabled), video[controls], audio[controls], [tabindex='0']")]
      .filter((element) => !element.classList.contains("mmc-reference-preview-guard")
        && !element.closest("[hidden]") && element.getClientRects().length);
    (candidates[last ? candidates.length - 1 : 0] ?? dialog).focus();
  };
  dialog.prepend(el("span", { class: "mmc-reference-preview-guard", tabindex: "0", onfocus: () => focusEdge(true) }));
  dialog.append(el("span", { class: "mmc-reference-preview-guard", tabindex: "0", onfocus: () => focusEdge(false) }));
  unmount = mountOverlay(overlay, () => { if (!exitVideoFullscreen()) close(); });
  activeClose = close;
  if (files.length) show(index);
  else stage.append(el("p", { class: "mmc-reference-preview-empty-message", text: emptyMessage }));
  closeButton.focus({ preventScroll: true });
  return close;
}
