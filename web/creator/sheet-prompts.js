import { el, mountOverlay } from "./dom.js";
import { st } from "./sheet-locales.js";
import { SHEET_PROMPT_PRESETS, newSheetPromptId } from "./sheet-prompt-data.js";
import { loadSheetPromptPrefs, saveSheetPromptPrefs, normalizeSheetPromptPrefs } from "./sheet-prompt-store.js";

function pill(text, onclick, primary = false) {
  return el("button", { type: "button", class: `mmc-sheet-button${primary ? " primary" : ""}`, text: st(text), onclick });
}

function title(preset) { return preset.id.startsWith("builtin:") ? st(preset.label) : preset.label; }
function excerpt(text) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > 260 ? `${value.slice(0, 260)}…` : value;
}

function trapTab(event, dialog) {
  if (event.key !== "Tab") return;
  const controls = [...dialog.querySelectorAll("button:not([disabled]),input:not([disabled])")].filter((node) => !node.hidden);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

function styles() {
  if (document.getElementById("mmc-sheet-prompts-style")) return;
  document.head.appendChild(el("style", { id: "mmc-sheet-prompts-style", text: `
.mmc-sheet-prompt-library { width:min(1060px,calc(100vw - 32px)); box-sizing:border-box; padding:20px; }
.mmc-sheet-prompt-head { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
.mmc-sheet-prompt-head h3 { margin:0; flex:1; }
.mmc-sheet-prompt-search { display:flex; gap:10px; margin-bottom:10px; }
.mmc-sheet-prompt-tabs { display:flex; gap:8px; margin-bottom:14px; }
.mmc-sheet-prompt-tabs [aria-pressed=true] { border-color:#b07c2d; color:#ffc776; background:#5c401b; }
.mmc-sheet-prompt-columns { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:20px; }
.mmc-sheet-prompt-list { display:flex; flex-direction:column; gap:6px; }
.mmc-sheet-prompt-row { display:flex; gap:8px; align-items:center; background:#ffffff05; border:1px solid #444; border-radius:12px; padding:8px 10px; }
.mmc-sheet-prompt-row.selected { background:#563c1d; border-color:#9e7029; }
.mmc-sheet-prompt-select { flex:1; min-width:0; text-align:left; color:inherit; background:transparent; border:0; padding:0; font:inherit; cursor:pointer; overflow-wrap:anywhere; }
.mmc-sheet-prompt-select small { display:block; color:#aaa; margin-top:2px; font-size:11px; }
.mmc-sheet-prompt-star { border:0; padding:3px; background:none; color:#aaa; font:18px/1 sans-serif; cursor:pointer; }
.mmc-sheet-prompt-star[aria-pressed=true] { color:#efb54e; }
.mmc-sheet-prompt-pages { display:flex; align-items:center; gap:10px; margin-top:12px; }
.mmc-sheet-prompt-pages span { flex:1; text-align:center; color:#aaa; }
.mmc-sheet-prompt-preview { padding:14px; border:1px solid #444; border-radius:14px; background:#151515; overflow-wrap:anywhere; }
.mmc-sheet-prompt-preview h4 { margin:0 0 12px; font-size:14px; }
.mmc-sheet-prompt-preview strong { font-size:11px; color:#aaa; }
.mmc-sheet-prompt-preview p { white-space:pre-wrap; margin:4px 0 12px; font-size:12px; line-height:1.45; }
.mmc-sheet-prompt-preview .mmc-sheet-note { color:#aaa; font-size:11px; }
.mmc-sheet-prompt-status { margin:12px 0 0; min-height:1.5em; color:#aaa; font-size:12px; overflow-wrap:anywhere; }
.mmc-sheet-prompt-library .mmc-sheet-note { margin-bottom:10px; font-size:12px; }
.mmc-sheet-prompt-name { margin:12px 0; }
@media(max-width:780px) { .mmc-sheet-prompt-library { padding:14px; } .mmc-sheet-prompt-columns { gap:12px; } .mmc-sheet-prompt-row { padding:6px 8px; } }
` }));
}

export async function saveSheetPromptRecord(record) {
  if (!record.label?.trim()) throw new Error(st("Give the preset a name."));
  if (!record.identity?.trim() && !record.negative?.trim()) throw new Error(st("Enter a description or negative prompt first."));
  const prefs = normalizeSheetPromptPrefs(await loadSheetPromptPrefs());
  const preset = { id: record.id ?? newSheetPromptId(), label: record.label.trim(),
    identity: record.identity ?? "", negative: record.negative ?? "" };
  const index = prefs.custom.findIndex((row) => row.id === preset.id);
  if (record.id && index === -1) throw new Error(st("This preset was deleted. Save it as a new preset instead."));
  if (index === -1) prefs.custom.push(preset); else prefs.custom[index] = preset;
  const result = await saveSheetPromptPrefs(prefs);
  return { ...result, preset };
}

export function openSheetPrompts(options) {
  const library = new SheetPromptLibrary(options);
  library.mount();
  return library;
}

class SheetPromptLibrary {
  constructor({ getValues, onApply, onEdit, isAlive = () => true, onClose = () => {} }) {
    this.getValues = getValues;
    this.onApply = onApply;
    this.onEdit = onEdit;
    this.isAlive = isAlive;
    this.onClose = onClose;
    this.prefs = { version: 1, custom: [], favorites: [] };
    this.tab = "all";
    this.page = 0;
    this.query = "";
    this.selected = SHEET_PROMPT_PRESETS[0].id;
    this.loaded = false;
    this.busy = false;
    this.closed = false;
    this.children = new Set();
    this.returnFocus = document.activeElement;
  }

  alive() { return !this.closed && this.isAlive(); }
  all() { return [...SHEET_PROMPT_PRESETS, ...this.prefs.custom]; }
  chosen() { return this.all().find((preset) => preset.id === this.selected); }
  rows() {
    const needle = this.query.trim().toLocaleLowerCase();
    return this.all().filter((preset) => (this.tab !== "favorites" || this.prefs.favorites.includes(preset.id))
      && (this.tab !== "custom" || preset.id.startsWith("custom:"))
      && (!needle || [title(preset), preset.label, st(preset.category ?? "My presets"), preset.identity, preset.negative]
        .some((text) => String(text).toLocaleLowerCase().includes(needle))));
  }

  mount() {
    styles();
    this.status = el("div", { class: "mmc-sheet-prompt-status", role: "status", "aria-live": "polite" });
    this.search = el("input", { type: "search", placeholder: st("Search prompt presets"), "aria-label": st("Search prompt presets"),
      oninput: () => { this.query = this.search.value; this.page = 0; this.render(); } });
    this.tabs = el("div", { class: "mmc-sheet-prompt-tabs", role: "group", "aria-label": st("Prompt presets") });
    this.list = el("div", { class: "mmc-sheet-prompt-list" });
    this.pages = el("div", { class: "mmc-sheet-prompt-pages" });
    this.preview = el("div", { class: "mmc-sheet-prompt-preview" });
    this.add = pill("Save current as preset", () => this.nameDialog());
    this.dialog = el("section", { class: "mmc-sheet-small mmc-sheet-prompt-library", role: "dialog", "aria-modal": true,
      "aria-label": st("Prompt presets"), onkeydown: (event) => trapTab(event, this.dialog) }, [
      el("div", { class: "mmc-sheet-prompt-head" }, [el("h3", { text: st("Prompt presets") }), pill("Close", () => this.close())]),
      el("p", { class: "mmc-sheet-note", text: st("Load a reusable description and negative prompt. References, roles, models, cells and settings are not saved in these presets.") }),
      el("div", { class: "mmc-sheet-prompt-search" }, [this.search, this.add]), this.tabs,
      el("div", { class: "mmc-sheet-prompt-columns" }, [el("div", {}, [this.list, this.pages]), this.preview]), this.status,
    ]);
    this.overlay = el("div", { class: "mmc-overlay mmc-sheet-overlay" }, [this.dialog]);
    this.unmount = mountOverlay(this.overlay, () => this.close());
    this.render();
    this.search.focus();
    loadSheetPromptPrefs().then((prefs) => {
      if (!this.alive()) return;
      this.prefs = normalizeSheetPromptPrefs(prefs); this.loaded = true; this.render();
    }).catch(() => {
      if (!this.alive()) return;
      this.status.textContent = st("Personal presets could not be loaded. Built-in presets are still available.");
      this.status.classList.add("mmc-sheet-error");
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const close of [...this.children]) close();
    this.unmount?.();
    this.onClose();
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
  }

  render() {
    if (!this.alive()) return;
    this.add.disabled = this.busy || !this.loaded;
    this.tabs.replaceChildren(...[["all", "All presets"], ["favorites", "Favorites"], ["custom", "My presets"]].map(([key, label]) =>
      el("button", { type: "button", class: "mmc-sheet-button", text: st(label), "aria-pressed": this.tab === key,
        onclick: () => { this.tab = key; this.page = 0; this.render(); } })));
    const rows = this.rows(), perPage = 6;
    if (!rows.some((preset) => preset.id === this.selected)) this.selected = rows[0]?.id ?? null;
    const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
    this.page = Math.min(this.page, pageCount - 1);
    this.list.replaceChildren(...rows.slice(this.page * perPage, (this.page + 1) * perPage).map((preset) => {
      const favorite = this.prefs.favorites.includes(preset.id);
      return el("div", { class: `mmc-sheet-prompt-row${this.selected === preset.id ? " selected" : ""}`, "data-preset-id": preset.id }, [
        el("button", { type: "button", class: "mmc-sheet-prompt-select", onclick: () => { this.selected = preset.id; this.render(); } }, [
          el("span", { text: title(preset) }), el("small", { text: st(preset.category ?? "My presets") }),
        ]), el("button", { type: "button", class: "mmc-sheet-prompt-star", text: favorite ? "★" : "☆", "aria-pressed": favorite,
          "aria-label": st(favorite ? "Remove from favorites" : "Add to favorites"), disabled: this.busy || !this.loaded,
          onclick: () => this.favorite(preset.id) }),
      ]);
    }));
    if (!rows.length) this.list.appendChild(el("p", { class: "mmc-sheet-note", text: st("No matching presets.") }));
    const previous = pill("Previous", () => { this.page--; this.render(); });
    const next = pill("Next", () => { this.page++; this.render(); });
    previous.disabled = this.page === 0; next.disabled = this.page === pageCount - 1;
    this.pages.replaceChildren(previous, el("span", { text: st("{count} presets · {page}/{pages}", { count: rows.length, page: this.page + 1, pages: pageCount }) }), next);
    const preset = this.chosen();
    if (!preset) { this.preview.replaceChildren(el("p", { text: st("Select a preset.") })); return; }
    const load = pill("Load into fields", () => this.apply(preset), true);
    const copy = pill("Save a copy", () => this.nameDialog(null, { identity: preset.identity, negative: preset.negative }, title(preset)));
    copy.disabled = this.busy || !this.loaded;
    const controls = [load, copy];
    if (preset.id.startsWith("custom:")) {
      const edit = pill("Edit prompt in fields", () => this.edit(preset));
      const rename = pill("Rename", () => this.nameDialog(preset));
      const remove = pill("Delete", () => this.delete(preset));
      edit.disabled = rename.disabled = remove.disabled = this.busy;
      controls.push(edit, rename, remove);
    }
    this.preview.replaceChildren(el("h4", { text: title(preset) }),
      el("strong", { text: st("Identity description") }), el("p", { text: excerpt(preset.identity) || st("Empty field — loading clears it.") }),
      el("strong", { text: st("Negative prompt") }), el("p", { text: excerpt(preset.negative) || st("Empty field — loading clears it.") }),
      el("p", { class: "mmc-sheet-note", text: st("Preview excerpt. Load into the sheet fields to read or edit the complete text; no prompt text is truncated when saved or loaded.") }),
      el("div", { class: "mmc-sheet-buttons" }, controls));
  }

  async persist(next) {
    if (this.busy || !this.loaded || !this.alive()) return false;
    this.busy = true; this.render();
    try {
      const result = await saveSheetPromptPrefs(next);
      if (!this.alive()) return false;
      this.prefs = normalizeSheetPromptPrefs(next);
      this.status.textContent = st(result.location === "browser" ? "Saved in this browser only." : "Prompt preset saved.");
      this.status.classList.remove("mmc-sheet-error");
      return true;
    } catch {
      if (this.alive()) { this.status.textContent = st("Sheet prompt preset save failed"); this.status.classList.add("mmc-sheet-error"); }
      return false;
    } finally { this.busy = false; this.render(); }
  }

  async favorite(id) {
    const next = normalizeSheetPromptPrefs(this.prefs);
    if (next.favorites.includes(id)) next.favorites = next.favorites.filter((value) => value !== id);
    else next.favorites.push(id);
    await this.persist(next);
  }

  small(heading, build) {
    let closed = false;
    const dialog = el("section", { class: "mmc-sheet-small", role: "dialog", "aria-modal": true, "aria-label": st(heading),
      onkeydown: (event) => trapTab(event, dialog) }, [el("h3", { text: st(heading) })]);
    const close = () => { if (closed) return; closed = true; this.children.delete(close); unmount(); };
    const unmount = mountOverlay(el("div", { class: "mmc-overlay mmc-sheet-overlay" }, [dialog]), close);
    this.children.add(close);
    build(dialog, close, () => !closed && this.alive());
  }

  confirm(preset, edit, action) {
    const current = this.getValues();
    if ((!current.identity && !current.negative)
        || (current.identity === preset.identity && current.negative === preset.negative)) { action(); return; }
    this.small(edit ? "Edit prompt in fields" : "Replace current prompt?", (dialog, close, alive) => {
      dialog.appendChild(el("p", { class: "mmc-sheet-note", text: st("This replaces both description and negative prompt, including empty fields. References, roles, models, cells and settings remain unchanged.") }));
      dialog.appendChild(el("div", { class: "mmc-sheet-buttons" }, [pill(edit ? "Edit prompt in fields" : "Load into fields", () => {
        if (!alive()) return; close(); action();
      }, true), pill("Cancel", close)]));
    });
  }

  apply(preset) {
    this.confirm(preset, false, () => {
      if (!this.alive()) return;
      this.onApply(preset);
      this.close();
    });
  }

  edit(preset) {
    this.confirm(preset, true, () => {
      if (!this.alive()) return;
      this.onEdit(preset);
      this.close();
    });
  }

  nameDialog(existing = null, values = null, initialName = "") {
    values ??= existing ? { identity: existing.identity, negative: existing.negative } : this.getValues();
    if (!values.identity?.trim() && !values.negative?.trim()) {
      this.status.textContent = st("Enter a description or negative prompt first."); this.status.classList.add("mmc-sheet-error"); return;
    }
    this.small(existing ? "Rename preset" : "Save prompt preset", (dialog, close, alive) => {
      const name = el("input", { type: "text", autocomplete: "off", "aria-label": st("Preset name") });
      name.value = existing?.label ?? initialName;
      dialog.appendChild(el("label", { class: "mmc-sheet-field mmc-sheet-prompt-name" }, [el("span", { text: st("Preset name") }), name]));
      dialog.appendChild(el("p", { class: "mmc-sheet-note", text: st("Only the two prompt fields are stored. Change people by changing references and their roles, then load this preset again.") }));
      const notice = el("p", { class: "mmc-sheet-error" });
      const save = pill("Save preset", async () => {
        if (!name.value.trim()) { notice.textContent = st("Give the preset a name."); return; }
        save.disabled = true;
        const next = normalizeSheetPromptPrefs(this.prefs);
        const record = { id: existing?.id ?? newSheetPromptId(), label: name.value.trim(), identity: values.identity, negative: values.negative };
        const index = next.custom.findIndex((preset) => preset.id === record.id);
        if (index < 0) next.custom.push(record); else next.custom[index] = record;
        if (await this.persist(next)) {
          if (alive()) {
            this.selected = record.id; this.tab = "custom"; this.query = ""; this.search.value = "";
            this.page = Math.floor(this.prefs.custom.findIndex((preset) => preset.id === record.id) / 6);
            close(); this.render();
          }
        } else if (alive()) { notice.textContent = st("Sheet prompt preset save failed"); save.disabled = false; }
      }, true);
      dialog.append(notice, el("div", { class: "mmc-sheet-buttons" }, [save, pill("Cancel", close)]));
      name.focus();
    });
  }

  delete(preset) {
    this.small("Delete prompt preset?", (dialog, close, alive) => {
      dialog.appendChild(el("p", { text: preset.label }));
      dialog.appendChild(el("p", { class: "mmc-sheet-note", text: st("This removes only the saved preset and its favorite. The current sheet prompt and references are not changed.") }));
      const remove = pill("Delete", async () => {
        remove.disabled = true;
        const next = normalizeSheetPromptPrefs(this.prefs);
        next.custom = next.custom.filter((row) => row.id !== preset.id);
        next.favorites = next.favorites.filter((id) => id !== preset.id);
        if (await this.persist(next)) {
          if (alive()) { this.selected = this.rows()[0]?.id ?? SHEET_PROMPT_PRESETS[0].id; close(); this.render(); }
        } else if (alive()) remove.disabled = false;
      });
      dialog.appendChild(el("div", { class: "mmc-sheet-buttons" }, [remove, pill("Cancel", close)]));
    });
  }
}
