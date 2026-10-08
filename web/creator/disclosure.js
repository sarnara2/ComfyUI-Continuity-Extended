// Timeline-only section folding. This is presentation state, never creator_data.
import { el } from "./dom.js";

let nextSection = 0;

/** Keep the real editor/list mounted while hiding it. Actions live beside the
 * toggle, not inside it: adding a reference must not also fold its shelf. */
export function createDisclosure({ title, hint = "", content, actions = [], onBeforeCollapse,
                                   initialOpen = true, onOpenChange, inlineActions = false }) {
  const id = `mmc-tl-section-${++nextSection}`;
  const titleId = `${id}-title`;
  const body = el("div", { id, class: "mmc-tl-section-body" }, content ? [content] : []);
  const name = el("span", { id: titleId, class: "mmc-tl-section-title", text: title });
  const detail = el("span", { class: "mmc-tl-section-hint", text: hint });
  detail.hidden = !hint;
  const arrow = el("span", { class: "mmc-tl-section-arrow", "aria-hidden": "true" });
  let opened = initialOpen !== false;
  const toggle = el("button", {
    type: "button", class: "mmc-tl-section-toggle", "aria-controls": id,
    "aria-expanded": "true", "aria-labelledby": titleId,
    onclick: () => setOpen(!opened),
  }, [arrow, el("span", { class: "mmc-tl-section-copy" }, [name, detail])]);
  const actionHost = el("div", { class: "mmc-tl-section-actions" }, actions);
  const head = el("div", {
    class: `mmc-tl-section-head${inlineActions ? " mmc-tl-section-head-inline" : ""}`,
    onclick: (event) => {
      if (inlineActions && !toggle.contains(event.target) && !actionHost.contains(event.target)) {
        setOpen(!opened);
      }
    },
  }, [toggle, actionHost]);
  const root = el("section", { class: "mmc-tl-section" }, [head, body]);

  function setOpen(next) {
    const value = Boolean(next);
    const changed = opened !== value;
    if (opened && !value) {
      onBeforeCollapse?.();
      // Keyboard/programmatic folding must not strand focus inside hidden UI.
      if (body.contains(document.activeElement)) toggle.focus();
    }
    opened = value;
    body.hidden = !opened;
    toggle.setAttribute("aria-expanded", String(opened));
    arrow.textContent = opened ? "⌄" : "›";
    if (changed) onOpenChange?.(opened);
  }
  setOpen(opened);
  return {
    root, head, body, toggle, titleId, setOpen, isOpen: () => opened,
    setText(nextTitle, nextHint = "") {
      name.textContent = nextTitle;
      detail.textContent = nextHint;
      detail.hidden = !nextHint;
    },
    setActions(...nodes) { actionHost.replaceChildren(...nodes.filter(Boolean)); },
  };
}
