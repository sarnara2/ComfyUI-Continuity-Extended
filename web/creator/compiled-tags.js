import { el } from "./dom.js";
import { t } from "./i18n.js";
import { tagIndex } from "./state.js";
import { dialogueNodes } from "./dialogue-view.js";

const MODEL_TAG = "<(?:Picture|Image|Video|Audio|Sound|Subject)[ \\t]+\\d+>";
const HANDLE_TAG = "(?:(?<![\\w@])|(?<=\\(S))@[A-Za-z](?:[A-Za-z]*-\\d+(?::[a-z]+)?|[A-Za-z0-9_]*)(?![A-Za-z0-9_-])";
const WORD = "[\\p{L}\\p{N}_]";
const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function tokenPattern(tags) {
  const labels = [...new Set(tags.map(binding => binding.label).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  // Natural panel/frame labels come from the current family, never from a
  // guessed numbering scheme. Longest first keeps panel qualifiers intact.
  const known = labels.map(label =>
    (/^[\p{L}\p{N}_]/u.test(label) ? `(?<!${WORD})` : "") + escaped(label)
    + (/[\p{L}\p{N}_]$/u.test(label) ? `(?!${WORD})` : ""));
  return new RegExp([...known, MODEL_TAG, HANDLE_TAG].join("|"), "gu");
}
const selecting = () => {
  const selection = globalThis.getSelection?.() ?? globalThis.window?.getSelection?.();
  return Boolean(selection && !selection.isCollapsed);
};

/** Selectable presentation only: neither prompt text nor reference bindings
 *  are rewritten. Unknown labels remain inspectable without guessing a file. */
export function compiledTagNodes(text, tags = [], onOpen = null) {
  return dialogueNodes(text, (plain) => referenceTagNodes(plain, tags, onOpen));
}

function referenceTagNodes(text, tags, onOpen) {
  const bindings = new Map(tags.map(binding => [binding.label, binding]));
  const nodes = [];
  let offset = 0;
  for (const match of text.matchAll(tokenPattern(tags))) {
    if (match.index > offset) nodes.push(document.createTextNode(text.slice(offset, match.index)));
    const label = match[0];
    const rawHandle = label.startsWith("@") ? label.slice(1).split(":")[0] : null;
    const current = rawHandle && tags.find(binding => binding.handles?.includes(rawHandle));
    const binding = bindings.get(label) ?? (current ? { ...current, label }
      : { label, handles: rawHandle ? [rawHandle] : [], assets: [], reason: "unbound" });
    const missing = binding.reason === "unbound";
    let start = null, dragged = false, pending = null;
    const cancel = () => { clearTimeout(pending); pending = null; };
    const open = () => {
      if (span.isConnected && !selecting()) onOpen?.(binding, span);
    };
    const moved = event => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) dragged = true;
    };
    const span = el("span", {
      class: `mmc-compiled-tag${missing ? " mmc-ref-missing" : ""} mmc-tag-${tagIndex(binding.handles?.[0] ?? label)}`,
      text: label, role: "button", tabindex: "0", "aria-haspopup": "dialog",
      "data-model-tag": label, "aria-label": t("Preview {tag}", { tag: label }),
      ...(missing ? { title: t("This tag has no binding in the current pass.") } : {}),
      onpointerdown: event => {
        cancel(); dragged = event.button !== 0;
        start = { x: event.clientX, y: event.clientY };
      },
      onpointermove: moved,
      onpointerup: moved,
      onpointercancel: () => { dragged = true; cancel(); },
      onclick: event => {
        cancel();
        if (event.button !== 0 || event.detail > 1 || dragged || selecting()) return;
        // Give native double-click word selection priority over opening a dialog.
        pending = setTimeout(open, 260);
      },
      ondblclick: cancel,
      onkeydown: event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); event.stopPropagation();
          if (!event.repeat) { cancel(); open(); }
        }
      },
    });
    nodes.push(span);
    offset = match.index + label.length;
  }
  if (offset < text.length) nodes.push(document.createTextNode(text.slice(offset)));
  return nodes;
}
