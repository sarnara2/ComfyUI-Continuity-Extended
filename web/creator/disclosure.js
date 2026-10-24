// Timeline-only section folding. This is presentation state, never creator_data.
import { el } from "./dom.js";

let nextSection = 0;

/** Keep the real editor/list mounted while hiding it. Actions live beside the
 * toggle, not inside it: adding a reference must not also fold its shelf. */
export function createDisclosure({ title, hint = "", summary = false, content, actions = [], onBeforeCollapse,
                                   initialOpen = true, onOpenChange, inlineActions = false,
                                   actionsBeforeHint = false }) {
  const id = `mmc-tl-section-${++nextSection}`;
  const titleId = `${id}-title`;
  const body = el("div", { id, class: "mmc-tl-section-body" }, content ? [content] : []);
  const name = el("span", { id: titleId, class: "mmc-tl-section-title", text: title, title });
  const detail = el("span", { class: "mmc-tl-section-hint", text: hint });
  detail.hidden = !hint;
  const arrow = el("span", { class: "mmc-tl-section-arrow", "aria-hidden": "true" });
  let opened = initialOpen !== false;
  const toggle = el("button", {
    type: "button", class: "mmc-tl-section-toggle", "aria-controls": id,
    "aria-expanded": "true", "aria-labelledby": titleId,
    onclick: () => setOpen(!opened),
  }, [arrow, el("span", { class: "mmc-tl-section-copy" }, actionsBeforeHint ? [name] : [name, detail])]);
  const actionHost = el("div", { class: "mmc-tl-section-actions" }, actions);
  const head = el("div", {
    class: `mmc-tl-section-head${inlineActions ? " mmc-tl-section-head-inline" : ""}${actionsBeforeHint ? " mmc-tl-section-head-leading" : ""}`,
    onclick: (event) => {
      if ((inlineActions || actionsBeforeHint) && !toggle.contains(event.target) && !actionHost.contains(event.target)) {
        setOpen(!opened);
      }
    },
  }, actionsBeforeHint ? [toggle, actionHost, detail] : [toggle, actionHost]);
  const root = el("section", { class: `mmc-tl-section${summary ? " mmc-tl-section-summary" : ""}` }, [head, body]);

  function setOpen(next) {
    const value = Boolean(next);
    const changed = opened !== value;
    if (opened && !value) {
      onBeforeCollapse?.();
      // Keyboard/programmatic folding must not strand focus inside hidden UI.
      if (body.contains(document.activeElement)) toggle.focus();
    }
    opened = value;
    root.setAttribute("data-open", String(opened));
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
      name.title = nextTitle;
      detail.textContent = nextHint;
      detail.hidden = !nextHint;
    },
    setHint(nextHint = "") {
      detail.textContent = nextHint;
      detail.hidden = !nextHint;
    },
    setHintNodes(...nodes) {
      const visible = nodes.filter(Boolean);
      detail.replaceChildren(...visible);
      detail.hidden = !visible.length;
    },
    setActions(...nodes) { actionHost.replaceChildren(...nodes.filter(Boolean)); },
  };
}
