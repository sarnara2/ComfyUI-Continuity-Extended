// Visual workspace only. The installed Builder owns vocabulary, presets and rendering.
import { el, icon } from "./dom.js";
import { viewUrl } from "./api.js";
import { st } from "./sheet-locales.js";
import { copySheet, sheetFile, applySheetPreset } from "./sheet-support.js";

const TABS = { references: "References", cells: "Cells & layout", results: "Results",
  preview: "Preview", loras: "LoRAs", settings: "Settings", help: "Help" };
const REF_GROUPS = { pictures: ["image", "imageFile"], videos: ["video", "videoFile"], audios: ["audio", "audioFile"] };
let spriteSerial = 0;

function pill(text, clicked, primary = false, raw = false) {
  return el("button", { class: `mmc-sheet-button${primary ? " primary" : ""}`, text: raw ? text : st(text), onclick: clicked });
}

function heading(text, suffix = "") {
  return el("div", { class: "mmc-sheet-studio-heading" }, [el("h3", { text: st(text) }), el("span", { text: suffix })]);
}

function aspect(value) {
  const parts = String(value ?? "").split(":").map(Number);
  return parts.length === 2 && parts.every((n) => Number.isFinite(n) && n > 0) ? `${parts[0]} / ${parts[1]}` : "3 / 2";
}

// These are CSS grid slots, not the Builder's pixel compositor or prompt planner.
export function sheetArrangement(cells, settings) {
  const items = cells.map((cell, index) => ({ cell, index })).filter(({ cell }) => cell.enabled !== false);
  const layout = settings.sheet_layout ?? "grid";
  const columns = Math.max(1, Math.floor(Number(settings.sheet_columns) || 1));
  if (layout === "turnaround") return { columns: Math.max(1, items.length), rows: 1,
    slots: items.map((item, i) => ({ ...item, col: i + 1, row: 1, colSpan: 1, rowSpan: 1 })) };
  if (layout === "hero-left") {
    const rows = Math.max(1, Math.ceil(Math.max(0, items.length - 1) / columns));
    return { columns: columns + 1, rows, slots: items.map((item, i) => i === 0
      ? { ...item, col: 1, row: 1, colSpan: 1, rowSpan: rows }
      : { ...item, col: 2 + (i - 1) % columns, row: 1 + Math.floor((i - 1) / columns), colSpan: 1, rowSpan: 1 }) };
  }
  if (layout === "custom") {
    const slots = items.map((item, i) => {
      const place = item.cell.place ?? {};
      return { ...item, col: 1 + Math.max(0, Math.floor(Number(place.col) || 0)),
        row: 1 + Math.max(0, Math.floor(Number(place.row) || 0)),
        colSpan: Math.max(1, Math.floor(Number(place.colSpan) || 1)), rowSpan: Math.max(1, Math.floor(Number(place.rowSpan) || 1)) };
    });
    // Missing custom positions follow the installed layout's implicit single-row slots.
    slots.forEach((slot, i) => { if (slot.cell.place?.col === undefined) slot.col = i + 1; });
    return { columns: Math.max(1, ...slots.map((slot) => slot.col + slot.colSpan - 1)),
      rows: Math.max(1, ...slots.map((slot) => slot.row + slot.rowSpan - 1)), slots };
  }
  return { columns, rows: Math.max(1, Math.ceil(items.length / columns)),
    slots: items.map((item, i) => ({ ...item, col: 1 + i % columns, row: 1 + Math.floor(i / columns), colSpan: 1, rowSpan: 1 })) };
}

function styles() {
  if (document.getElementById("mmc-sheet-studio-style")) return;
  document.head.appendChild(el("style", { id: "mmc-sheet-studio-style", text: `
.mmc-sheet-room.mmc-sheet-studio { width:min(1680px,97vw); height:95vh; background:#141416; border-color:#3b3833; }
.mmc-sheet-studio .mmc-sheet-head { padding:12px 18px; background:#19191b; border-color:#34312c; }
.mmc-sheet-studio .mmc-sheet-head h2 { color:#eee8dc; font-size:15px; }
.mmc-sheet-studio .mmc-sheet-content { display:grid; grid-template-columns:64px minmax(0,1fr) minmax(360px,.95fr); min-height:0; overflow:hidden; }
.mmc-sheet-studio .mmc-sheet-content.wide { grid-template-columns:64px minmax(0,1fr); }
.mmc-sheet-studio .mmc-sheet-content.wide .mmc-sheet-studio-column { display:none; }
.mmc-sheet-studio-rail { display:flex; flex-direction:column; align-items:center; gap:7px; padding:12px 7px; border-right:1px solid #34312c; background:#19191b; overflow:auto; }
.mmc-sheet-studio-rail button { display:flex; align-items:center; justify-content:center; flex-direction:column; gap:3px; flex:none; width:48px; min-height:48px; padding:7px 2px; border:1px solid transparent; border-radius:10px; background:transparent; color:#85827c; font:9px/1.2 sans-serif; cursor:pointer; }
.mmc-sheet-studio-rail button svg { width:22px; height:22px; }
.mmc-sheet-studio-rail button[aria-selected=true] { background:#51381855; border-color:#9b702c; color:#e7b05c; }
.mmc-sheet-studio-rail button:hover { color:#f1cb8b; background:#ffffff08; }
.mmc-sheet-studio .mmc-sheet-form { border:0; background:#111113; min-height:0; overflow:auto; padding:20px 24px; }
.mmc-sheet-studio-column { min-height:0; min-width:0; overflow:auto; border-left:1px solid #34312c; padding:16px; background:#1a1a1c; }
.mmc-sheet-studio-heading { display:flex; gap:10px; align-items:baseline; justify-content:space-between; margin:0 0 14px; }
.mmc-sheet-studio-heading h3 { margin:0; font-size:14px; color:#e8e3d9; }
.mmc-sheet-studio-heading > span { color:#90897d; font-size:11px; }
.mmc-sheet-studio .mmc-sheet-card { padding:14px; margin-bottom:14px; border-color:#3d3a34; background:#1d1d20; border-radius:12px; }
.mmc-sheet-studio .mmc-sheet-card h3 { color:#d6b785; font-size:12px; }
.mmc-sheet-studio .mmc-sheet-card h4 { margin:14px 0 6px; color:#cdb17f; font-size:11px; font-weight:600; }
.mmc-sheet-studio .mmc-sheet-card h5 { margin:8px 0 4px; color:#a99c84; font-size:10px; font-weight:500; }
.mmc-sheet-studio-column .mmc-sheet-grid { grid-template-columns:1fr; gap:10px; }
.mmc-sheet-studio .mmc-sheet-field { font-size:11px; color:#aba69b; }
.mmc-sheet-studio .mmc-sheet-field-head { gap:6px; }
.mmc-sheet-studio .mmc-sheet-field-head .mmc-sheet-button { font-size:10px; }
.mmc-sheet-studio input,.mmc-sheet-studio textarea,.mmc-sheet-studio select { background:#121214; border-color:#423d34; padding:7px 9px; font-size:12px; }
.mmc-sheet-studio input:focus,.mmc-sheet-studio textarea:focus,.mmc-sheet-studio select:focus { outline:1px solid #a37835; }
.mmc-sheet-studio .mmc-sheet-button { background:#252321; border-color:#4e4537; font-size:11px; padding:6px 11px; }
.mmc-sheet-studio .mmc-sheet-button.primary { background:#66471f; border-color:#a47b3a; color:#ffda97; }
.mmc-sheet-studio .mmc-sheet-note { font-size:11px; color:#938d81; }
.mmc-sheet-studio .mmc-sheet-foot { padding:12px 18px; border-color:#34312c; background:#19191b; }
.mmc-sheet-studio .mmc-sheet-foot .primary { min-width:155px; padding:9px 18px; font-size:12px; }
.mmc-sheet-edit { min-width:0; padding:0; border:0; margin:0; }
.mmc-sheet-edit:disabled { opacity:.65; }
.mmc-sheet-ref-stage { display:flex; flex-direction:column; min-height:250px; height:100%; max-height:50vh; }
.mmc-sheet-ref-media { display:flex; flex:1; align-items:center; justify-content:center; min-height:190px; max-height:42vh; padding:12px; border:1px solid #37342f; border-radius:14px; background:radial-gradient(ellipse at center,#242321,#101012 80%); }
.mmc-sheet-ref-media img,.mmc-sheet-ref-media video { max-width:100%; max-height:35vh; width:auto; height:auto; object-fit:contain; border-radius:6px; }
.mmc-sheet-ref-media audio { width:min(600px,100%); }
.mmc-sheet-ref-caption { padding:13px 0 0; overflow-wrap:anywhere; color:#a09a8e; font-size:12px; }
.mmc-sheet-reference.selected { border-color:#b28036; background:#3c2e1d66; }
.mmc-sheet-ref-gallery { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.mmc-sheet-studio-column .mmc-sheet-reference { position:relative; display:flex; flex-direction:column; align-items:stretch; gap:7px; padding:9px; margin:0; }
.mmc-sheet-studio-column .mmc-sheet-reference img,.mmc-sheet-studio-column .mmc-sheet-reference video { width:100%; height:98px; object-fit:contain; }
.mmc-sheet-studio-column .mmc-sheet-reference .mmc-sheet-ref-name { max-height:none; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mmc-sheet-studio-column .mmc-sheet-reference input[type=text] { padding:5px 7px; font-size:11px; }
.mmc-sheet-studio-column .mmc-sheet-reference .mmc-sheet-check { font-size:10px; }
.mmc-sheet-studio-column .mmc-sheet-reference select { padding:4px 6px; font-size:10px; }
.mmc-sheet-ref-actions { display:flex; justify-content:flex-end; gap:5px; }
.mmc-sheet-studio .mmc-sheet-ref-actions .mmc-sheet-button { padding:3px 8px; font-size:10px; }
.mmc-sheet-ref-thumb { display:flex; align-items:center; justify-content:center; padding:0; border:1px solid #474137; border-radius:8px; background:#0e0e10; color:#d8b279; cursor:pointer; overflow:hidden; }
.mmc-sheet-ref-thumb > span { display:flex; align-items:center; justify-content:center; height:98px; }
.mmc-sheet-ref-thumb svg { width:32px; height:32px; }
.mmc-sheet-ref-thumb:focus-visible { outline:2px solid #bc8b42; }
.mmc-sheet-choice-wall { display:grid; grid-template-columns:repeat(auto-fill,minmax(68px,1fr)); gap:6px; margin-bottom:12px; }
.mmc-sheet-choice { position:relative; display:flex; flex-direction:column; align-items:center; gap:5px; padding:7px 4px 5px; min-height:57px; border:1px solid #423d34; border-radius:8px; background:#18181a; color:#9b9589; text-align:center; font-size:9px; line-height:1.2; cursor:pointer; }
.mmc-sheet-choice input { position:absolute; top:4px; right:4px; width:10px; height:10px; }
.mmc-sheet-choice svg { width:29px; height:29px; color:#b8afa0; }
.mmc-sheet-choice:has(input:checked) { background:#49351e66; border-color:#a37835; color:#f0ca8b; }
.mmc-sheet-choice:has(input:checked) svg { color:#e9b25f; }
.mmc-sheet-studio .mmc-sheet-cells { grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); }
.mmc-sheet-studio .mmc-sheet-cell { background:#171719; border-color:#3d3932; }
.mmc-sheet-plan-card { border:1px solid #3c372f; border-radius:13px; padding:16px; background:#19191b; margin-bottom:18px; }
.mmc-sheet-plan-canvas { display:grid; gap:7px; width:100%; height:clamp(185px,27vh,250px); max-height:250px; min-height:170px; border:1px solid #6d5430; border-radius:8px; padding:10px; box-sizing:border-box; background:#121214; }
.mmc-sheet-plan-slot { min-width:0; min-height:0; position:relative; display:flex; flex-direction:column; gap:4px; align-items:center; justify-content:center; padding:5px; border:1px solid #635135; border-radius:5px; background:linear-gradient(145deg,#3b3325,#201f1d); color:#d9b174; text-align:center; font-size:10px; line-height:1.25; overflow-wrap:anywhere; }
.mmc-sheet-plan-slot svg { height:clamp(22px,5vw,75px); width:clamp(22px,5vw,75px); flex:0 1 auto; min-height:0; }
.mmc-sheet-plan-slot small { color:#a49780; font-size:9px; }
.mmc-sheet-plan-slot .mmc-sheet-plan-number { position:absolute; top:4px; left:6px; color:#9d8b6d; font-size:9px; }
.mmc-sheet-layout-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:14px; }
.mmc-sheet-layout-tile { display:flex; flex-direction:column; min-width:0; padding:10px; gap:8px; text-align:left; border:1px solid #423d34; border-radius:10px; background:#202022; color:#c0b8a9; cursor:pointer; }
.mmc-sheet-layout-tile[aria-pressed=true] { border-color:#b38238; background:#49351e66; color:#f4d295; }
.mmc-sheet-layout-tile > span { font-size:11px; line-height:1.35; }
.mmc-sheet-layout-tile small { color:#978f82; font-size:9px; line-height:1.35; }
.mmc-sheet-layout-tile .mmc-sheet-plan-canvas { height:70px; max-height:70px; min-height:70px; padding:5px; gap:3px; border-color:#564831; }
.mmc-sheet-layout-tile .mmc-sheet-plan-slot { padding:0; border-radius:2px; }
.mmc-sheet-suite-mini { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); grid-auto-rows:33px; gap:4px; min-height:70px; }
.mmc-sheet-layout-tile .mmc-sheet-suite-mini .mmc-sheet-plan-canvas { height:33px; min-height:33px; max-height:33px; padding:3px; gap:2px; }
.mmc-sheet-resolution,.mmc-sheet-quality,.mmc-sheet-mode { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
.mmc-sheet-resolution button,.mmc-sheet-quality button,.mmc-sheet-mode button { flex:1; min-width:65px; }
.mmc-sheet-quality button { white-space:normal; overflow-wrap:anywhere; }
.mmc-sheet-resolution button[aria-pressed=true],.mmc-sheet-quality button[aria-pressed=true],.mmc-sheet-mode button[aria-pressed=true] { background:#49351e; color:#f0ca8b; border-color:#a37835; }
.mmc-sheet-studio .mmc-sheet-results { overflow:visible; padding:0; }
.mmc-sheet-studio .mmc-sheet-results .mmc-sheet-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
.mmc-sheet-studio .mmc-sheet-results > .mmc-sheet-card { max-width:1100px; margin:16px auto; }
.mmc-sheet-studio .mmc-sheet-preview { max-height:64vh; }
.mmc-sheet-generated-stage .mmc-sheet-preview { max-height:68vh; margin-top:14px; }
.mmc-sheet-cell-plan pre { white-space:pre-wrap; overflow-wrap:anywhere; color:#bdb5a7; font:12px/1.6 sans-serif; margin:0; user-select:text; }
.mmc-sheet-settings-layout { max-width:1100px; margin:auto; }
.mmc-sheet-settings-layout .mmc-sheet-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
.mmc-sheet-prompt-layout { max-width:1100px; margin:auto; }
.mmc-sheet-studio-divider { height:1px; margin:14px 0; border:0; background:#3a3731; }
.mmc-sheet-context-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.mmc-sheet-context-note { padding:8px 10px; border:1px solid #38342e; border-radius:9px; background:#18181a; color:#9d968b; font-size:10px; line-height:1.45; }
.mmc-sheet-selection-summary { display:grid; gap:7px; margin:10px 0 12px; padding:10px; border:1px solid #55452e; border-radius:10px; background:#242019; }
.mmc-sheet-selection-summary strong { color:#e7c58d; font-size:11px; }
.mmc-sheet-selection-summary p { margin:0; color:#aaa295; font-size:10px; line-height:1.45; }
.mmc-sheet-selection-pills { display:flex; flex-wrap:wrap; gap:5px; }
.mmc-sheet-selection-pills span { padding:3px 8px; border:1px solid #514735; border-radius:999px; color:#c7bda9; font-size:9px; }
.mmc-sheet-prompt-plans { margin:14px 0; padding:12px 14px; border:1px solid #3d3932; border-radius:12px; background:#19191b; }
.mmc-sheet-prompt-plans > summary { color:#e2c18a; font-size:12px; cursor:pointer; }
.mmc-sheet-prompt-plans > .mmc-sheet-note { margin:8px 0 10px; }
.mmc-sheet-rail-divider { width:30px; height:1px; margin:5px 0; background:#484239; flex:none; }
@media(max-width:1100px) { .mmc-sheet-studio .mmc-sheet-content { grid-template-columns:58px minmax(0,1fr) minmax(340px,.95fr); } .mmc-sheet-studio .mmc-sheet-form { padding:16px; } .mmc-sheet-studio-rail { padding:10px 4px; } }
@media(max-width:760px) { .mmc-sheet-studio .mmc-sheet-content { grid-template-columns:52px minmax(0,1fr); overflow:auto; } .mmc-sheet-studio .mmc-sheet-form { overflow:visible; } .mmc-sheet-studio-rail { grid-row:1 / span 2; position:sticky; top:0; } .mmc-sheet-studio-column { grid-column:2; overflow:visible; border-left:0; border-top:1px solid #34312c; } .mmc-sheet-studio .mmc-sheet-content.wide { grid-template-columns:52px minmax(0,1fr); } .mmc-sheet-ref-media { min-height:180px; } .mmc-sheet-ref-stage { min-height:230px; } .mmc-sheet-context-grid { grid-template-columns:1fr; } .mmc-sheet-settings-layout .mmc-sheet-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
` }));
}

export class SheetStudio {
  constructor(room) {
    this.room = room;
    this.tab = "references";
    this.referenceKey = null;
    this.planBoard = null;
    this.previewBoard = null;
    this.planVersion = 0;
    this.prefix = `mmc-sheet-glyph-${++spriteSerial}`;
    this.markIds = new Map();
    styles();
    this.rail = el("nav", { class: "mmc-sheet-studio-rail", "aria-label": st("Character sheets") });
    this.column = el("aside", { class: "mmc-sheet-studio-column" });
    this.stage = room.form;
    this.content = room.content;
    this.roomElement = room.overlay.querySelector(".mmc-sheet-room");
    this.roomElement.classList.add("mmc-sheet-studio");
    this.content.replaceChildren(this.rail, this.stage, this.column);
    this.installSprite();
    const availableTabs = (room.core.TAB_ORDER ?? Object.keys(TABS)).filter((key) => TABS[key]);
    const workflowTabs = availableTabs.filter((key) => ["references", "cells", "results", "preview"].includes(key));
    const toolTabs = availableTabs.filter((key) => !workflowTabs.includes(key));
    const appendTab = (tab) => {
      const control = el("button", { type: "button", title: st(TABS[tab]), "aria-label": st(TABS[tab]),
        "aria-selected": tab === this.tab, onclick: () => this.show(tab) }, [this.railIcon(tab), el("span", { text: st(TABS[tab]) })]);
      control.dataset.sheetTab = tab;
      this.rail.appendChild(control);
    };
    workflowTabs.forEach(appendTab);
    if (workflowTabs.length && toolTabs.length) this.rail.appendChild(el("div", { class: "mmc-sheet-rail-divider", role: "separator" }));
    toolTabs.forEach(appendTab);
  }

  installSprite() {
    if (!this.room.core.GLYPH_SPRITE) return;
    const holder = document.createElement("div");
    holder.innerHTML = this.room.core.GLYPH_SPRITE;
    const sprite = holder.querySelector("svg");
    if (!sprite) return;
    for (const element of sprite.querySelectorAll("[id]")) {
      const id = element.id;
      this.markIds.set(id, `${this.prefix}-${id}`);
      element.id = this.markIds.get(id);
    }
    for (const use of sprite.querySelectorAll("use")) {
      for (const name of ["href", "xlink:href"]) {
        const value = use.getAttribute(name);
        if (value?.startsWith("#") && this.markIds.has(value.slice(1))) use.setAttribute(name, `#${this.markIds.get(value.slice(1))}`);
      }
    }
    sprite.setAttribute("aria-hidden", "true");
    sprite.style.cssText = "position:absolute;width:0;height:0;pointer-events:none";
    this.roomElement.appendChild(sprite);
  }

  railIcon(tab) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    // Static trusted SVG constants from the installed module, never user text.
    svg.innerHTML = this.room.core.RAIL_ICONS?.[tab] ?? "";
    return svg;
  }

  mark(group, key) {
    const source = group === "expressions" ? this.room.core.EXPRESSION_MARKS : this.room.core.VIEW_MARKS;
    const id = this.markIds.get(source?.[key]);
    if (!id) return icon(group === "expressions" ? "subject" : "image");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${id}`);
    svg.appendChild(use);
    return svg;
  }

  choices(group, choices, values, changed) {
    const selected = new Set(values);
    return el("div", { class: "mmc-sheet-choice-wall" }, choices.map(([key, label]) => {
      const checkbox = el("input", { type: "checkbox", checked: selected.has(key), onchange: () => {
        if (this.room.state.active) return;
        if (checkbox.checked) selected.add(key); else selected.delete(key);
        changed(choices.filter(([id]) => selected.has(id)).map(([id]) => id));
      } });
      checkbox.dataset.sheetChoice = key;
      checkbox.dataset.sheetGroup = group;
      return el("label", { class: "mmc-sheet-choice", title: st(label) }, [checkbox,
        this.mark(group, key), el("span", { text: st(label) })]);
    }));
  }

  editable(children) {
    const fieldset = el("fieldset", { class: "mmc-sheet-edit" }, children);
    fieldset.disabled = Boolean(this.room.state.active);
    return fieldset;
  }

  render(cards) { this.cards = cards; this.show(this.tab); }
  show(tab) {
    if (!TABS[tab] || !this.room.alive()) return;
    this.tab = tab;
    this.planVersion++;
    this.stage.dataset.sheetPanel = tab;
    this.column.dataset.sheetPanel = tab;
    this.content.classList.toggle("wide", !["references", "cells"].includes(tab));
    for (const control of this.rail.querySelectorAll("[data-sheet-tab]")) control.setAttribute("aria-selected", String(control.dataset.sheetTab === tab));
    this.stage.replaceChildren(); this.column.replaceChildren();
    if (!this.cards) return;
    if (tab === "references") {
      this.stage.appendChild(this.referencePreview());
      this.column.appendChild(this.editable([this.cards.refs, this.cards.identity]));
      this.highlightReference();
    } else if (tab === "cells") {
      this.stage.append(this.stagePlan(), this.editable([this.cards.cells]), this.promptPlans());
      this.column.appendChild(this.editable([this.layoutControls()]));
    } else if (tab === "results") this.stage.appendChild(this.room.results);
    else if (tab === "preview") this.renderGenerated();
    else if (tab === "settings") this.stage.appendChild(el("div", { class: "mmc-sheet-settings-layout" },
      [this.editable([this.cards.models, this.cards.settings, this.cards.advanced])]));
    else if (tab === "loras") this.stage.appendChild(this.editable([this.cards.loras]));
    else if (tab === "help") this.stage.appendChild(this.room.card("Help", [
      el("p", { class: "mmc-sheet-note", text: st("Character sheets use separate settings and do not change PreStage.") }),
      el("p", { class: "mmc-sheet-note", text: st("Choose framing, poses and expressions, then build the cells.") }),
      el("p", { class: "mmc-sheet-note", text: st("Full-body front, side and back views use poses. Face and detail views use expressions. The two groups are not multiplied together.") }),
      el("p", { class: "mmc-sheet-note", text: st("Choose a board layout. A preset replaces only the framing, poses or expressions it defines; other selections stay in place.") }),
      el("p", { class: "mmc-sheet-note", text: st("Reference roles stay unchanged when loading a prompt preset.") }),
      el("p", { class: "mmc-sheet-note", text: st("One pass builds a whole-sheet prompt; per cell adds the shared description and that cell's instructions. Cell plans are not the exact one-pass prompt.") }),
      el("p", { class: "mmc-sheet-note", text: st("Sheet settings are independent, but jobs share the ComfyUI queue and GPU. Save finished sheets individually or add them to cast; closing the workspace does not cancel a job.") }),
      pill("Prompt writing help", () => this.room.help()), pill("Prompt presets", () => this.room.promptPresets()),
    ]));
    this.stage.scrollTop = 0;
  }

  setRunning(running) {
    for (const area of this.content.querySelectorAll(".mmc-sheet-edit")) area.disabled = running;
  }

  references() {
    return Object.entries(REF_GROUPS).flatMap(([group, [kind, fileKey]]) => (this.room.state.sheet_data.refs[group] ?? [])
      .map((ref) => ({ ref, group, kind, file: ref[fileKey] ?? ref.file ?? "", key: `${group}:${ref[fileKey] ?? ref.file ?? ""}` })))
      .filter((row) => row.file);
  }

  selectReference(key) {
    this.referenceKey = key;
    if (this.tab === "references") {
      this.stage.replaceChildren(this.referencePreview());
      this.highlightReference();
    }
  }

  highlightReference() {
    for (const row of this.column.querySelectorAll("[data-sheet-ref-key]")) row.classList.toggle("selected", row.dataset.sheetRefKey === this.referenceKey);
  }

  referencePreview() {
    const refs = this.references();
    const selected = refs.find((row) => row.key === this.referenceKey) ?? refs[0];
    this.referenceKey = selected?.key ?? null;
    const media = el("div", { class: "mmc-sheet-ref-media", "data-sheet-preview": "reference" });
    if (selected) {
      const url = viewUrl(selected.file);
      const preview = selected.kind === "image" ? el("img", { src: url, alt: selected.file })
        : selected.kind === "video" ? el("video", { src: url, controls: true, muted: true, playsinline: true, loop: true, preload: "metadata" })
          : el("audio", { src: url, controls: true, preload: "metadata" });
      if (selected.kind === "video") preview.muted = true;
      media.dataset.sheetFile = selected.file;
      media.appendChild(preview);
    } else media.appendChild(el("p", { class: "mmc-sheet-note", text: st("Select a reference to preview.") }));
    return el("section", { class: "mmc-sheet-ref-stage" }, [heading("Reference preview", `${refs.length}`), media,
      el("div", { class: "mmc-sheet-ref-caption", text: selected ? selected.file : st("Add reference") })]);
  }

  planData(preset = null, suiteBoard = false) {
    const room = this.room;
    const payload = room.state.sheet_data;
    if (!preset) return { cells: payload.cells, settings: room.state.settings,
      build: room.core.readState(payload).build };
    const draft = { sheet_data: copySheet(payload), settings: copySheet(room.state.settings) };
    applySheetPreset(draft, preset);
    let cells = draft.sheet_data.cells;
    if (preset.build && Object.values(preset.build).some((values) => values?.length)) {
      // A suite board uses its preset's axes. A single layout preserves omitted
      // custom axes, exactly like the real applyPreset path above this visual layer.
      const build = suiteBoard ? preset.build : room.core.readState(draft.sheet_data).build;
      cells = room.core.buildCells(build.views ?? [], build.poses ?? [], build.expressions ?? []);
    }
    return { cells, settings: draft.settings, build: suiteBoard ? preset.build : room.core.readState(draft.sheet_data).build };
  }

  selectionSummary(build, cells) {
    const bodyViews = new Set(["front", "profile", "back"]);
    const selectedBodyViews = (build.views ?? []).filter((view) => bodyViews.has(view)).length;
    const selectedDetailViews = (build.views ?? []).length - selectedBodyViews;
    const poses = (build.poses ?? []).length || 1;
    const expressions = (build.expressions ?? []).length || 1;
    const poseSelection = selectedBodyViews * poses;
    const expressionSelection = selectedDetailViews * expressions;
    const maxed = poseSelection + expressionSelection > cells.length;
    return el("div", { class: "mmc-sheet-selection-summary" }, [
      el("strong", { text: st("Selection result: {count} cells", { count: cells.length }) }),
      el("p", { text: st("Full-body front, side and back views use poses. Face and detail views use expressions. The two groups are not multiplied together.") }),
      el("div", { class: "mmc-sheet-selection-pills" }, [
        el("span", { text: st("{views} full-body views · {poses} poses → {count} cells", { views: selectedBodyViews, poses, count: poseSelection }) }),
        el("span", { text: st("{views} face/detail views · {expressions} expressions → {count} cells", { views: selectedDetailViews, expressions, count: expressionSelection }) }),
        ...(maxed ? [el("span", { text: st("Builder limit: 24 cells") })] : []),
      ]),
    ]);
  }

  arrangement(cells, settings, miniature = false) {
    const plan = sheetArrangement(cells, settings);
    const canvas = el("div", { class: "mmc-sheet-plan-canvas", style: {
      gridTemplateColumns: `repeat(${plan.columns},minmax(0,1fr))`, gridTemplateRows: `repeat(${plan.rows},minmax(0,1fr))`,
      aspectRatio: aspect(settings.sheet_aspect),
    } });
    for (const slot of plan.slots) {
      const labelOf = (choices, key) => st(choices.find(([id]) => id === key)?.[1] ?? key ?? "");
      const block = el("div", { class: "mmc-sheet-plan-slot", style: { gridColumn: `${slot.col} / span ${slot.colSpan}`, gridRow: `${slot.row} / span ${slot.rowSpan}` } },
        miniature ? [] : [el("span", { class: "mmc-sheet-plan-number", text: String(slot.index + 1) }), this.mark("views", slot.cell.view),
          el("span", { text: labelOf(this.room.core.VIEWS, slot.cell.view) }),
          el("small", { text: labelOf(this.room.core.EXPRESSIONS, slot.cell.expression) })]);
      if (!miniature) block.dataset.sheetCell = String(slot.index);
      canvas.appendChild(block);
    }
    if (!plan.slots.length) canvas.appendChild(el("p", { class: "mmc-sheet-note", text: st("No enabled cells.") }));
    return canvas;
  }

  stagePlan() {
    const suite = this.room.state.sheet_data.render.suite ?? [];
    const boards = suite.map((id) => this.room.presets.find((entry) => entry.id === id)).filter(Boolean);
    const preset = boards.find((entry) => entry.id === this.planBoard) ?? boards[0] ?? null;
    this.planBoard = preset?.id ?? null;
    const { cells, settings } = this.planData(preset, Boolean(boards.length));
    return el("section", { class: "mmc-sheet-plan-card", "data-sheet-preview": "plan" }, [
      heading("Stage plan", st("{count} cells", { count: cells.filter((cell) => cell.enabled !== false).length })),
      ...(boards.length ? [el("div", { class: "mmc-sheet-buttons", style: { marginBottom: "12px" } }, boards.map((entry) => {
        const select = pill(entry.label, () => { this.planBoard = entry.id; this.show("cells"); }, false, Boolean(entry.custom));
        select.setAttribute("aria-pressed", String(entry.id === this.planBoard));
        select.dataset.sheetPlanBoard = entry.id;
        return select;
      }))] : []),
      this.arrangement(cells, settings),
      el("p", { class: "mmc-sheet-note", style: { margin: "12px 0 0" }, text: st("This is a layout plan, not a generated image.") }),
    ]);
  }

  layoutControls() {
    const room = this.room;
    const payload = room.state.sheet_data;
    const layouts = room.presets.filter((entry) => ["layout", "suite"].includes(entry.kind));
    const quality = room.presets.filter((entry) => !entry.kind || entry.kind === "quality");
    const layoutTiles = el("div", { class: "mmc-sheet-layout-grid" }, layouts.map((entry) => {
      const { cells, settings } = this.planData(entry);
      const changedAxes = Object.keys(entry.build ?? {}).filter((axis) => entry.build[axis]?.length);
      const preservedAxes = ["views", "poses", "expressions"].filter((axis) => !changedAxes.includes(axis));
      const art = entry.kind === "suite" ? el("div", { class: "mmc-sheet-suite-mini" }, (entry.boards ?? []).map((id) => {
        const board = room.presets.find((item) => item.id === id);
        if (!board) return null;
        const plan = this.planData(board, true);
        const miniature = this.arrangement(plan.cells, plan.settings, true);
        miniature.dataset.sheetPlanBoard = id;
        return miniature;
      })) : this.arrangement(cells, settings, true);
      const control = el("button", { type: "button", class: "mmc-sheet-layout-tile", "aria-pressed": payload.render.layoutPreset === entry.id,
        onclick: () => { if (room.state.active) return; room.applyPreset(entry); room.renderForm(); } }, [
        art, el("span", { text: entry.custom ? entry.label : st(entry.label) }),
        el("small", { text: entry.kind === "suite"
          ? st("Creates a separate sheet for each selected board.")
          : st("{count} cells · this preset sets {sets} and keeps your current {keeps}.", {
            count: cells.filter((cell) => cell.enabled !== false).length,
            sets: changedAxes.length ? changedAxes.map((axis) => st(axis === "views" ? "Framing" : axis === "poses" ? "Poses" : "Expressions")).join(", ") : st("layout only"),
            keeps: preservedAxes.length ? preservedAxes.map((axis) => st(axis === "views" ? "Framing" : axis === "poses" ? "Poses" : "Expressions")).join(", ") : st("no other selection"),
          }) }),
      ]);
      control.dataset.sheetPreset = entry.id;
      return control;
    }));
    const resolution = el("div", { class: "mmc-sheet-resolution" });
    const selectedResolution = room.resolutions.length && typeof room.core.resolutionKeyFor === "function"
      ? room.core.resolutionKeyFor({ resolutions: room.resolutions }, room.state.settings) : "";
    for (const row of room.resolutions) {
      const control = pill(row.label ?? row.key, () => {
        if (room.state.active) return;
        room.state.settings.sheet_short_edge = Number(row.sheetShortEdge);
        room.state.settings.cell_size = Number(row.cellShortEdge);
        // Explicit size widgets are authoritative; retain unknown sheet/render fields.
        room.syncResolution(); room.commit(); room.renderForm();
      }, false, true);
      control.dataset.sheetResolution = row.key;
      control.setAttribute("aria-pressed", String(row.key === selectedResolution));
      control.title = `${row.sheetShortEdge} / ${row.cellShortEdge}px`;
      resolution.appendChild(control);
    }
    const modes = el("div", { class: "mmc-sheet-mode" });
    const mode = room.state.settings.single_pass === false ? "percell" : "onepass";
    for (const [key, label] of [["onepass", "One pass"], ["percell", "Per cell"]]) {
      const control = pill(label, () => {
        if (room.state.active) return;
        room.state.settings.single_pass = key !== "percell";
        payload.render.singlePass = room.state.settings.single_pass;
        room.commit(); room.renderForm();
      });
      control.dataset.sheetMode = key;
      control.setAttribute("aria-pressed", String(key === mode));
      modes.appendChild(control);
    }
    const qualityControls = el("div", { class: "mmc-sheet-quality" }, quality.map((entry) => {
      const short = !entry.custom ? { balanced: "Balanced preset", "per-cell": "Per-cell preset", identity: "Max identity preset" }[entry.id] : null;
      const control = pill(short ?? entry.label, () => { if (room.state.active) return; room.applyPreset(entry); room.renderForm(); }, false, Boolean(entry.custom));
      control.title = entry.custom ? entry.label : st(entry.label);
      control.dataset.sheetPreset = entry.id;
      control.setAttribute("aria-pressed", String(payload.render.preset === entry.id));
      return control;
    }));
    const layoutFields = ["sheet_layout", "sheet_columns"].map((name) => room.knobField(name)).filter(Boolean);
    const shapeFields = ["sheet_aspect", "cell_aspect"].map((name) => room.knobField(name)).filter(Boolean);
    const elements = [heading("Layout presets"),
      el("p", { class: "mmc-sheet-context-note", text: st("A layout preset changes only the build choices it includes; other choices stay selected. A suite runs each selected board as a separate sheet.") }),
      layoutTiles,
      ...(layoutFields.length ? [el("hr", { class: "mmc-sheet-studio-divider" }), heading("Layout details"),
        el("div", { class: "mmc-sheet-context-grid" }, layoutFields)] : []),
      ...(shapeFields.length ? [el("hr", { class: "mmc-sheet-studio-divider" }), heading("Sheet and cell shape"),
        el("div", { class: "mmc-sheet-context-grid" }, shapeFields)] : []),
      el("hr", { class: "mmc-sheet-studio-divider" }), heading("Resolution"), resolution,
      ...(!selectedResolution ? [el("p", { class: "mmc-sheet-note", text: st("Custom") })] : []),
      el("hr", { class: "mmc-sheet-studio-divider" }), heading("Quality presets"), qualityControls,
      el("p", { class: "mmc-sheet-context-note", text: st("Quality presets apply a group of generation defaults. Mode controls one full-sheet render or separate renders for each cell.") }),
      el("hr", { class: "mmc-sheet-studio-divider" }), heading("Mode"), modes,
      el("p", { class: "mmc-sheet-note", text: st("Built-in layout and quality presets keep the selected resolution.") })];
    if (payload.render.suite?.length) elements.push(el("p", { class: "mmc-sheet-note", text: st("Choose the sheets in this suite.") }),
      room.ticks(layouts.filter((entry) => entry.kind === "layout").map((entry) => [entry.id, entry.label, Boolean(entry.custom)]), payload.render.suite, (values) => {
        if (room.state.active) return;
        payload.render.suite = values; room.commit(); room.renderForm();
      }));
    return el("div", {}, elements);
  }

  promptPlans() {
    const room = this.room;
    const plans = el("details", { class: "mmc-sheet-prompt-plans" }, [
      el("summary", { text: st("Actual per-cell prompts") }),
      el("p", { class: "mmc-sheet-note", text: st("These are the model-ready prompts for each built cell. The shared character description is edited in the References tab; this view shows how it combines with reference roles and cell instructions.") }),
    ]);
    const output = el("div", { class: "mmc-sheet-plan-text" });
    const refresh = pill("Refresh cell plans", async () => {
      const version = ++this.planVersion;
      const submitted = { spec: copySheet(room.state.sheet_data), scope: room.state.settings.ref_scope, cell_size: room.state.settings.cell_size };
      const signature = JSON.stringify(submitted);
      refresh.disabled = true;
      output.replaceChildren(el("p", { class: "mmc-sheet-note", text: st("Loading…") }));
      try {
        const answer = await room.action("plan", submitted);
        if (!room.alive() || this.tab !== "cells" || version !== this.planVersion) return;
        if (signature !== JSON.stringify({ spec: room.state.sheet_data, scope: room.state.settings.ref_scope, cell_size: room.state.settings.cell_size })) {
          output.replaceChildren(el("p", { class: "mmc-sheet-note", text: st("Inputs changed. Refresh the cell plans again.") }));
          return;
        }
        output.replaceChildren(...(answer.cells ?? []).map((cell) => room.card(cell.id, [
          el("p", { class: "mmc-sheet-note", text: (cell.refs ?? []).map((ref) => typeof ref === "string" ? ref : JSON.stringify(ref)).join(" · ") }),
          el("div", { class: "mmc-sheet-cell-plan" }, [el("pre", { text: cell.prompt ?? "" })]),
        ], true)));
        if (!answer.cells?.length) output.appendChild(el("p", { class: "mmc-sheet-note", text: st("No enabled cells.") }));
      } catch (error) { if (room.alive() && this.tab === "cells" && version === this.planVersion) output.replaceChildren(el("p", { class: "mmc-sheet-error", text: error.message })); }
      finally { if (room.alive() && version === this.planVersion) refresh.disabled = false; }
    });
    this.promptPlanOutput = output;
    this.promptRefresh = refresh;
    plans.append(refresh, output);
    return plans;
  }

  draftChanged() {
    if (this.tab !== "cells") return;
    this.planVersion++;
    this.promptPlanOutput?.replaceChildren(el("p", { class: "mmc-sheet-note", text: st("Inputs changed. Refresh the cell plans again.") }));
    if (this.promptRefresh) this.promptRefresh.disabled = false;
  }

  renderGenerated() {
    const room = this.room;
    const sheets = room.sheets.filter((sheet) => sheet.sheetUrl && sheetFile(sheet.sheetUrl, location.href));
    const sheet = sheets.find((entry) => (entry.board ?? entry.name) === this.previewBoard) ?? sheets[0];
    this.previewBoard = sheet ? sheet.board ?? sheet.name : null;
    const choices = el("div", { class: "mmc-sheet-buttons" }, sheets.map((entry) => {
      const control = pill(entry.board ?? entry.name, () => { this.previewBoard = entry.board ?? entry.name; this.renderGenerated(); }, false, true);
      control.setAttribute("aria-pressed", String((entry.board ?? entry.name) === this.previewBoard));
      return control;
    }));
    const stage = el("section", { class: "mmc-sheet-generated-stage", "data-sheet-preview": "generated" }, [heading("Generated media"), choices]);
    if (sheet) {
      const file = sheetFile(sheet.sheetUrl, location.href);
      stage.dataset.sheetFile = file.filename;
      stage.append(el("img", { class: "mmc-sheet-preview", src: room.localMediaUrl(sheet.sheetUrl), alt: sheet.sheetFile ?? sheet.name }),
        el("div", { class: "mmc-sheet-buttons" }, [pill("Save to…", () => room.saveFile(file)),
          pill("New cast member", () => room.attachFiles([{ file, sheet }], false)),
          pill("Add to existing cast", () => room.attachFiles([{ file, sheet }], true))]));
    } else stage.appendChild(el("p", { class: "mmc-sheet-note", text: st("No generated sheets yet.") }));
    this.stage.replaceChildren(stage);
  }

  resultsChanged() { if (this.tab === "preview") this.renderGenerated(); }
  close() { this.planVersion++; }
}
