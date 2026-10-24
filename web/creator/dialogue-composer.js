import { el, icon, mountOverlay } from "./dom.js";
import { t } from "./i18n.js";
import { viewUrl } from "./api.js";
import { castIntoPiece } from "./presets.js";
import { subjectFiles } from "./state.js";
import { DELIVERY, sayLine } from "./dialogue.js";
import { setDialogueEditor } from "./prompt.js";

const STORE = "continuity-dialogue-recipes-v1";
const LANGUAGE_STORE = "continuity-dialogue-language-v1";
const LANGUAGES = ["Korean", "English", "Japanese", "Chinese", "Spanish", "French",
  "German", "Portuguese", "Russian", "Italian", "Arabic"];
export const SOUNDS = [
  { id: "laugh", label: "Laughter", tag: "laughs", phrases: ["chuckles softly", "laughs", "laughs loudly"] },
  { id: "sigh", label: "Sigh", tag: "sighs", phrases: ["sighs softly", "sighs", "lets out a deep, audible sigh"] },
  { id: "gasp", label: "Gasp", tag: "gasps", phrases: ["gasps softly", "gasps", "gasps sharply"] },
  { id: "breath", label: "Breathing", tag: "breathes", phrases: ["breathes softly", "breathes audibly", "breathes heavily"] },
  { id: "cry", label: "Sobbing", tag: "sobs", phrases: ["sobs quietly", "sobs", "sobs loudly"] },
  { id: "cough", label: "Cough", tag: "coughs", phrases: ["coughs softly", "coughs", "coughs loudly"] },
  { id: "groan", label: "Groan", tag: "groans", phrases: ["groans softly", "groans", "groans loudly"] },
  { id: "hmm", label: "Humming in thought", tag: "hmm", phrases: ["makes a quiet thoughtful humming sound", "makes a thoughtful humming sound", "makes a prolonged thoughtful humming sound"] },
];

function readStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function localeLanguage() {
  let locale;
  try { locale = globalThis.app?.extensionManager?.setting?.get?.("Comfy.Locale"); } catch { /* browser locale below */ }
  return ({ ko: "Korean", ja: "Japanese", zh: "Chinese" })[(locale || navigator.language || "en").split("-")[0]] || "English";
}
export function dialogueRecipe(raw = {}) {
  const cues = Array.isArray(raw.cues) ? raw.cues : raw.sound || raw.soundText ? [raw] : [];
  return {
    language: LANGUAGES.includes(raw.language) ? raw.language : localeLanguage(),
    delivery: DELIVERY.some((entry) => entry.id === raw.delivery) ? raw.delivery : "says",
    voice: String(raw.voice ?? "").slice(0, 240),
    cues: cues.map((cue) => ({ sound: SOUNDS.some((entry) => entry.id === cue.sound) ? cue.sound : "",
      text: String(cue.text ?? cue.soundText ?? "").slice(0, 240),
      intensity: [0, 1, 2].includes(cue.intensity) ? cue.intensity : 1,
      placement: ["before", "cursor", "after"].includes(cue.placement) ? cue.placement : "before",
      at: Math.max(0, Number.isFinite(cue.at) ? Math.floor(cue.at) : 0),
    })).filter((cue) => cue.sound || cue.text.trim()),
    experimental: raw.experimental === true,
    mode: raw.mode === "sound" ? "sound" : "speech",
  };
}
function recipes() {
  const rows = readStore(STORE, []);
  return Array.isArray(rows) ? rows.filter((row) => typeof row?.name === "string")
    .map((row) => ({ name: row.name.slice(0, 60), favorite: row.favorite === true, ...dialogueRecipe(row),
      ...(row.saveWords === true ? { saveWords: true, words: String(row.words ?? "") } : {}) })) : [];
}

/** A recipe holds choices, never a person, reference, line, or segment. */
export function composeDialogue(options, who, words) {
  const handles = Array.isArray(who) ? who : [who];
  if (!handles.length || handles.some((handle) => !handle)) return "";
  const token = `(S${handles.map((handle) => `@${handle}`).join(",")})`;
  const config = dialogueRecipe(options);
  const event = (cue) => {
    const sound = SOUNDS.find((entry) => entry.id === cue.sound);
    const phrase = cue.text.trim() || sound?.phrases[cue.intensity] || "";
    return phrase ? `${token} ${phrase}${/[.!?。！？]$/.test(phrase) ? "" : "."}` : "";
  };
  if (config.mode === "sound") return config.cues.map(event).filter(Boolean).join("\n");
  const input = String(words ?? "");
  const spoken = input.trim();
  const leading = input.length - input.trimStart().length;
  if (!spoken) return "";
  const how = DELIVERY.find((entry) => entry.id === config.delivery) ?? DELIVERY[0];
  const lead = options.lead || (config.voice.trim() ? `${config.voice.trim().replace(/[,.]+$/, "")}, ${how.lead}` : null);
  const speak = (text) => text.trim() ? sayLine({ who: handles, language: config.language, delivery: config.delivery, lead }, text) : "";
  const cues = config.cues.map((cue) => ({ ...cue, at: cue.placement === "before" ? 0
    : cue.placement === "after" ? spoken.length : Math.max(0, Math.min(cue.at - leading, spoken.length)) }))
    .sort((a, b) => a.at - b.at);
  const parts = [];
  let at = 0, segment = "";
  for (const cue of cues) {
    segment += spoken.slice(at, cue.at);
    const sound = SOUNDS.find((entry) => entry.id === cue.sound);
    if (config.experimental && sound && !cue.text.trim()) segment += `${segment && !/\s$/.test(segment) ? " " : ""}<${sound.tag}> `;
    else { parts.push(speak(segment), event(cue)); segment = ""; }
    at = cue.at;
  }
  segment += spoken.slice(at);
  parts.push(speak(segment));
  return parts.filter(Boolean).join("\n");
}

function assetsFor(editor, box) {
  const state = box.hooks.getState();
  const all = [...(editor.castPiece?.assets ?? []), ...(box.hooks.getPool?.() ?? []), ...(state.pool ?? []), ...(state.assets ?? [])];
  return all.filter((asset, index) => asset?.handle && all.findIndex((other) => other.handle === asset.handle) === index);
}
const button = (text, action, props = {}) => el("button", {
  class: "mmc-pill", type: "button", text: t(text), onclick: action, ...props,
});
const note = (text) => el("p", { class: "mmc-dialogue-note", text: t(text) });

export function openDialogueComposer(anchor, editor, detail = null) {
  const standalone = !editor;
  const box = detail?.box ?? editor.prompt;
  editor ??= { state: box.hooks.getState(), root: box.root };
  const owner = editor.state;
  const original = box.getValue();
  const insertion = box.captureInsertion();
  const speech = detail?.speech;
  const editing = detail ? { start: speech?.start ?? detail.start, end: speech?.end ?? detail.end } : null;
  const valid = () => (standalone || editor.state === owner) && box.root.isConnected && box.getValue() === original;
  let config = dialogueRecipe({ language: readStore(LANGUAGE_STORE, localeLanguage()),
    ...(detail ? { language: detail.language, delivery: speech?.delivery } : {}) });
  let who = speech?.who?.[0] ?? "";
  let together = speech?.who?.length > 1 ? [...speech.who] : null;
  let words = detail?.words ?? "";
  // Unknown authored delivery stays verbatim until a delivery control changes it.
  let authoredLead = speech?.lead ?? null;
  let page = "line", source = "cast", recipePage = 0;
  let position = "cursor", favoriteOnly = false, saved = recipes(), previewPage = 0;
  let cueDraft = { sound: "", text: "", intensity: 1, placement: "before", at: 0 }, cuePage = 0;
  let wordsCursor = 0, saveWords = false;
  let closed = false;
  const status = el("div", { class: "mmc-dialogue-status", role: "status", "aria-live": "polite" });
  const currentCast = () => box.hooks.getCast?.() ?? [];
  const people = () => currentCast().filter((member) => (member.takes ?? "person") === "person");
  if (!who) who = people()[0]?.handle ?? "";
  const close = () => {
    if (closed) return;
    closed = true; unmount();
    if (anchor?.isConnected) anchor.focus();
  };
  const title = detail ? "Edit dialogue" : "Dialogue & sounds";
  const closeButton = button("Close", close, { class: "mmc-close", "aria-label": t("Close"), text: "✕" });
  const tabs = el("div", { class: "mmc-dialogue-tabs", role: "tablist", "aria-label": t("Dialogue & sounds") });
  const panel = el("div", { class: "mmc-dialogue-panel", role: "tabpanel" });
  const previewText = el("pre", { class: "mmc-dialogue-preview-text", "aria-label": t("Prompt preview") });
  const previewPager = el("div");
  const speakerInfo = el("div", { class: "mmc-dialogue-speaker-info" });
  const preview = el("aside", { class: "mmc-dialogue-preview" }, [
    el("strong", { text: t("Prompt preview") }), speakerInfo, previewText, previewPager,
    note("Speaker numbers are assigned automatically when the prompt is compiled."),
  ]);
  const dialog = el("div", { class: "mmc-modal mmc-dialogue-dialog", role: "dialog", "aria-modal": true,
    "aria-label": t(title), onkeydown: (event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex=\"-1\"])")]
        .filter((node) => node.getClientRects().length);
      if (!controls.length) return;
      const at = controls.indexOf(document.activeElement);
      if (event.shiftKey && at <= 0) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && (at < 0 || at === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    } }, [
    el("div", { class: "mmc-modal-head mmc-dialogue-head" }, [el("strong", { text: t(title) }), closeButton]), tabs,
    el("div", { class: "mmc-dialogue-content" }, [panel, preview]), status,
  ]);
  const overlay = el("div", { class: "mmc-overlay mmc-dialogue-overlay", onpointerdown: (event) => {
    if (event.target === overlay) { event.preventDefault(); close(); }
  } }, [dialog]);

  const selectPage = (next) => { page = next; status.textContent = ""; render(); };
  const selection = (label, values, chosen, change) => el("div", { class: "mmc-dialogue-control" }, [
    el("span", { class: "mmc-dialogue-label", text: t(label) }),
    el("div", { class: "mmc-dialogue-choices" }, values.map(([value, name]) => button(name, () => change(value), {
      "aria-pressed": String(chosen === value), "data-dialogue-value": value,
    }))),
  ]);
  const line = () => {
    if (/<\/?d>/.test(words) || /<\/?d>/.test(config.voice)
        || config.cues.some((cue) => /<\/?d>/.test(cue.text))) return "";
    if (detail && !speech) {
      if (!words.trim()) return "";
      return `<d>[${config.language}] ${words.trim()}</d>`;
    }
    return composeDialogue({ ...config, lead: authoredLead }, together ?? who, words);
  };
  const repaintPreview = () => {
    const raw = line();
    const heard = new Set();
    const scan = `${editor.castPiece?.prompt ?? ""}\n${original}\n${raw}`;
    for (const match of scan.matchAll(/\(S(@[A-Za-z][A-Za-z0-9_]*(?:\s*,\s*@[A-Za-z][A-Za-z0-9_]*)*)\)/g)) {
      for (const name of match[1].split(",")) heard.add(name.trim().slice(1));
    }
    const ids = new Map(currentCast().filter((member) => member.voice || heard.has(member.handle))
      .map((member, index) => [member.handle, `S${index + 1}`]));
    const readable = raw.replace(/\(S(@[A-Za-z][A-Za-z0-9_]*(?:\s*,\s*@[A-Za-z][A-Za-z0-9_]*)*)\)/g, (_, names) => {
      const handles = names.split(",").map((name) => name.trim().slice(1));
      return `${handles.map((name) => `@${name}`).join(" and ")} (${handles.map((name) => ids.get(name) ?? "S?").join(",")})`;
    });
    // Explicit pages keep long user text readable without growing or clipping the dialog.
    const chunks = readable.match(/[\s\S]{1,300}/g) ?? [t("Choose a speaker and write a line, or choose a sound.")];
    previewPage = Math.min(previewPage, chunks.length - 1);
    previewText.textContent = /<\/?d>/.test(words) ? t("Enter spoken words without <d> or </d>; the dialog adds those tags.") : chunks[previewPage];
    previewPager.replaceChildren(...(chunks.length > 1 ? [pager(previewPage, chunks.length, (value) => {
      previewPage = value; repaintPreview();
    })] : []));
    const member = currentCast().find((entry) => entry.handle === who);
    speakerInfo.textContent = detail && !speech ? t("The existing speaker wording stays in place.")
      : member ? `@${member.handle}` : t("Choose a speaker");
    applyButton.disabled = !line();
  };
  const apply = (atEnd = false) => {
    if (!valid()) { status.textContent = t("This segment changed while the dialog was open. Reopen the dialog before applying."); return; }
    if (!(detail && !speech) && !(together ?? [who]).every((handle) => currentCast().some((member) => member.handle === handle))) {
      status.textContent = t("This speaker is no longer in Cast. Choose a speaker again."); return;
    }
    const value = line();
    if (!value) return;
    let range = editing;
    if (!range) {
      const chosen = atEnd ? "end" : position;
      range = chosen === "front" ? { start: 0, end: 0 }
        : chosen === "end" || !insertion ? { start: original.length, end: original.length } : insertion;
    }
    const before = original.slice(0, range.start), after = original.slice(range.end);
    const text = `${before && !/\s$/.test(before) ? "\n" : ""}${value}${after && !/^\s/.test(after) ? "\n" : ""}`;
    // The old body draft must not keep replacing the line we just authored.
    const field = box === editor.prompt ? "prompt" : detail?.field;
    if (field && owner.refined) editor.refinePanel.clearField(field);
    box.replaceRange(range, text);
    writeStore(LANGUAGE_STORE, config.language);
    close();
  };
  const applyButton = button(detail ? "Replace this dialogue" : "Insert dialogue", () => apply(), { class: "mmc-pill active", "data-dialogue-apply": "" });
  const copyButton = button("Copy", async () => {
    try { await navigator.clipboard.writeText(line()); status.textContent = t("Copied."); }
    catch { status.textContent = t("Copy failed. Select and copy the preview text."); }
  });
  const footer = el("div", { class: "mmc-dialogue-footer" }, [
    copyButton,
    ...(!detail ? [button("Add to end", () => apply(true))] : []),
    applyButton,
  ]);
  dialog.append(footer);

  function linePage() {
    const speaker = el("select", { "aria-label": t("Speaker"), onchange: (event) => {
      if (event.target.value !== "__together") { who = event.target.value; together = null; }
      authoredLead = null; repaintPreview();
    } }, [el("option", { value: "", text: t("Choose a speaker") }),
      ...(together ? [el("option", { value: "__together", text: together.map((handle) => `@${handle}`).join(" + ") })] : []), ...people().map((member) => el("option", {
      value: member.handle, text: `@${member.handle}`,
    }))]);
    speaker.value = together ? "__together" : who;
    if (detail && !speech) speaker.disabled = true;
    const language = el("select", { "aria-label": t("Spoken language"), onchange: (event) => {
      config.language = event.target.value; repaintPreview();
    } }, LANGUAGES.map((value) => el("option", { value, text: t(value) })));
    language.value = config.language;
    const field = el("textarea", { rows: 4, class: "mmc-dialogue-words", "aria-label": t("Words to speak"),
      placeholder: t("Type only the words that should be heard."), oninput: (event) => { words = event.target.value; wordsCursor = event.target.selectionStart; repaintPreview(); },
      onselect: (event) => { wordsCursor = event.target.selectionStart; },
      onkeyup: (event) => { wordsCursor = event.target.selectionStart; },
      onclick: (event) => { wordsCursor = event.target.selectionStart; } });
    field.value = words;
    const location = selection("Insert position", [["cursor", "Cursor"], ["front", "Start"], ["end", "End"]], position,
      (value) => { position = value; render(); });
    const examples = el("select", { "aria-label": t("Line presets"), onchange: (event) => {
      const selected = examples.selectedOptions[0];
      if (!selected.dataset.words) return;
      words = selected.dataset.words; config.language = selected.dataset.language; render();
    } }, [el("option", { value: "", text: t("Line presets — or write your own") }),
      ...[["Korean greeting", "Korean", "안녕하세요. 만나서 반가워요."], ["Korean reply", "Korean", "저도 반갑습니다."],
        ["English greeting", "English", "Hello. It is nice to meet you."], ["Japanese greeting", "Japanese", "こんにちは。お会いできてうれしいです。"]]
        .map(([name, language, text]) => el("option", { value: name, text: t(name), "data-language": language, "data-words": text }))]);
    return [
      el("div", { class: "mmc-dialogue-two" }, [el("label", {}, [t("Speaker"), speaker]), el("label", {}, [t("Spoken language"), language])]),
      ...(!(detail && !speech) ? [button("Choose from Cast or references", () => selectPage("speaker"), { class: "mmc-pill mmc-dialogue-open-speakers" })] : []),
      el("label", { class: "mmc-dialogue-control" }, [t("Words to speak"), field]),
      examples,
      note("Only these words are spoken. The rest is a description."),
      ...(!detail ? [location] : [note("Only the selected dialogue is replaced.")]),
    ];
  }

  function speakerPage() {
    const assets = assetsFor(editor, box);
    const rows = source === "cast" ? people() : assets.filter((asset) => asset.role === "reference" && asset.kind === "image");
    const cards = rows.map((row) => {
      const cast = source === "cast";
      const image = cast ? assets.find((asset) => subjectFiles(row).includes(asset.handle) && asset.kind === "image") : row;
      const choose = () => {
        if (!valid()) { status.textContent = t("This segment changed while the dialog was open. Reopen the dialog before applying."); return; }
        together = null;
        if (cast) who = row.handle;
        else {
          const existing = people().find((member) => subjectFiles(member).includes(row.handle));
          if (existing) who = existing.handle;
          else {
            // Explicit action: references are not people until the user chooses this button.
            if (editor.castPiece) {
              const subject = castIntoPiece({ handle: "subject", takes: "person", description: "" }, editor.castPiece);
              subject.from = [row.handle]; who = subject.handle;
              editor.commit();
            } else if (box.hooks.castVoice) {
              who = box.hooks.castVoice({ handle: "subject", takes: "person", files: [{
                filename: row.filename, kind: row.kind, slot: "from", ref_size: row.ref_size,
              }] }) || "";
            }
          }
        }
        authoredLead = null; selectPage("line");
      };
      return el("div", { class: "mmc-dialogue-speaker-card", role: "listitem" }, [
        image ? el("img", { src: viewUrl(image.filename, { preview: true }), alt: "", loading: "lazy" }) : icon("face"),
        el("div", {}, [el("strong", { text: `@${row.handle}` }),
          el("span", { text: cast ? row.description || t("In Cast") : row.description || t("Project image reference") })]),
        button(cast ? "Choose" : "Use as a person speaker", choose, { "data-dialogue-speaker": row.handle,
          disabled: !cast && !editor.castPiece && !box.hooks.castVoice }),
      ]);
    });
    const sourceControl = selection("Speaker source", [["cast", "Cast"], ["references", "Project references"]], source,
      (value) => { source = value; render(); });
    sourceControl.lastElementChild.append(button("Dialogue", () => selectPage("line"), {
      class: "mmc-pill mmc-dialogue-speaker-back", text: `← ${t("Dialogue")}`,
    }));
    return [
      sourceControl,
      note(source === "cast" ? "Choose the person who makes the sound. A speaker number is not a Subject number."
        : "Use this only for an image containing the intended person. This explicitly adds that person to Cast; scene and style images are not speakers."),
      el("div", { class: "mmc-dialogue-speakers", role: "list", tabindex: "0", "aria-label": t("Choose a speaker") },
        cards.length ? cards : [note("No matching speakers or image references here yet.")]),
    ];
  }

  function voicePage() {
    const voice = el("input", { type: "text", maxLength: 240, "aria-label": t("Voice and emotion"),
      placeholder: t("e.g. in a calm, low voice"), oninput: (event) => {
        config.voice = event.target.value; authoredLead = null; repaintPreview();
      } });
    voice.value = config.voice;
    return [
      selection("What to make", [["speech", "Dialogue"], ["sound", "Sound only"]], config.mode,
        (value) => { config.mode = value; render(); }),
      ...(config.mode === "speech" ? [selection("Delivery", DELIVERY.map((entry) => [entry.id, entry.label]), config.delivery,
        (value) => { config.delivery = value; authoredLead = null; render(); }),
      el("label", { class: "mmc-dialogue-control" }, [t("Voice and emotion"), voice])] : []),
      note("Voice and emotion are ordinary prompt text outside the dialogue tags. You can type your own description."),
      button("Choose nonverbal sounds", () => selectPage("sounds")),
    ];
  }

  function soundsPage() {
    const choose = el("select", { "aria-label": t("Nonverbal sound"), onchange: (event) => {
      cueDraft.sound = event.target.value;
    } }, [el("option", { value: "", text: t("None") }), ...SOUNDS.map((sound) => el("option", { value: sound.id, text: t(sound.label) }))]);
    choose.value = cueDraft.sound;
    const custom = el("input", { type: "text", maxLength: 240, "aria-label": t("Custom sound instruction"),
      placeholder: t("Or describe a sound, e.g. clears their throat quietly"), oninput: (event) => { cueDraft.text = event.target.value; } });
    custom.value = cueDraft.text;
    const perPage = window.innerHeight < 720 ? 1 : 3;
    const total = Math.max(1, Math.ceil(config.cues.length / perPage));
    cuePage = Math.min(cuePage, total - 1);
    return [
      el("div", { class: "mmc-dialogue-two" }, [el("label", {}, [t("Nonverbal sound"), choose]),
        el("label", {}, [t("Custom sound instruction"), custom])]),
      selection("Sound intensity", [[0, "Soft"], [1, "Normal"], [2, "Strong"]], cueDraft.intensity,
        (value) => { cueDraft.intensity = value; render(); }),
      selection("Sound placement", [["before", "Before the line"], ["cursor", "Cursor in the line"], ["after", "After the line"]], cueDraft.placement,
        (value) => { cueDraft.placement = value; render(); }),
      el("div", { class: "mmc-dialogue-cue-tools" }, [button("Add sound", () => {
        if (!cueDraft.sound && !cueDraft.text.trim()) return;
        config.cues.push({ ...cueDraft, at: wordsCursor });
        cueDraft = { sound: "", text: "", intensity: 1, placement: "before", at: 0 }; render();
      }),
      button("Experimental inline sound tags", () => { config.experimental = !config.experimental; render(); }, {
        role: "switch", "aria-checked": String(config.experimental), class: "mmc-pill mmc-dialogue-experiment",
      })]),
      el("div", { class: "mmc-dialogue-cues" }, config.cues.slice(cuePage * perPage, cuePage * perPage + perPage).map((cue, offset) => {
        const index = cuePage * perPage + offset;
        const sound = SOUNDS.find((entry) => entry.id === cue.sound);
        return el("div", { class: "mmc-dialogue-cue" }, [
          el("span", { text: `${cue.text || t(sound?.label || "Sound")} · ${t({ before: "Before the line", cursor: "Cursor in the line", after: "After the line" }[cue.placement])}` }),
          button("Move earlier", () => { [config.cues[index - 1], config.cues[index]] = [config.cues[index], config.cues[index - 1]]; render(); }, { text: "↑", disabled: index === 0, "aria-label": t("Move earlier") }),
          button("Move later", () => { [config.cues[index + 1], config.cues[index]] = [config.cues[index], config.cues[index + 1]]; render(); }, { text: "↓", disabled: index === config.cues.length - 1, "aria-label": t("Move later") }),
          button("Remove sound", () => { config.cues.splice(index, 1); render(); }, { text: "✕", "aria-label": t("Remove sound") }),
        ]);
      })),
      ...(total > 1 ? [pager(cuePage, total, (value) => { cuePage = value; render(); })] : []),
      note(config.experimental ? "Experimental: inline sound tags may be spoken aloud, ignored, or vary by generation."
        : "Sound actions are written as ordinary descriptions outside <d>. Strength changes the description, not a guaranteed audio volume."),
    ];
  }

  function pager(at, total, change) {
    return el("div", { class: "mmc-dialogue-pager" }, [button("Previous", () => change(at - 1), { disabled: at <= 0 }),
      el("span", { text: `${at + 1} / ${total}` }), button("Next", () => change(at + 1), { disabled: at >= total - 1 })]);
  }

  function recipePageContent() {
    const matching = saved.filter((row) => !favoriteOnly || row.favorite)
      .sort((a, b) => Number(b.favorite) - Number(a.favorite));
    const count = Math.max(1, Math.ceil(matching.length / 4));
    recipePage = Math.min(recipePage, count - 1);
    const name = el("input", { type: "text", maxLength: 60, placeholder: t("Combination name"), "aria-label": t("Combination name") });
    const persist = () => {
      if (!writeStore(STORE, saved)) status.textContent = t("Browser storage is unavailable. Choices remain available in this dialog only.");
    };
    const include = el("input", { type: "checkbox", "aria-label": t("Include these spoken words"), onchange: (event) => { saveWords = event.target.checked; } });
    include.checked = saveWords;
    return [note("Save language, delivery and sound choices. A speaker or reference file is never saved. Include the current words only if you explicitly choose that option."),
      el("label", { class: "mmc-dialogue-save-words" }, [include, t("Include these spoken words")]),
      el("div", { class: "mmc-dialogue-save" }, [name, button("Save combination", () => {
        if (!name.value.trim()) { status.textContent = t("Enter a combination name."); return; }
        const recipe = dialogueRecipe(config);
        if (!saveWords) for (const cue of recipe.cues) if (cue.placement === "cursor") cue.at = 0;
        saved = [{ name: name.value.trim(), favorite: false, ...recipe,
          ...(saveWords ? { saveWords: true, words } : {}) }, ...saved.filter((row) => row.name !== name.value.trim())];
        persist(); recipePage = 0; render();
      })]),
      button("Favorites only", () => { favoriteOnly = !favoriteOnly; recipePage = 0; render(); }, { "aria-pressed": String(favoriteOnly) }),
      el("div", { class: "mmc-dialogue-recipes" }, matching.slice(recipePage * 4, recipePage * 4 + 4).map((row) =>
        el("div", { class: "mmc-dialogue-recipe" }, [button(row.name, () => {
          config = dialogueRecipe(row); if (row.saveWords) words = row.words;
          else for (const cue of config.cues) if (cue.placement === "cursor") cue.at = wordsCursor;
          authoredLead = null; selectPage("line");
        }, { text: row.name, class: "mmc-pill mmc-dialogue-recipe-name" }),
        button("Favorite", () => { row.favorite = !row.favorite; persist(); render(); }, { text: row.favorite ? "★" : "☆", "aria-pressed": String(row.favorite), "aria-label": t("Favorite") }),
        button("Delete", () => { saved = saved.filter((item) => item !== row); persist(); render(); }, { text: "✕", "aria-label": `${t("Delete")} ${row.name}` })]))),
      ...(!matching.length ? [note("No saved combinations yet.")] : []), pager(recipePage, count, (value) => { recipePage = value; render(); }),
    ];
  }

  function helpPage() {
    return [
      el("strong", { text: t("Dialogue syntax") }),
      // A readable protocol example, not the node's stable storage token.
      el("code", { class: "mmc-dialogue-example", text: sayLine({ who: ["subject"],
        language: "Korean", delivery: "says" }, "안녕하세요.").replace("(S@subject)", "@subject (S1)") }),
      note("<d> and </d> enclose the words to speak. [Korean] sets the spoken language, not nationality."),
      note("@subject identifies a person. S1 identifies a vocal source. The node stores the person handle and assigns the number when compiling."),
      note("Describe voice, emotion and audible actions outside <d>. Sound-only lines do not need dialogue tags."),
      note("Experimental inline tags are community experiments, not guaranteed model controls. Natural descriptions are the default."),
      el("div", { class: "mmc-dialogue-links" }, [
        el("a", { href: "https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md#44-speakers-dialogue-and-singing", target: "_blank", rel: "noopener noreferrer", text: t("Official speech guide") }),
        el("a", { href: "https://www.reddit.com/r/StableDiffusion/comments/1vosqqw/psa_try_experimenting_with_tags_in_minimax_h3/", target: "_blank", rel: "noopener noreferrer", text: t("Community sound-tag experiment") }),
      ]),
    ];
  }

  function render() {
    dialog.dataset.page = page;
    const pages = [["line", "Dialogue"], ...(!(detail && !speech) ? [["voice", "Delivery"], ["sounds", "Sounds"],
      ["recipes", "Saved combinations"]] : []), ["preview", "Preview"], ["help", "Help"]];
    tabs.replaceChildren(...pages.map(([id, name]) => button(name,
      () => selectPage(id), { role: "tab", "aria-selected": String(page === id || (page === "speaker" && id === "line")), "data-dialogue-page": id })));
    panel.replaceChildren(...(page === "line" ? linePage() : page === "speaker" ? speakerPage()
      : page === "voice" ? voicePage() : page === "sounds" ? soundsPage() : page === "recipes" ? recipePageContent() : page === "help" ? helpPage() : []));
    if (page === "preview") panel.append(preview);
    else if (preview.parentElement !== panel.parentElement) panel.parentElement.append(preview);
    repaintPreview();
  }
  const unmount = mountOverlay(overlay, close);
  render();
  closeButton.focus();
  return close;
}

export function openPromptDialogue(anchor, box, detail) {
  return openDialogueComposer(anchor, null, { ...detail, box });
}

setDialogueEditor((detail) => openPromptDialogue(detail.box.root, detail.box, detail));
