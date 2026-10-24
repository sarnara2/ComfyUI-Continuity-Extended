import { el, icon } from "./dom.js";
import { t } from "./i18n.js";
import { parseDialogue } from "./dialogue.js";

export function dialogueChip(span, onEdit = null) {
  if (!span.complete) return el("span", { class: "mmc-dialogue-incomplete",
    "data-say": span.raw, contenteditable: "false", text: span.raw,
    title: t("Unfinished dialogue: add </d> after the spoken words.") });
  const language = t(span.language || "Language not set");
  return el("span", { class: "mmc-say mmc-dialogue", contenteditable: "false",
    "data-say": span.raw, "data-language": span.language,
    title: onEdit ? t("Edit dialogue — {language}", { language }) : t("Dialogue — {language}", { language }),
    ...(onEdit ? { role: "button", tabindex: "0",
      onclick: (event) => { event.preventDefault(); event.stopPropagation(); onEdit(span); },
      onkeydown: (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); onEdit(span);
      } } : {}),
  }, [el("span", { class: "mmc-dialogue-icon", "aria-hidden": "true" }, [icon("speech")]),
    el("span", { class: "mmc-dialogue-language", text: language }),
    el("span", { class: "mmc-dialogue-words", text: span.words })]);
}

export function dialogueNodes(text, renderText = (value) => [document.createTextNode(value)], onEdit = null) {
  const out = [];
  let at = 0;
  for (const span of parseDialogue(text)) {
    if (span.start > at) out.push(...renderText(text.slice(at, span.start)));
    out.push(dialogueChip(span, onEdit));
    at = span.end;
  }
  if (at < text.length) out.push(...renderText(text.slice(at)));
  return out;
}
