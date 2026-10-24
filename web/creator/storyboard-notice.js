import { el, mountOverlay } from "./dom.js";
import { t } from "./i18n.js";

export function storyboardGuidance(lines) {
  return el("div", { class: `mmc-storyboard-guidance${lines.length > 7 ? " mmc-storyboard-guidance-long" : ""}`, role: "note" },
    lines.map((text) => el("p", { text })));
}

export function confirmStoryboardChange({ title = t("Storyboard setting change"), lines,
  confirmText = t("Apply setting") }, { returnFocus = null, onApply, onClose = null }) {
  const previousFocus = document.activeElement;
  let closed = false;
  let unmount = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    unmount();
    onClose?.();
    const focus = returnFocus?.isConnected ? returnFocus : previousFocus;
    if (focus?.isConnected) focus.focus?.({ preventScroll: true });
  };
  const closeButton = el("button", { class: "mmc-close", type: "button", text: "×",
    title: t("Close"), "aria-label": t("Close"), onclick: close });
  const content = el("div", { class: "mmc-storyboard-confirm-body", tabindex: "0" },
    [storyboardGuidance(lines)]);
  const cancel = el("button", { class: "mmc-pill mmc-storyboard-confirm-cancel", type: "button",
    text: t("Cancel"), onclick: close });
  const apply = el("button", { class: "mmc-pill mmc-storyboard-confirm-apply", type: "button",
    text: confirmText, onclick: () => {
      if (closed) return;
      close();
      onApply?.();
    } });
  const focusOrder = [closeButton, content, cancel, apply];
  const dialog = el("div", { class: "mmc-storyboard-confirm", role: "dialog", "aria-modal": true,
    "aria-label": title, onkeydown: (event) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close();
      } else if (event.key === "Tab") {
        event.preventDefault(); event.stopPropagation();
        const at = focusOrder.indexOf(document.activeElement);
        const next = at < 0 ? (event.shiftKey ? focusOrder.length - 1 : 0)
          : (at + (event.shiftKey ? -1 : 1) + focusOrder.length) % focusOrder.length;
        focusOrder[next].focus();
      }
    } }, [
    el("div", { class: "mmc-storyboard-confirm-head" }, [el("strong", { text: title }), closeButton]),
    content,
    el("div", { class: "mmc-storyboard-confirm-actions" }, [cancel, apply]),
  ]);
  const overlay = el("div", { class: "mmc-overlay mmc-storyboard-confirm-overlay",
    onpointerdown: (event) => {
      if (event.target !== overlay) return;
      event.preventDefault(); close();
    },
  }, [dialog]);
  unmount = mountOverlay(overlay, close);
  cancel.focus({ preventScroll: true });
  return close;
}
