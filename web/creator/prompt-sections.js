import { el, icon, svg, mountOverlay } from "./dom.js";
import { PromptBox } from "./prompt.js";
import { createDisclosure } from "./disclosure.js";
import { t } from "./i18n.js";
import { localizeDiagnostic } from "./server-messages.js";
import * as S from "./state.js";
import { compiledTagNodes } from "./compiled-tags.js";
import { openCompiledTagPreview } from "./compiled-tag-preview.js";
import { clearButton } from "./clear.js";
import { refineButton, refineActivity } from "./refine.js";
import { openTaskHelp, openTaskPresets } from "./summary-tasks.js";
import { openDialogueComposer } from "./dialogue-composer.js";

const FIELDS = new Set(["subject_definitions", "summary", "retention_analysis",
  "detailed_description", "integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"]);
const LOCK_HELP = "These rules were written in Cast. Edit their contents in the Cast tab.";

// Opening a saved prompt does not rewrite it. Explicit sections move into the
// new fields only on the first edit; quoted dialogue and fenced examples stay prose.
export function splitExplicitPrompt(text) {
  const sections = {}, plain = [];
  let name = "", lines = [], fence = "", quote = "";
  const flush = () => {
    const value = lines.join("\n").trim();
    if (name) sections[name] = [sections[name], value].filter(Boolean).join("\n\n");
    else if (value) plain.push(value);
    lines = [];
  };
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trimStart();
    const mark = trimmed.match(/^(`{3,}|~{3,})/);
    if (mark && !quote) {
      if (!fence) fence = mark[1][0];
      else if (fence === mark[1][0]) fence = "";
      lines.push(line);
      continue;
    }
    let quotedLine = line;
    let matched = false;
    if (!fence && !quote) {
      const heading = line.match(/^[ \t]*([a-z_]+)[ \t]*:[ \t]*(.*)$/);
      if (heading && FIELDS.has(heading[1])) {
        flush(); name = heading[1]; lines.push(heading[2]);
        quotedLine = heading[2]; matched = true;
      }
    }
    if (!matched) lines.push(line);
    if (!fence) {
      if (quote) {
        const end = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`(?<!\\\\)${end}`).test(quotedLine)) quote = "";
      } else {
        const opening = quotedLine.match(/^\s*("""|'''|[“‘])/);
        if (opening) {
          const end = ({ "“": "”", "‘": "’" })[opening[1]] ?? opening[1];
          if (!quotedLine.slice(opening[0].length).includes(end)) quote = end;
        } else if ((quotedLine.match(/(?<!\\)"/g)?.length ?? 0) % 2) quote = '"';
      }
    }
  }
  flush();
  const body = [...plain, sections.detailed_description, sections.integrated_multimodal_description];
  for (const key of ["subject_definitions", "overall_soundscape", "non_diegetic_music"]) {
    if (sections[key]) body.push(`${key}:\n${sections[key]}`);
  }
  const explicit = Object.keys(sections).length > 0;
  return { body: explicit ? body.filter(Boolean).join("\n\n") : String(text ?? ""), sections, explicit };
}

export function refineSources(state) {
  const parsed = splitExplicitPrompt(state.prompt);
  const sources = { prompt: parsed.body };
  for (const name of ["summary", "retention_analysis"]) {
    const legacy = parsed.sections[name] ?? "";
    if (name === "retention_analysis" && Array.isArray(state.retention_blocks)) {
      const texts = state.retention_blocks.filter((block) => block.type === "text").map((block) => block.text ?? "");
      if (legacy && !texts.some((text) => text.trim() === legacy.trim())) texts.unshift(legacy);
      sources[name] = texts.join("\n\n") || legacy;
      continue;
    }
    const written = String(state.prompt_sections?.[name] ?? "");
    sources[name] = written === legacy ? written : [written, legacy].filter(Boolean).join("\n\n");
  }
  return sources;
}

export class SegmentPromptSections {
  constructor(editor) {
    this.editor = editor;
    editor.prompt.hooks.onDialogueEdit = (detail) => openDialogueComposer(editor.prompt.root, editor, detail);
    this.rows = new Map();
    this.textBoxes = new Map();
    this.blockOrder = [];
    this.retentionHost = el("div", { class: "mmc-retention-blocks" });
    this.summary = this.makeBox(() => this.field("summary"), (text) => {
      this.migrate(); this.editor.state.prompt_sections.summary = text; this.changed();
    }, "summary");
    this.summary.root.setAttribute("data-placeholder", t("Briefly describe what this segment makes."));
    this.summarySection = this.section("summary", this.summary.root);
    this.retentionSection = this.section("retention_analysis", this.retentionHost);
    this.descriptionSection = this.section("detailed_description", editor.prompt.root);
    this.root = el("div", { class: "mmc-prompt-sections" }, [
      this.summarySection.root, this.retentionSection.root, this.descriptionSection.root,
    ]);
    editor.refinePanel.readSource = (field) => this.readField(field);
    editor.refinePanel.setFieldHosts(Object.fromEntries([
      ["summary", this.summarySection], ["retention_analysis", this.retentionSection],
      ["prompt", this.descriptionSection],
    ].map(([field, section]) => {
      const host = el("div", { class: "mmc-field-refined", "data-refined-field": field });
      section.body.append(host);
      return [field, host];
    })));
    this.refresh();
  }

  section(title, content) {
    const section = createDisclosure({ title, content, inlineActions: true, initialOpen: true,
      summary: true, actionsBeforeHint: true });
    section.root.classList.add("mmc-prompt-section");
    const field = title === "detailed_description" ? "prompt" : title;
    const clear = clearButton({ written: true, what: t("Clear only this segment field and its refined draft. Shared Cast rules stay unchanged."),
      getOwner: () => this.editor.state,
      getValue: () => [this.editor.refineEpoch, this.readField(field), this.editor.state.refined],
      run: () => this.clearField(field),
    });
    clear.className = "mmc-pill mmc-section-clear";
    clear.dataset.mmcClearSection = field;
    // clearButton owns its label; only remove the rail's icon and styling.
    clear.replaceChildren(...Array.from(clear.childNodes).filter((node) => node.nodeType !== 1 || !node.classList.contains("mmc-tool-icon")));
    const actions = [clear];
    if (field === "prompt" && S.pieceFamily(this.editor.piece) === "h3") {
      const compose = el("button", { class: "mmc-pill", type: "button", text: t("Dialogue & sounds"),
        "data-dialogue-open": "", onpointerdown: (event) => event.preventDefault(),
        onclick: (event) => { event.stopPropagation(); openDialogueComposer(event.currentTarget, this.editor); } });
      actions.unshift(compose);
    }
    if (this.editor.refineTarget) {
      actions.push(this.refineControl(field, title));
    }
    if (field === "summary") {
      section.root.classList.add("mmc-summary-section");
      const help = el("button", { class: "mmc-cast-help mmc-summary-task-help", type: "button", text: "?",
        "aria-label": t("Summary task type help"), title: t("Summary task type help"),
        onclick: (event) => { event.stopPropagation(); openTaskHelp(event.currentTarget); } });
      section.toggle.after(help);
      actions.unshift(el("button", { class: "mmc-pill", type: "button", text: t("Task type"),
          onclick: (event) => {
            const owner = this.editor.state;
            openTaskPresets(event.currentTarget, () => this.field("summary"), (text) => {
              this.migrate(); owner.prompt_sections.summary = text;
              if (owner.refined?.sections) delete owner.refined.sections.summary;
              if (Array.isArray(owner.refined?.fields)) owner.refined.fields = owner.refined.fields.filter((field) => field !== "summary");
              if (owner.refined?.sources) delete owner.refined.sources.summary;
              if (owner.refined && !this.editor.refinePanel.ownedFields().length) delete owner.refined;
              this.summary.setValue(text); this.changed();
            }, () => this.editor.state === owner && this.editor.root.isConnected);
          },
        }));
    }
    section.setActions(...actions);
    return section;
  }

  refineControl(field, title) {
    const control = refineButton({ className: "mmc-pill mmc-section-refine", variant: "pill",
      activity: refineActivity(this.editor.state, field), label: "Refine", contextLabel: title,
      title: t("Refine only {field}. Other fields stay unchanged.", { field: title }),
      family: () => S.pieceFamily(this.editor.piece),
      run: (options) => this.editor.refine(options, field) });
    control.dataset.mmcRefineSection = field;
    return control;
  }

  readField(field) {
    if (field === "prompt") return this.source().body;
    if (field === "retention_analysis") return (this.blocks ?? []).filter((block) => block.type === "text").map((block) => block.text).join("\n\n") || this.field(field);
    return this.field(field);
  }

  clearField(field) {
    this.migrate();
    const state = this.editor.state;
    if (field === "prompt") { state.prompt = ""; this.editor.prompt.setValue(""); }
    else if (field === "retention_analysis") {
      for (const block of this.blocks) if (block.type === "text") { block.text = ""; this.textBoxes.get(block)?.setValue(""); }
      state.prompt_sections.retention_analysis = "";
    } else { state.prompt_sections[field] = ""; this.summary.setValue(""); }
    if (state.refined) {
      if (field === "prompt") delete state.refined.body;
      else if (state.refined.sections) delete state.refined.sections[field];
      if (Array.isArray(state.refined.fields)) state.refined.fields = state.refined.fields.filter((key) => key !== field);
      if (state.refined.sources) delete state.refined.sources[field];
      if (!this.editor.refinePanel.ownedFields().length) delete state.refined;
    }
    this.editor.refinePanel.render(); this.changed();
  }

  source() { return splitExplicitPrompt(this.editor.state.prompt); }
  field(name) {
    const own = this.editor.state.prompt_sections;
    const legacy = this.source().sections[name] ?? "";
    if (name === "retention_analysis" && Array.isArray(this.editor.state.retention_blocks)) return legacy;
    const written = own && Object.hasOwn(own, name) ? String(own[name] ?? "") : "";
    return written === legacy ? written : [written, legacy].filter(Boolean).join("\n\n");
  }
  detailedState() {
    return { ...this.editor.state, prompt: this.source().body };
  }

  migrate() {
    const state = this.editor.state, parsed = this.source();
    state.prompt_sections ??= {};
    for (const name of ["summary", "retention_analysis"]) {
      state.prompt_sections[name] = this.field(name);
    }
    if (parsed.explicit) state.prompt = parsed.body;
    state.retention_blocks = this.blocks;
    this.savedBlocks = this.blocks;
  }

  inputBody(text) {
    this.migrate(); this.editor.state.prompt = text;
    this.changed();
  }

  makeBox(read, write, field = null) {
    const hooks = this.editor.prompt.hooks;
    const box = new PromptBox({ ...hooks, compiled: null, onOverflow: null,
      getState: () => ({ ...this.editor.state, prompt: read() }),
      onInput: write,
      onDialogueEdit: (detail) => openDialogueComposer(detail.box.root, this.editor, { ...detail, field }),
      // Unciting in one field must not put files used by another field to sleep.
      onUncited: (handles) => this.editor.dropCited(handles.filter((handle) =>
        !S.allTexts(this.editor.castPiece).some((text) => S.handleWritten([text], handle)))),
    });
    box.root.classList.add("mmc-section-input");
    box.setValue(read());
    return box;
  }

  changed() {
    this.editor.commitPrompt();
    this.editor.renderNotices();
    this.editor.renderAssetsRow();
    this.refresh();
    this.editor.compiledView?.refresh();
  }

  inherited() {
    const state = this.editor.state, cast = this.editor.castPiece.subjects ?? state.cast ?? [];
    const piece = this.editor.castPiece;
    const globalTexts = [piece.prompt, piece.soundscape, piece.music];
    if (piece !== state && piece.refined?.enabled !== false) {
      globalTexts.push(piece.refined?.body, ...Object.values(piece.refined?.sections ?? {}));
    }
    const named = S.citedSubjects(globalTexts, cast);
    for (const subject of S.citedCast({ ...state, cast })) named.add(subject.handle);
    return cast.filter((subject) => named.has(subject.handle) && String(subject.usage_rules ?? "").trim());
  }

  overrides() {
    return this.editor.state.retention_overrides ?? this.editor.castPiece.retention_overrides ?? [];
  }

  refresh() {
    const state = this.editor.state, subjects = this.inherited();
    if (!state.retention_blocks && !this.blocks) {
      this.blocks = [{ type: "text", text: this.field("retention_analysis") }];
    } else if (state.retention_blocks && state.retention_blocks !== this.savedBlocks) {
      this.blocks = state.retention_blocks.map((block) => ({ ...block }));
      this.savedBlocks = state.retention_blocks;
      const legacy = this.source().sections.retention_analysis;
      if (legacy && !this.blocks.some((block) => block.type === "text" && block.text.trim() === legacy.trim())) {
        this.blocks.unshift({ type: "text", text: legacy });
      }
    }
    const handles = new Set(this.blocks.filter((block) => block.type === "subject").map((block) => block.handle));
    for (const subject of subjects) {
      if (!handles.has(subject.handle)) this.blocks.push({ type: "subject", handle: subject.handle }, { type: "text", text: "" });
    }
    if (this.blocks[0]?.type !== "text") this.blocks.unshift({ type: "text", text: "" });
    if (this.blocks.at(-1)?.type !== "text") this.blocks.push({ type: "text", text: "" });
    const byHandle = new Map(subjects.map((subject) => [subject.handle, subject]));
    const visible = this.blocks.filter((block) => block.type === "text" || byHandle.has(block.handle));
    const rows = visible.map((block) => {
      let row = this.rows.get(block);
      if (!row) {
        row = block.type === "text" ? this.textRow(block) : this.subjectRow(block);
        this.rows.set(block, row);
      }
      if (block.type === "subject") this.updateSubject(row, byHandle.get(block.handle));
      else this.textBoxes.get(block).refresh();
      return row;
    });
    if (rows.length !== this.blockOrder.length || rows.some((row, index) => row !== this.blockOrder[index])) {
      this.retentionHost.replaceChildren(...rows); this.blockOrder = rows;
    }
    this.summary.refresh();
    this.summarySection.setHint(this.field("summary").replace(/\s+/g, " ").slice(0, 100));
    this.retentionSection.setHint(t("{count} Cast rules · segment rules below", { count: subjects.length }));
    this.descriptionSection.setHint(this.source().body.replace(/\s+/g, " ").slice(0, 100));
  }

  textRow(block) {
    const box = this.makeBox(() => block.text ?? "", (text) => {
      this.migrate(); block.text = text; this.changed();
    }, "retention_analysis");
    box.root.setAttribute("data-placeholder", t("Add rules for this segment here…"));
    this.textBoxes.set(block, box);
    return el("div", { class: "mmc-retention-text" }, [box.root]);
  }

  subjectRow(block) {
    const hand = el("button", { type: "button", class: "mmc-rule-hand",
      title: t("Hold this hand and drag to move the block. Drag the text to select and copy it."),
      "aria-label": t("Move Cast rule block"),
      onpointerdown: (event) => this.beginDrag(event, block),
      onkeydown: (event) => {
        if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const from = this.blocks.indexOf(block), to = from + (event.key === "ArrowUp" ? -1 : 1);
        if (to < 0 || to >= this.blocks.length) return;
        this.migrate(); this.blocks.splice(from, 1); this.blocks.splice(to, 0, block); this.changed(); hand.focus();
      },
    }, [svg('<path d="M8 13V5a2 2 0 0 1 4 0v7M12 11V4a2 2 0 0 1 4 0v8M16 11V6a2 2 0 0 1 4 0v9c0 4-3 7-7 7h-1c-2 0-4-1-5-3l-4-6a2 2 0 0 1 3-2l2 2Z"/>', 19)]);
    const label = el("span", { class: "mmc-rule-source" });
    const text = el("div", { class: "mmc-rule-content", role: "textbox", "aria-readonly": true, tabindex: 0,
      title: t(LOCK_HELP) });
    const toggle = el("button", { type: "button", class: "mmc-rule-override",
      text: t("Use manual rules instead"),
      title: t("Exclude only this Cast usage rule in this segment. Write its replacement above or below; identity and source defaults stay intact."),
      onclick: () => {
        this.migrate();
        const overrides = new Set(this.overrides());
        if (overrides.has(block.handle)) overrides.delete(block.handle); else overrides.add(block.handle);
        this.editor.state.retention_overrides = [...overrides]; this.changed();
      },
    });
    const row = el("div", { class: "mmc-retention-source", title: t(LOCK_HELP) }, [hand,
      el("div", { class: "mmc-rule-body" }, [
        el("div", { class: "mmc-rule-head" }, [icon("lock", 13), label, toggle]), text,
      ]),
    ]);
    row._rule = { label, text, toggle };
    return row;
  }

  updateSubject(row, subject) {
    const excluded = this.overrides().includes(subject.handle);
    row.classList.toggle("excluded", excluded);
    row._rule.label.textContent = `@${subject.handle} · ${t("Cast")}`;
    if (row._rule.text.textContent !== subject.usage_rules) row._rule.text.textContent = subject.usage_rules;
    row._rule.toggle.setAttribute("aria-pressed", String(excluded));
  }

  beginDrag(event, block) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); this.cancelDrag?.();
    const row = this.rows.get(block), startY = event.clientY;
    let destination = null, moved = false;
    const marker = el("div", { class: "mmc-rule-drop-marker" });
    row.classList.add("moving");
    const move = (next) => {
      if (Math.abs(next.clientY - startY) < 6 && !moved) return;
      moved = true;
      const bounds = this.retentionHost.getBoundingClientRect();
      const inside = next.clientX >= bounds.left && next.clientX <= bounds.right
        && next.clientY >= bounds.top - 8 && next.clientY <= bounds.bottom + 8;
      if (!inside) { destination = null; marker.remove(); return; }
      const candidates = this.blockOrder.filter((item) => item !== row);
      const before = candidates.find((item) => next.clientY < item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2);
      destination = before ?? null;
      this.retentionHost.insertBefore(marker, before ?? null);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      row.classList.remove("moving"); marker.remove(); this.cancelDrag = null;
    };
    const cancel = () => cleanup();
    const key = (next) => {
      if (next.key !== "Escape") return;
      next.preventDefault(); next.stopImmediatePropagation(); cleanup();
    };
    const end = (next) => {
      const bounds = this.retentionHost.getBoundingClientRect();
      const inside = next.clientX >= bounds.left && next.clientX <= bounds.right
        && next.clientY >= bounds.top - 8 && next.clientY <= bounds.bottom + 8;
      cleanup();
      if (!moved || !inside) return;
      this.migrate();
      const before = destination ? [...this.rows].find(([, item]) => item === destination)?.[0] : null;
      this.blocks.splice(this.blocks.indexOf(block), 1);
      const index = before ? this.blocks.indexOf(before) : this.blocks.length;
      this.blocks.splice(index, 0, block); this.changed();
    };
    this.cancelDrag = cleanup;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
  }

  reset() {
    this.destroy();
    for (const [field, title, section] of [["summary", "summary", this.summarySection],
      ["retention_analysis", "retention_analysis", this.retentionSection],
      ["prompt", "detailed_description", this.descriptionSection]]) {
      section.head.querySelector(`[data-mmc-refine-section="${field}"]`)
        ?.replaceWith(this.refineControl(field, title));
    }
    this.blocks = null; this.savedBlocks = null;
    this.rows.clear(); this.textBoxes.clear(); this.blockOrder = [];
    this.refresh();
  }

  destroy() {
    this.cancelDrag?.();
    for (const box of [this.summary, ...this.textBoxes.values()]) {
      box.setCompiledOpen(false);
      box.closeMenu(); box.paintWhenShown?.disconnect();
    }
  }
}

function compiledPromptParts(text) {
  const offsets = [0];
  let fence = null, quote = "";
  for (const match of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!match[0]) continue;
    const line = match[0].replace(/\r?\n$/, "");
    const marker = line.trimStart().match(/^(`{3,}|~{3,})/);
    if (marker && !quote) {
      if (!fence) fence = marker[1];
      else if (fence[0] === marker[1][0] && marker[1].length >= fence.length
        && !line.trimStart().slice(marker[1].length).trim()) fence = null;
      continue;
    }
    const heading = !fence && !quote && line.match(/^[ \t]*([a-z_]+)[ \t]*:[ \t]*(.*)$/);
    const known = heading && FIELDS.has(heading[1]);
    if (known && match.index) offsets.push(match.index);
    if (fence) continue;
    const value = known ? heading[2] : line;
    if (quote) {
      const end = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(?<!\\\\)${end}`).test(value)) quote = "";
    } else {
      const opening = value.match(/^\s*("""|'''|[“‘])/);
      if (opening) {
        const end = ({ "“": "”", "‘": "’" })[opening[1]] ?? opening[1];
        if (!value.slice(opening[0].length).includes(end)) quote = end;
      } else if ((value.match(/(?<!\\)"/g)?.length ?? 0) % 2) quote = '"';
    }
  }
  return offsets.map((start, index) => text.slice(start, offsets[index + 1] ?? text.length));
}

function renderCompiledPrompt(doc, text, tags = [], onOpen = null) {
  const nodes = [], parts = compiledPromptParts(text);
  for (const part of parts) {
    const gap = part.match(/(?:\r?\n)+$/)?.[0] ?? "";
    const value = gap ? part.slice(0, -gap.length) : part;
    const heading = value.match(/^[ \t]*([a-z_]+)[ \t]*:/);
    const block = el("span", { class: "mmc-final-prompt-block" });
    if (heading && FIELDS.has(heading[1])) {
      block.append(el("strong", { class: "mmc-final-prompt-heading", text: heading[0] }),
        ...compiledTagNodes(value.slice(heading[0].length), tags, onOpen));
    } else block.append(...compiledTagNodes(value, tags, onOpen));
    nodes.push(block);
    if (gap) nodes.push(document.createTextNode(gap));
  }
  doc.replaceChildren(...nodes);
  doc.classList.toggle("sectioned", parts.length > 1);
}

// Blocks wrap exact source slices; copying and model input keep the compiler's string.
export function openCompiledPrompt(compile, onClose) {
  const previous = document.activeElement;
  let closed = false, busy = false, dirty = false;
  let childClose = null, revision = 0;
  const closeChild = () => { childClose?.(); childClose = null; };
  const status = el("span", { class: "mmc-final-prompt-status", role: "status" });
  const doc = el("pre", { class: "mmc-final-prompt-doc", tabindex: 0 });
  const edits = el("div", { class: "mmc-final-prompt-edits", hidden: true });
  let currentAnswer = null;
  const force = el("button", { class: "mmc-pill", role: "switch", "aria-checked": "false",
    text: t("Force edit"), disabled: true,
    onclick: () => {
      if (!currentAnswer?.override) return;
      const enabled = !currentAnswer.override.enabled;
      if (!currentAnswer.override.set(enabled, text)) return refresh();
      refresh();
    },
  });
  const warnings = el("div", { class: "mmc-final-prompt-warnings", role: "status", hidden: true });
  let text = "";
  const close = () => {
    if (closed) return;
    closed = true; closeChild(); unmount(); onClose?.(); previous?.focus();
  };
  const copy = el("button", { class: "mmc-pill", text: t("Copy prompt"),
    onclick: async () => {
      try { await navigator.clipboard.writeText(text); status.textContent = t("Copied"); }
      catch { status.textContent = t("Select the prompt text and copy it with Ctrl+C."); }
    },
  });
  const overlay = el("div", { class: "mmc-overlay",
    onpointerdown: (event) => { if (event.target === overlay) close(); } }, [
    el("div", { class: "mmc-modal mmc-final-prompt" }, [
      el("div", { class: "mmc-modal-head" }, [
        el("span", { class: "mmc-tab", "aria-selected": true, text: t("What the model reads") }),
        status, force, copy,
        el("button", { class: "mmc-close", text: "✕", title: t("Close"), onclick: close }),
      ]), warnings, doc, edits,
    ]),
  ]);
  const unmount = mountOverlay(overlay, close);
  async function refresh() {
    if (closed) return;
    revision++; closeChild();
    if (busy) { dirty = true; return; }
    busy = true; status.textContent = t("compiling…");
    let answer;
    try { answer = await compile(); }
    catch (error) { answer = { problem: error.message }; }
    busy = false;
    if (closed) return;
    if (dirty) { dirty = false; return refresh(); }
    currentAnswer = answer;
    text = answer.text ?? "";
    const editable = !answer.problem && Boolean(answer.override?.enabled);
    force.disabled = !answer.override || Boolean(answer.problem);
    force.setAttribute("aria-checked", String(editable));
    force.classList.toggle("active", editable);
    force.textContent = `${t("Force edit")} · ${editable ? t("On") : t("Off")}`;
    doc.hidden = editable; edits.hidden = !editable;
    edits.replaceChildren();
    if (editable) {
      const fields = compiledPromptParts(text).map((part) => {
        const field = el("textarea", { class: "mmc-final-prompt-edit", value: part,
          "aria-label": part.match(/^\s*([a-z_]+)\s*:/)?.[1] ?? t("What the model reads"),
          spellcheck: false,
        });
        const resize = () => { field.style.height = "auto"; field.style.height = `${Math.max(80, field.scrollHeight + 2)}px`; };
        field.addEventListener("input", () => {
          text = fields.map((box) => box.value).join("");
          if (!currentAnswer.override.set(true, text)) { refresh(); return; }
          copy.disabled = !text.trim(); resize();
        });
        requestAnimationFrame(resize);
        return field;
      });
      edits.append(...fields);
    }
    warnings.textContent = (answer.warnings ?? []).map(localizeDiagnostic).join("\n");
    warnings.hidden = !warnings.textContent;
    status.textContent = answer.problem ? t("could not compile") : localizeDiagnostic(answer.note);
    const current = revision;
    renderCompiledPrompt(doc, answer.problem || answer.message
      ? localizeDiagnostic(answer.problem || answer.message) : text,
      answer.problem || answer.message ? [] : answer.tags ?? [], (binding, span) => {
        if (closed || busy || current !== revision || !span.isConnected || answer.problem || answer.message) return;
        closeChild();
        childClose = openCompiledTagPreview(binding, { returnFocus: span,
          onClose: () => { childClose = null; } });
      });
    doc.classList.toggle("problem", Boolean(answer.problem));
    copy.disabled = !text || Boolean(answer.problem);
  }
  refresh();
  return { refresh, close };
}
