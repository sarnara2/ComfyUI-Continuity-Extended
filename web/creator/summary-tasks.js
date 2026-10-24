import { el, mountOverlay } from "./dom.js";
import { t } from "./i18n.js";

export const TASKS = ["keyframe completion", "reference generation", "video editing",
  "video continuation", "audio reuse", "audio reference"];
const STORE = "continuity-summary-task-presets-v1";

// These are task roles, not retention states or an inference from file types.
export const TASK_HELP = [
  ["Use an image as an exact video frame", "Start or end with a specified image."],
  ["Generate a new video using reference features", "Use reference images or clips for visual features, setting, style, motion, or camera movement."],
  ["Edit an existing source video", "Change a target element or background in the source video."],
  ["Continue an existing video", "Extend actions or scenes after the source video."],
  ["Reuse all or part of the original audio signal", "Keep original dialogue, music, or sound effects."],
  ["Generate new audio using sound characteristics", "Reference sound, voice, music, or rhythm characteristics."],
];
export const TASK_COMBINATIONS = [
  { name: "Generate a new video from a reference image", tasks: ["reference generation"] },
  { name: "Generate a new audiovisual scene from image and audio references", tasks: ["reference generation", "audio reference"] },
  { name: "Start from an exact frame with additional reference images", tasks: ["keyframe completion", "reference generation"] },
  { name: "Edit a target element and keep the original sound", tasks: ["video editing", "reference generation", "audio reuse"] },
  { name: "Continue a video and specify its final frame", tasks: ["video continuation", "keyframe completion"] },
];

export function splitTasks(text) {
  const tasks = new Set();
  let body = String(text ?? "");
  for (;;) {
    const group = body.match(/^\s*\[([^\]\n]+)\]/);
    if (!group) break;
    const words = group[1].split("+").map((word) => word.trim().toLowerCase());
    // A custom, mixed or Shot prefix is prose we do not own. Never discard it.
    if (words.some((word) => !TASKS.includes(word))) break;
    for (const word of words) tasks.add(word);
    body = body.slice(group[0].length);
    // Consume the conventional one-space separator, not the user's line breaks,
    // indentation or the rest of a quoted/bracketed summary.
    if (body.startsWith(" ")) body = body.slice(1);
  }
  return { tasks: TASKS.filter((task) => tasks.has(task)), body };
}
export function taskSummary(text, tasks) {
  const selected = TASKS.filter((task) => tasks.includes(task));
  const body = splitTasks(text).body;
  if (!selected.length) return body;
  const prefix = `[${selected.join(" + ")}]`;
  return body ? `${prefix}${/^\s/.test(body) ? "" : " "}${body}` : prefix;
}
function saved() {
  try {
    const rows = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(rows) ? rows.filter((row) => typeof row?.name === "string" && row.name.length <= 60
      && Array.isArray(row.tasks) && row.tasks.every((key) => TASKS.includes(key))).slice(0, 8) : [];
  } catch { return []; }
}
function taskModal(title, anchor, content, footer = []) {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true; unmount();
    if (anchor?.isConnected) anchor.focus();
  };
  const closeButton = el("button", { class: "mmc-close", type: "button", text: "✕",
    title: t("Close"), "aria-label": t("Close"), onclick: close });
  const dialog = el("div", { class: "mmc-modal mmc-task-dialog", role: "dialog",
    "aria-modal": true, "aria-label": title,
    onkeydown: (event) => {
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex='0']")]
        .filter((node) => node.getClientRects().length);
      if (!controls.length) return;
      const at = controls.indexOf(document.activeElement);
      if (event.shiftKey && at <= 0) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && (at < 0 || at === controls.length - 1)) {
        event.preventDefault(); controls[0].focus();
      }
    },
  }, [el("div", { class: "mmc-modal-head" }, [
    el("span", { class: "mmc-tab", "aria-selected": true, text: title }), closeButton,
  ]), content, ...(footer.length ? [el("div", { class: "mmc-task-footer" }, footer)] : [])]);
  const overlay = el("div", { class: "mmc-overlay mmc-task-overlay",
    onpointerdown: (event) => { if (event.target === overlay) { event.preventDefault(); close(); } },
  }, [dialog]);
  const unmount = mountOverlay(overlay, close);
  closeButton.focus();
  return close;
}

export function openTaskHelp(anchor) {
  const note = "Choose task types by how each file is used, not just whether it is attached. Retention states such as fully_preserved are separate.";
  const content = el("div", { class: "mmc-task-help-content" }, [
    el("p", { class: "mmc-task-note", text: t(note) }),
    el("table", { class: "mmc-task-help-table" }, [
      el("thead", {}, [el("tr", {}, ["Task tag", "Purpose", "When to use it"].map((heading) => el("th", { text: t(heading) })))]),
      el("tbody", {}, TASKS.map((task, index) => el("tr", {}, [
        el("td", { "data-label": t("Task tag") }, [el("code", { text: task })]),
        el("td", { "data-label": t("Purpose"), text: t(TASK_HELP[index][0]) }),
        el("td", { "data-label": t("When to use it"), text: t(TASK_HELP[index][1]) }),
      ]))),
    ]),
  ]);
  return taskModal(t("Summary task type help"), anchor, content);
}

// Reads the owning summary anew every opening. Saved combinations are reusable
// recipes, never the selected state of this or another segment.
export function openTaskPresets(anchor, read, write, valid = () => true) {
  let tasks = splitTasks(read()).tasks;
  let customs = saved();
  const grid = el("div", { class: "mmc-task-choices" });
  const presets = el("div", { class: "mmc-task-combinations" });
  const customRows = el("div", { class: "mmc-task-saved" });
  const preview = el("code", { class: "mmc-task-preview", role: "status", "aria-live": "polite" });
  const status = el("span", { class: "mmc-task-save-status", role: "status", "aria-live": "polite" });
  const name = el("input", { class: "mmc-shelf-input", placeholder: t("Combination name"),
    "aria-label": t("Combination name"), maxLength: 60 });
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(customs)); } catch { /* session still works */ } };
  const choose = (next) => { tasks = [...next]; render(); };
  const recipe = (row, index) => el("button", { class: "mmc-task-combination", type: "button", "data-combination": index,
    "aria-pressed": String(TASKS.every((task) => tasks.includes(task) === row.tasks.includes(task))),
    onclick: () => choose(row.tasks),
  }, [el("span", { text: t(row.name) }), el("code", { text: `[${row.tasks.join(" + ")}]` })]);
  const render = () => {
    const active = document.activeElement;
    const focusKey = ["data-task", "data-combination", "data-saved"].find((key) => active?.hasAttribute?.(key));
    const focusValue = focusKey && active.getAttribute(focusKey);
    grid.replaceChildren(...TASKS.map((task) => el("button", { class: "mmc-pill", type: "button",
      text: t(task), title: t(TASK_HELP[TASKS.indexOf(task)][0]), "data-task": task,
      "aria-pressed": String(tasks.includes(task)), onclick: () => {
        choose(tasks.includes(task) ? tasks.filter((key) => key !== task) : [...tasks, task]);
      } })));
    presets.replaceChildren(...TASK_COMBINATIONS.map(recipe));
    customRows.replaceChildren(...(customs.length ? customs.map((row) => el("div", { class: "mmc-task-preset-row" }, [
      el("button", { class: "mmc-pill mmc-task-saved-name", type: "button", text: row.name,
        "data-saved": row.name, title: `[${row.tasks.join(" + ")}]`, onclick: () => choose(row.tasks) }),
      el("button", { class: "mmc-pill mmc-task-delete", type: "button", text: "✕", title: t("Delete"),
        "aria-label": `${t("Delete")} ${row.name}`, onclick: () => {
          customs = customs.filter((item) => item !== row); persist(); render();
        } }),
    ])) : [el("span", { class: "mmc-task-note", text: t("No saved combinations yet.") })]));
    preview.textContent = tasks.length ? `[${TASKS.filter((task) => tasks.includes(task)).join(" + ")}]` : t("No task tag");
    if (focusKey) [grid, presets, customRows].flatMap((host) => [...host.querySelectorAll(`[${focusKey}]`)])
      .find((node) => node.getAttribute(focusKey) === focusValue)?.focus();
  };
  const content = el("div", { class: "mmc-task-composer-content" }, [
    el("section", { class: "mmc-task-examples" }, [el("strong", { text: t("Example combinations") }), presets]),
    el("section", { class: "mmc-task-options" }, [
      el("strong", { text: t("Individual task types") }), grid,
      el("div", { class: "mmc-task-preview-group" }, [el("span", { text: t("Current summary prefix") }), preview]),
      el("div", { class: "mmc-task-custom-group" }, [el("strong", { text: t("Saved combinations") }), customRows,
        el("div", { class: "mmc-task-preset-row mmc-task-save-row" }, [name,
          el("button", { class: "mmc-pill", type: "button", text: t("Save combination"), onclick: () => {
            if (!name.value.trim() || !tasks.length) { status.textContent = t("Please enter a name and select at least one task type."); return; }
            customs = [{ name: name.value.trim(), tasks: [...tasks] }, ...customs.filter((row) => row.name !== name.value.trim())].slice(0, 8);
            persist(); name.value = ""; status.textContent = t("Combination saved."); render();
          } }),
        ]), status,
      ]),
    ]),
  ]);
  render();
  const close = taskModal(t("Summary task types"), anchor, content, [
    el("p", { class: "mmc-task-note", text: t("Only this segment’s summary task prefix changes. The summary text and other fields stay unchanged.") }),
    el("button", { class: "mmc-pill", type: "button", text: t("Cancel"), onclick: () => close() }),
    el("button", { class: "mmc-pill active", type: "button", text: t("Apply"), onclick: () => {
      if (valid()) write(taskSummary(read(), tasks)); close();
    } }),
  ]);
  return close;
}
