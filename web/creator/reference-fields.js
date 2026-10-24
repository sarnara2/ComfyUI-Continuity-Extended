// The cast and the piece's files share one field/help surface, not one owner.
// Editing these notes never activates a reference; the compiler decides which
// attached owner contributes them in each pass.
import { el, mountOverlay } from "./dom.js";
import { t } from "./i18n.js";
import { openCastPresets } from "./cast-presets.js";
import { appendCastPreset, BUILTIN_PIECE_REFERENCE_PRESETS, PIECE_REFERENCE_FIELD_HELP } from "./cast-preset-data.js";

export function openReferenceFieldHelp(help, returnFocus, restoreFocus) {
  const rows = help.examples.map(([example, meaning]) => el("tr", {}, [
    el("td", { "data-label": t("Example input"), text: t(example) }),
    el("td", { "data-label": t("Meaning"), text: t(meaning) }),
    el("td", { "data-label": t("Prompt section") }, [el("code", { text: help.section })]),
  ]));
  const examples = el("tbody", {}, rows);
  let page = 0;
  let pageSize = rows.length;
  const previous = el("button", { class: "mmc-btn", type: "button", text: t("Previous"),
    onclick: () => { page--; drawExamples(); } });
  const next = el("button", { class: "mmc-btn", type: "button", text: t("Next"),
    onclick: () => { page++; drawExamples(); } });
  const pageLabel = el("span", { role: "status", "aria-live": "polite" });
  const pages = el("div", { class: "mmc-cast-help-pages", hidden: true }, [previous, pageLabel, next]);
  function drawExamples() {
    page = Math.max(0, Math.min(page, Math.ceil(rows.length / pageSize) - 1));
    const start = page * pageSize;
    examples.replaceChildren(...rows.slice(start, start + pageSize));
    pages.hidden = pageSize >= rows.length;
    previous.disabled = page === 0;
    next.disabled = start + pageSize >= rows.length;
    pageLabel.textContent = t("Examples {start}–{end} of {total}", {
      start: start + 1, end: Math.min(rows.length, start + pageSize), total: rows.length,
    });
  }
  const content = el("div", { class: "mmc-cast-help-content", tabindex: 0 }, [
    el("p", { text: t(help.note) }),
    el("table", {}, [
      el("thead", {}, [el("tr", {}, ["Example input", "Meaning", "Prompt section"].map(
        (heading) => el("th", { text: t(heading) })))]),
      examples,
    ]), pages,
  ]);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener("resize", fitExamples);
    unmount();
    if (returnFocus?.isConnected) {
      returnFocus.focus();
      if (document.activeElement !== returnFocus) restoreFocus?.();
    } else restoreFocus?.();
  };
  const closeButton = el("button", {
    class: "mmc-close", type: "button", text: "✕", title: t("Close"), "aria-label": t("Close"), onclick: close,
  });
  const dialog = el("div", {
    class: "mmc-modal mmc-cast-help-dialog", role: "dialog", "aria-modal": true, "aria-label": t(help.title),
    onkeydown: (event) => {
      if (event.key !== "Tab") return;
      const controls = [closeButton, content, ...(!pages.hidden ? [previous, next].filter((button) => !button.disabled) : [])];
      const at = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(at + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    },
  }, [
    el("div", { class: "mmc-modal-head" }, [
      el("span", { class: "mmc-tab", "aria-selected": true, text: t(help.title) }), closeButton,
    ]), content,
  ]);
  const overlay = el("div", { class: "mmc-overlay mmc-cast-help-overlay",
    onpointerdown: (event) => {
      if (event.target !== overlay) return;
      event.preventDefault(); close();
    },
  }, [dialog]);
  function fitExamples() {
    if (closed || !dialog.isConnected) return;
    const start = page * pageSize;
    pageSize = rows.length;
    page = 0;
    drawExamples();
    const room = (window.visualViewport?.height ?? window.innerHeight) - 48;
    while (pageSize > 1 && dialog.getBoundingClientRect().height > room) {
      pageSize--;
      page = Math.floor(start / pageSize);
      drawExamples();
    }
  }
  const unmount = mountOverlay(overlay, close);
  window.addEventListener("resize", fitExamples);
  requestAnimationFrame(fitExamples);
  closeButton.focus();
}

export function pieceReferenceFields(asset, { available = () => true, onChange, restoreFocus } = {}) {
  const fields = new Map();
  const fit = (field) => {
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + 2}px`;
  };
  const group = el("div", {
    class: "mmc-cast-field-group mmc-cast-reference-group mmc-piece-reference-fields",
    onpointerdown: (event) => event.stopPropagation(),
  }, ["description", "usage_rules"].map((key) => {
    const namespace = `piece_${key}`;
    const help = PIECE_REFERENCE_FIELD_HELP[namespace];
    const field = el("textarea", {
      class: "mmc-cast-desc", rows: 1, "data-field": namespace,
      "aria-label": t(help.title), value: asset[key] ?? "",
      placeholder: t(key === "description" ? "Who or what this reference represents"
        : "What to keep, change or transfer from this reference"),
      oninput: () => {
        if (!group.isConnected || !available()) return;
        asset[key] = field.value;
        fit(field); onChange?.();
      },
      onfocus: () => fit(field),
    });
    field.value = asset[key] ?? "";
    fields.set(key, field);
    const folded = (text) => String(text).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    const apply = (preset, force = false) => {
      if (!group.isConnected || !available() || preset.field !== namespace || !preset.text) {
        return { ok: false, blocked: true, message: t("This reference is no longer available.") };
      }
      const value = asset[key] ?? "";
      const current = folded(value);
      if (current.includes(folded(preset.text))) {
        return { ok: false, blocked: true, message: t("This phrase is already in the field.") };
      }
      const conflict = BUILTIN_PIECE_REFERENCE_PRESETS.some((item) => item.field === namespace
        && item.text && current.includes(folded(item.text)) && preset.rule
        && item.rule?.group === preset.rule.group && item.rule.value !== preset.rule.value);
      if (!force && conflict) {
        return { ok: false, message: t("This may conflict with an existing target or preservation rule. Review the English text before appending; nothing will be removed automatically.") };
      }
      asset[key] = appendCastPreset(value, preset.text);
      field.value = asset[key]; fit(field); onChange?.();
      return { ok: true };
    };
    return el("div", { class: "mmc-cast-description" }, [
      el("div", { class: "mmc-cast-description-label" }, [
        el("button", {
          class: "mmc-cast-preset-label", type: "button", text: t(help.title), "data-field": namespace,
          "aria-label": t("{field} presets", { field: t(help.title) }),
          onclick: (event) => {
            event.stopPropagation();
            if (!available()) return;
            openCastPresets({ field: namespace, title: t(help.title), returnFocus: event.currentTarget,
              restoreFocus: () => restoreFocus?.(namespace, "preset"),
              getValue: () => asset[key] ?? "", onApply: apply });
          },
        }),
        el("button", {
          class: "mmc-cast-help", type: "button", text: "?", "data-field": namespace,
          "aria-label": t("About {field}", { field: t(help.title) }),
          onclick: (event) => {
            event.stopPropagation();
            openReferenceFieldHelp(help, event.currentTarget, () => restoreFocus?.(namespace, "help"));
          },
        }),
        el("span", { class: "mmc-cast-field-colon", text: ":", "aria-hidden": true }),
      ]), field,
    ]);
  }));
  // A background refresh can update externally changed notes without replacing
  // the textarea (and its caret, selection or IME composition).
  group.refresh = () => {
    for (const [key, field] of fields) {
      if (document.activeElement !== field && field.value !== (asset[key] ?? "")) field.value = asset[key] ?? "";
      if (group.isConnected) fit(field);
    }
  };
  requestAnimationFrame(() => { if (group.isConnected) group.refresh(); });
  return group;
}
