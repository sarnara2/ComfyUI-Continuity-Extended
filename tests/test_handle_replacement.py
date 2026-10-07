"""Real PromptBox replacement paths over the shared DOM shim, without sampling."""

import layout
from domshim import DOM
from harness import check, passed

layout.skip_without_node()

SCRIPT = r'''
const { PromptBox, replacePromptHandle } = await import("./web/creator/prompt.js");
const results = {};
const asset = (handle, kind = "image") => ({ handle, kind, role: "reference", filename: `${handle}.png` });
const fire = (node, name, extra = {}) => {
  const event = { target: node, preventDefault() {}, stopPropagation() {}, ...extra };
  for (const fn of node.listeners[name] ?? []) fn(event);
};
function host(text, { cast = [], pool = [], screens = [], enabled = true } = {}) {
  const state = { assets: [asset("ref-1"), asset("ref-11"), asset("vid-2", "video"),
    asset("aud-2", "audio"), asset("img-2")], prompt: text };
  const changes = { input: [], cited: [], uncited: [], opened: [] };
  const box = new PromptBox({
    getState: () => state, getPool: () => pool, getCast: () => cast, getScreens: () => screens,
    onAttach() {}, attachBlocked: () => null, replaceHandles: enabled,
    onInput: (value) => { state.prompt = value; changes.input.push(value); },
    onCited: (handles) => changes.cited.push(...handles),
    onUncited: (handles) => changes.uncited.push(...handles),
    onCastChip: (handle) => changes.opened.push(handle),
  });
  document.body.appendChild(box.root);
  box.setValue(text);
  // The shim has no caret geometry; replacement itself is still the real path.
  box.placeCaret = () => box.root.focus();
  return { box, state, changes };
}
function open(box, handle, index = 0) {
  const chips = box.root.querySelectorAll("[data-handle]").filter(n => n.dataset.handle === handle);
  fire(box.root, "click", { target: chips[index] });
}
function type(box, text) {
  box.replacing.field.value = text;
  fire(box.replacing.field, "input");
}
const pool = [asset("ref-3"), asset("vid-3", "video"), asset("aud-3", "audio"), asset("img-3")];
const cast = [{ handle: "lead", description: "Lead performer" }, { handle: "lead_2" }, { handle: "lead_3" }];

{
  const { box, state, changes } = host("@ref-1, @ref-1:start, @ref-11 and @ref-1.", { pool });
  open(box, "ref-1", 1);
  type(box, "ref-3");
  box.applyReplacement();
  results.single = { prompt: state.prompt, cited: changes.cited, uncited: changes.uncited };
}
{
  const { box, state, changes } = host("@ref-1, @ref-1:style, @ref-11 and @ref-1.", { pool });
  open(box, "ref-1");
  type(box, "ref-3");
  fire(box.replacing.every, "click");
  const count = box.replacing.apply.textContent;
  box.applyReplacement();
  results.bulk = { prompt: state.prompt, count, cited: changes.cited, uncited: changes.uncited };
}
{
  const { box, state } = host("@lead speaks to @lead_2. @lead waits.", { cast, pool });
  open(box, "lead");
  results.castOptions = box.flat.map(o => o.handle);
  type(box, "3");
  fire(box.replacing.every, "click");
  box.applyReplacement();
  results.castBulk = state.prompt;
}
for (const [from, to] of [["vid-2", "vid-3"], ["aud-2", "aud-3"], ["img-2", "img-3"]]) {
  const { box, state } = host(`Use @${from} now.`, { pool });
  open(box, from);
  const index = box.flat.findIndex(o => o.handle === to);
  await box.choose(index);
  box.applyReplacement();
  results[from] = state.prompt;
}
{
  const screens = [{ handle: "phone-1", label: "Phone", file: "screen.png" },
    { handle: "laptop-1", label: "Laptop", file: "screen2.png" }];
  const { box, state } = host("Look at @phone-1, then @phone-1.", { pool, screens });
  open(box, "phone-1");
  results.screenOptions = box.flat.map(o => o.handle);
  type(box, "laptop-1");
  box.applyReplacement();
  results.screen = state.prompt;
}
{
  const { box, state, changes } = host("@ref-1 waits.", { pool });
  open(box, "ref-1");
  type(box, "missing-99");
  box.applyReplacement();
  results.invalid = { prompt: state.prompt, changes: changes.input.length, disabled: box.replacing.apply.disabled };
  box.closeMenu();
  results.cancel = state.prompt;
}
{
  const { box, state } = host("@ref-1 waits.", { pool });
  open(box, "ref-1");
  type(box, "ref-3");
  box.setValue("A newer edit @ref-1.");
  box.applyReplacement();
  results.stale = { prompt: box.getValue(), saved: state.prompt, message: box.replacing.note.textContent };
}
{
  const { box, state, changes } = host("@lead waits.", { cast });
  open(box, "lead");
  const edit = box.menu.querySelector(".mmc-handle-edit");
  fire(edit, "click");
  results.editCast = { prompt: state.prompt, opened: changes.opened, menu: box.menu };
}
{
  const { box, changes } = host("@lead waits.", { cast, enabled: false });
  open(box, "lead");
  results.legacyClick = { opened: changes.opened, menu: box.menu };
}
{
  const { box } = host("@ref-1:start then @ref-1.", { pool });
  const wrapper = document.createElement("div");
  const chip = box.chip("ref-1");
  wrapper.appendChild(chip);
  box.root.appendChild(wrapper);
  results.wrappedOffset = box.handleOffset(chip);
}
results.prefixGuard = replacePromptHandle("@ref-1 @ref-11 @ref-1x @ref-1_other @ref-1-more", "ref-1", "ref-3", 0, true);
results.badOffset = replacePromptHandle("before @ref-1", "ref-1", "ref-3", 0);
{
  const { box, state } = host("@ref-1 waits.", { pool });
  open(box, "ref-1");
  type(box, "3");
  box.applyReplacement();
  results.numberedRef = state.prompt;
}
console.log(JSON.stringify(results));
'''

with layout.pack(skip=["atlas"]) as target:
    got = layout.in_pack(DOM + SCRIPT, target)

check("single replaces only clicked citation, preserving scope", got["single"], {
    "prompt": "@ref-1, @ref-3:start, @ref-11 and @ref-1.", "cited": ["ref-3"], "uncited": [],
})
check("bulk replaces exact matches only and notifies normal citation hooks", got["bulk"], {
    "prompt": "@ref-3, @ref-3:style, @ref-11 and @ref-3.", "count": "Replace 3 matches",
    "cited": ["ref-3"], "uncited": ["ref-1"],
})
check("cast replacement lists cast, not references", got["castOptions"], ["lead", "lead_2", "lead_3"])
check("number input resolves an available arbitrary cast handle", got["castBulk"], "@lead_3 speaks to @lead_2. @lead_3 waits.")
for old, new in (("vid-2", "vid-3"), ("aud-2", "aud-3"), ("img-2", "img-3")):
    check(f"list selection supports {old}", got[old], f"Use @{new} now.")
check("screen choices remain screens", got["screenOptions"], ["phone-1", "laptop-1"])
check("screen single replacement", got["screen"], "Look at @laptop-1, then @phone-1.")
check("missing handles cannot be applied", got["invalid"], {"prompt": "@ref-1 waits.", "changes": 0, "disabled": True})
check("cancel leaves prompt unchanged", got["cancel"], "@ref-1 waits.")
check("stale text is not overwritten", got["stale"]["prompt"], "A newer edit @ref-1.")
check("old cast-editor shortcut remains available", got["editCast"], {"prompt": "@lead waits.", "opened": ["lead"], "menu": None})
check("non-enabled prompt boxes keep existing click behavior", got["legacyClick"], {"opened": ["lead"], "menu": None})
check("offset includes scoped references and browser block break", got["wrappedOffset"], len("@ref-1:start then @ref-1.\n"))
check("whole-token safeguards", got["prefixGuard"], "@ref-3 @ref-11 @ref-1x @ref-1_other @ref-1-more")
check("wrong offset is a no-op", got["badOffset"], "before @ref-1")
check("number input prefers the clicked reference numbering family", got["numberedRef"], "@ref-3 waits.")
passed("prompt handle replacement")
