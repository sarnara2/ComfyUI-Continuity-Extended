import { el, icon, mountOverlay } from "./dom.js";
import { t } from "./i18n.js";
import { BUILTIN_CAST_PRESETS, BUILTIN_PIECE_REFERENCE_PRESETS, CAST_PRESET_CATEGORIES, matchesCastPreset } from "./cast-preset-data.js";
import { loadCastPresetPrefs, saveCastPresetPrefs } from "./cast-preset-store.js";

function trapTab(event, dialog) {
  if (event.key !== "Tab") return;
  const controls = [...dialog.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
  )].filter((node) => node.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (!first) { event.preventDefault(); dialog.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
}

const labelOf = (preset) => preset.id.startsWith("custom:") ? preset.label : t(preset.label);
const categoryOf = (category) => t(CAST_PRESET_CATEGORIES[category] ?? CAST_PRESET_CATEGORIES.custom ?? "Custom");

export function openCastPresets({ field, title, getValue, onApply, onAction, returnFocus, restoreFocus }) {
  let prefs = { custom: [], favorites: [], recent: [] };
  let tab = "all", category = "all", selected = null, loaded = false, saving = false, closed = false;
  let storageLocation = "user";
  let customClose = null;
  const acceptsText = field !== "replaces";
  const heading = field.startsWith("piece_") ? "Piece reference presets" : "Cast presets";
  const catalog = () => [...BUILTIN_CAST_PRESETS, ...BUILTIN_PIECE_REFERENCE_PRESETS, ...prefs.custom].filter((preset) => preset.field === field);
  const close = (focus = true) => {
    if (closed) return;
    closed = true;
    customClose?.(false);
    unmount();
    if (!focus) return;
    if (returnFocus?.isConnected) {
      returnFocus.focus();
      if (document.activeElement !== returnFocus) restoreFocus?.();
    } else restoreFocus?.();
  };
  const status = el("div", { class: "mmc-cp-status", role: "status", "aria-live": "polite" });
  const setStatus = (message = "", warning = false) => {
    const fallback = t("Saved in this browser only");
    status.textContent = !warning && storageLocation === "browser"
      ? [message, ...(message === fallback ? [] : [fallback])].filter(Boolean).join(" · ") : message;
    status.classList.toggle("warning", warning);
  };
  const savePrefs = async (next) => {
    if (saving) return false;
    const focused = document.activeElement;
    const focusId = focused?.closest(".mmc-cp-row")?.dataset.presetId;
    const focusStar = focused?.classList.contains("mmc-cp-star");
    saving = true;
    renderResults();
    try {
      const saved = await saveCastPresetPrefs(next);
      prefs = next;
      storageLocation = saved?.location ?? "user";
      setStatus();
      return true;
    } catch {
      setStatus(t("Save failed. Try again."), true);
      return false;
    } finally {
      saving = false;
      if (!closed) {
        renderResults();
        if (focusId && !customClose) [...results.children].find((row) => row.dataset.presetId === focusId)
          ?.querySelector(focusStar ? ".mmc-cp-star" : ".mmc-cp-select")?.focus();
      }
    }
  };
  const apply = async (force = false) => {
    if (!selected || saving) return;
    const preset = selected;
    if (preset.action) {
      const next = { ...prefs, recent: [preset.id, ...prefs.recent.filter((id) => id !== preset.id)].slice(0, 24) };
      await savePrefs(next);
      if (closed) return;
      close(false);
      onAction?.(preset.action);
      return;
    }
    const result = onApply(preset, force);
    warning.replaceChildren();
    warning.hidden = true;
    if (!result?.ok) {
      warning.hidden = false;
      warning.append(el("span", { text: result?.message ?? t("Check the existing text before appending.") }));
      if (!result?.blocked) warning.append(el("button", {
        class: "mmc-cp-pill mmc-cp-force", type: "button", text: t("Append anyway"), onclick: () => apply(true),
      }));
      return;
    }
    const next = { ...prefs, recent: [preset.id, ...prefs.recent.filter((id) => id !== preset.id)].slice(0, 24) };
    updatePreview();
    if (await savePrefs(next)) setStatus(result.message ?? t("Preset appended"));
  };

  const closeButton = el("button", {
    class: "mmc-close mmc-cp-close", type: "button", "aria-label": t("Close"), onclick: () => close(),
  }, [icon("close", 22)]);
  const addButton = el("button", {
    class: "mmc-cp-pill mmc-cp-add", type: "button", onclick: () => openCustom(), disabled: true,
  }, [icon("plus", 16), el("span", { text: t("Add custom preset") })]);
  const tabs = el("div", { class: "mmc-cp-tabs", role: "group", "aria-label": t(heading) });
  const search = el("input", {
    class: "mmc-cp-search-input", type: "search", placeholder: t("Search in Korean or English"),
    "aria-label": t("Search in Korean or English"), autocomplete: "off",
    oninput: () => { clearSearch.hidden = !search.value; renderResults(); },
  });
  const clearSearch = el("button", {
    class: "mmc-cp-search-clear", type: "button", "aria-label": t("Clear search"), hidden: true,
    onclick: () => { search.value = ""; clearSearch.hidden = true; renderResults(); search.focus(); },
  }, [icon("close", 16)]);
  const categories = el("div", { class: "mmc-cp-categories", role: "group", "aria-label": t("Category") });
  const count = el("span", { class: "mmc-cp-count", "aria-live": "polite" });
  const results = el("div", { class: "mmc-cp-results", "aria-label": t(heading) });
  const current = el("div", { class: "mmc-cp-current-text" });
  const previewLabel = el("span", { class: "mmc-cp-preview-label", text: t("Select a preset") });
  const preview = el("div", { class: "mmc-cp-preview-text" });
  const applyButton = el("button", {
    class: "mmc-cp-pill mmc-cp-apply", type: "button", text: t("Append preset"), disabled: true,
    onclick: () => apply(),
  });
  const warning = el("div", { class: "mmc-cp-warning", role: "status", hidden: true });
  const dialog = el("div", {
    class: "mmc-modal mmc-cp-dialog", role: "dialog", "aria-modal": true, "aria-label": t("Presets for {field}", { field: title }),
    "data-field": field, tabindex: -1, onkeydown: (event) => trapTab(event, dialog),
  }, [
    el("div", { class: "mmc-cp-head" }, [
      el("div", { class: "mmc-cp-heading" }, [
        el("div", { class: "mmc-cp-title-line" }, [
          el("strong", { class: "mmc-cp-title", text: t(heading) }),
          el("span", { class: "mmc-cp-context", text: title }),
        ]),
        el("p", { class: "mmc-cp-note", text: acceptsText
          ? t("Choose a preset to append its English text. Existing text stays unchanged.")
          : t("This action opens the reference tools. No text is appended.") }),
      ]), closeButton,
    ]),
    el("div", { class: "mmc-cp-controls" }, [
      el("div", { class: "mmc-cp-navigation" }, [tabs, ...(acceptsText ? [addButton] : [])]),
      el("div", { class: "mmc-cp-search" }, [search, clearSearch]),
      el("div", { class: "mmc-cp-filter-line" }, [categories, count]),
    ]),
    results,
    el("div", { class: "mmc-cp-foot" }, [
      ...(acceptsText ? [el("div", { class: "mmc-cp-current" }, [
        el("span", { class: "mmc-cp-preview-label", text: t("Current field") }), current,
      ])] : []),
      el("div", { class: "mmc-cp-preview" }, [
        el("div", { class: "mmc-cp-preview-copy" }, [previewLabel, preview]), applyButton,
      ]), warning, status,
    ]),
  ]);
  const overlay = el("div", {
    class: "mmc-overlay mmc-cp-overlay", onpointerdown: (event) => {
      if (event.target !== overlay) return;
      event.preventDefault(); close();
    },
  }, [dialog]);
  const unmount = mountOverlay(overlay, () => close());

  function updatePreview() {
    if (closed) return;
    const value = String(getValue?.() ?? "");
    current.textContent = value || t("Nothing entered yet");
    current.classList.toggle("empty", !value);
    previewLabel.textContent = selected ? labelOf(selected) : t("Select a preset");
    preview.textContent = selected?.action ? t("This action opens the reference tools. No text is appended.") : selected?.text ?? "";
    applyButton.textContent = selected?.action ? t("Run action") : t("Append preset");
    applyButton.disabled = !selected || saving || !loaded;
  }

  function renderResults() {
    if (closed) return;
    const active = document.activeElement;
    const activeId = active?.closest(".mmc-cp-row")?.dataset.presetId;
    const activeStar = active?.classList.contains("mmc-cp-star");
    const items = catalog();
    const filtered = items.filter((preset) => {
      if (tab === "favorites" && !prefs.favorites.includes(preset.id)) return false;
      if (tab === "recent" && !prefs.recent.includes(preset.id)) return false;
      if (tab === "custom" && !preset.id.startsWith("custom:")) return false;
      return (category === "all" || preset.category === category) && matchesCastPreset(preset, search.value);
    });
    if (tab === "recent") filtered.sort((a, b) => prefs.recent.indexOf(a.id) - prefs.recent.indexOf(b.id));
    if (selected) selected = filtered.find((preset) => preset.id === selected.id) ?? null;
    tabs.replaceChildren(...[
      ["all", "All presets"], ["favorites", "Favorites"], ["recent", "Recent"], ...(acceptsText ? [["custom", "My presets"]] : []),
    ].map(([key, label]) => el("button", {
      class: "mmc-cp-pill mmc-cp-tab", type: "button", "data-tab": key, "aria-pressed": tab === key,
      text: t(label), onclick: () => { tab = key; category = "all"; warning.hidden = true; renderResults();
        [...tabs.children].find((node) => node.dataset.tab === key)?.focus(); },
    })));
    const keys = [...new Set(items.map((preset) => preset.category))];
    categories.replaceChildren(...["all", ...keys].map((key) => el("button", {
      class: "mmc-cp-pill mmc-cp-category", type: "button", "data-category": key, "aria-pressed": category === key,
      text: key === "all" ? t("All categories") : categoryOf(key), onclick: () => {
        category = key; warning.hidden = true; renderResults();
        [...categories.children].find((node) => node.dataset.category === key)?.focus();
      },
    })));
    addButton.disabled = !loaded || saving;
    count.textContent = loaded ? t("{count} presets", { count: filtered.length }) : t("Loading presets…");
    results.replaceChildren(...filtered.map((preset) => {
      const isFavorite = prefs.favorites.includes(preset.id);
      const select = el("button", {
        class: "mmc-cp-select", type: "button", "aria-pressed": selected?.id === preset.id,
        onclick: () => {
          selected = preset; warning.hidden = true; setStatus();
          for (const button of results.querySelectorAll(".mmc-cp-select")) {
            button.setAttribute("aria-pressed", String(button === select));
          }
          updatePreview();
        },
      }, [
        el("span", { class: "mmc-cp-row-head" }, [
          el("strong", { class: "mmc-cp-row-title", text: labelOf(preset) }),
          el("span", { class: "mmc-cp-row-category", text: categoryOf(preset.category) }),
        ]),
        el("span", { class: "mmc-cp-row-text", text: preset.action ? preset.label : preset.text }),
      ]);
      return el("article", { class: "mmc-cp-row", "data-preset-id": preset.id }, [
        select,
        el("div", { class: "mmc-cp-row-tools" }, [
          el("button", {
            class: "mmc-cp-star", type: "button", "aria-pressed": isFavorite, disabled: saving || !loaded,
            "aria-label": t(isFavorite ? "Remove from favorites" : "Add to favorites"),
            onclick: async () => {
              const favorites = prefs.favorites.includes(preset.id) ? prefs.favorites.filter((id) => id !== preset.id) : [...prefs.favorites, preset.id];
              await savePrefs({ ...prefs, favorites });
            },
          }, [icon("star", 18)]),
          ...(preset.id.startsWith("custom:") ? [el("button", {
            class: "mmc-cp-edit", type: "button", "aria-label": t("Edit preset"), disabled: saving || !loaded,
            onclick: () => openCustom(preset),
          }, [icon("edit", 17)])] : []),
        ]),
      ]);
    }));
    if (!filtered.length) {
      const empty = search.value.trim() || category !== "all" ? ["No presets found", "Try another search or category."]
        : tab === "favorites" ? ["No favorites yet", "Use the star beside a preset to save it here."]
        : tab === "recent" ? ["No recent presets yet", "Applied presets appear here."]
        : tab === "custom" ? ["No custom presets yet", "Create a preset for this field."]
        : ["No presets found", "Try another search or category."];
      results.append(el("div", { class: "mmc-cp-empty" }, [
        el("strong", { text: loaded ? t(empty[0]) : t("Loading presets…") }),
        ...(loaded ? [el("span", { text: t(empty[1]) })] : []),
      ]));
    }
    updatePreview();
    if (activeId) [...results.children].find((row) => row.dataset.presetId === activeId)
      ?.querySelector(activeStar ? ".mmc-cp-star" : ".mmc-cp-select")?.focus();
  }

  function openCustom(existing = null) {
    if (!acceptsText || saving || customClose) return;
    let dismissed = false, busy = false, deleteArmed = false;
    const closeCustom = (focus = true) => {
      if (dismissed) return;
      dismissed = true; customClose = null; unmountCustom();
      if (!focus || closed) return;
      const editRow = existing && [...results.children].find((row) => row.dataset.presetId === existing.id);
      (editRow?.querySelector(".mmc-cp-edit") ?? addButton).focus();
    };
    const label = el("input", { name: "label", class: "mmc-cp-form-input", required: true, autocomplete: "off" });
    const text = el("textarea", { name: "text", class: "mmc-cp-form-input mmc-cp-form-text", rows: 5, required: true });
    const keywords = el("input", {
      name: "keywords", class: "mmc-cp-form-input", placeholder: t("Optional: Korean or English keywords"), autocomplete: "off",
    });
    const categoryKeys = [...new Set([...catalog().map((preset) => preset.category), "custom", ...(existing ? [existing.category] : [])])];
    const categoryInput = el("select", { name: "category", class: "mmc-cp-form-input" }, categoryKeys.map(
      (value) => el("option", { value, text: categoryOf(value) }),
    ));
    label.value = existing?.label ?? "";
    text.value = existing?.text ?? "";
    keywords.value = Array.isArray(existing?.keywords) ? existing.keywords.join(", ") : existing?.keywords ?? "";
    categoryInput.value = existing?.category ?? "custom";
    const message = el("div", { class: "mmc-cp-custom-status", role: "status", "aria-live": "polite" });
    const save = el("button", { class: "mmc-cp-pill mmc-cp-save", type: "submit", text: t("Save preset") });
    const remove = existing && el("button", {
      class: "mmc-cp-pill mmc-cp-delete", type: "button", text: t("Delete preset"),
      onclick: async () => {
        if (busy) return;
        if (!deleteArmed) {
          deleteArmed = true; remove.textContent = t("Really delete preset?"); remove.classList.add("armed"); return;
        }
        busy = true; save.disabled = true; remove.disabled = true;
        const next = {
          ...prefs, custom: prefs.custom.filter((preset) => preset.id !== existing.id),
          favorites: prefs.favorites.filter((id) => id !== existing.id), recent: prefs.recent.filter((id) => id !== existing.id),
        };
        if (await savePrefs(next)) { closeCustom(); setStatus(t("Preset deleted")); }
        else {
          busy = false; save.disabled = false; remove.disabled = false;
          message.textContent = t("Save failed. Try again.");
        }
      },
    });
    const form = el("form", { class: "mmc-cp-custom-form", onsubmit: async (event) => {
      event.preventDefault();
      if (busy) return;
      if (!label.value.trim() || !text.value.trim()) { message.textContent = t("Enter a display name and text."); return; }
      const preset = {
        id: existing?.id ?? `custom:${crypto.randomUUID()}`, field, label: label.value.trim(), text: text.value.trim(),
        category: categoryInput.value, keywords: keywords.value.trim(),
      };
      const custom = existing ? prefs.custom.map((item) => item.id === existing.id ? preset : item) : [...prefs.custom, preset];
      busy = true; save.disabled = true; if (remove) remove.disabled = true;
      if (await savePrefs({ ...prefs, custom })) {
        tab = "custom"; category = "all"; search.value = ""; clearSearch.hidden = true; selected = preset;
        closeCustom(); renderResults(); setStatus(t("Preset saved"));
      } else {
        busy = false; save.disabled = false; if (remove) remove.disabled = false;
        message.textContent = t("Save failed. Try again.");
      }
    } }, [
      el("div", { class: "mmc-cp-form-group" }, [
        el("label", { class: "mmc-cp-form-row" }, [el("span", { text: t("Display name") }), label]),
        el("label", { class: "mmc-cp-form-row" }, [el("span", { text: t("English text to append") }), text]),
      ]),
      el("p", { class: "mmc-cp-note", text: t("English text is inserted as written; it is not automatically translated.") }),
      el("div", { class: "mmc-cp-form-group" }, [
        el("label", { class: "mmc-cp-form-row" }, [el("span", { text: t("Category") }), categoryInput]),
        el("label", { class: "mmc-cp-form-row" }, [el("span", { text: t("Search keywords") }), keywords]),
      ]), message,
      el("div", { class: "mmc-cp-form-actions" }, [
        ...(remove ? [remove] : []),
        el("button", { class: "mmc-cp-pill mmc-cp-cancel", type: "button", text: t("Cancel"), onclick: () => closeCustom() }), save,
      ]),
    ]);
    const customDialog = el("div", {
      class: "mmc-modal mmc-cp-custom-dialog", role: "dialog", "aria-modal": true,
      "aria-label": t(existing ? "Edit custom preset" : "Add custom preset"), "data-field": field, tabindex: -1,
      onkeydown: (event) => trapTab(event, customDialog),
    }, [
      el("div", { class: "mmc-cp-head" }, [
        el("div", { class: "mmc-cp-title-line" }, [
          el("strong", { class: "mmc-cp-title", text: t(existing ? "Edit custom preset" : "Add custom preset") }),
          el("span", { class: "mmc-cp-context", text: title }),
        ]),
        el("button", { class: "mmc-close mmc-cp-close", type: "button", "aria-label": t("Close"), onclick: () => closeCustom() }, [icon("close", 22)]),
      ]), form,
    ]);
    const customOverlay = el("div", {
      class: "mmc-overlay mmc-cp-custom-overlay", onpointerdown: (event) => {
        if (event.target !== customOverlay) return;
        event.preventDefault(); closeCustom();
      },
    }, [customDialog]);
    const unmountCustom = mountOverlay(customOverlay, () => closeCustom());
    customClose = closeCustom;
    label.focus();
  }

  renderResults(); search.focus();
  loadCastPresetPrefs().then((loadedPrefs) => {
    if (closed) return;
    prefs = loadedPrefs; loaded = true; renderResults();
  }).catch(() => { loaded = true; renderResults(); setStatus(t("Save failed. Try again."), true); });
  return () => close();
}
