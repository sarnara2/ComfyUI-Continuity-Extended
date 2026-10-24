"""Cast edits stay with their live owner across detach, recast and reload."""

import domshim
import layout
from harness import check


layout.skip_without_node()

SCRIPT = domshim.DOM + r'''
import { CastShelf } from "./web/creator/cast.js";
import * as S from "./web/creator/state.js";
import { openReferenceFieldHelp } from "./web/creator/reference-fields.js";

globalThis.app = { extensionManager: { setting: { get: () => "en" } } };
Node.prototype.prepend = function(...nodes) {
  for (const node of nodes.reverse()) { node.remove(); this.children.unshift(node); node.parent = this; }
};
const image = (handle, filename = `${handle}.png`) => ({ handle, filename, kind: "image", role: "reference" });
const video = (handle) => ({ handle, filename: `${handle}.mp4`, kind: "video", role: "reference", takes: "edit" });
const initial = () => S.parseTimeline(JSON.stringify({ version: 2, assets: [image("ref-1"), image("ref-2"), video("ref-3"), image("ref-4")],
  subjects: [
    { handle: "subject", from: ["ref-1"], replaces: ["ref-3"], description: "the first performer" },
    { handle: "other", from: ["ref-2"], description: "the second performer", seeded: true,
      features: [{ attr: "clothing", is: "a blue coat", instead: "a red coat" }] },
  ], segments: [{ prompt: "@subject with @other and @ref-1" }, { prompt: "@other waits" }] }));

function host(timeline, addAsset = async () => null, library = null) {
  let writes = 0;
  const shelf = new CastShelf({
    getCast: () => timeline.subjects, setCast: (cast) => { timeline.subjects = cast; },
    getAssets: () => S.castAssets(timeline), addAsset, library,
    whereCited: () => ({ cited: true, text: "in prompt" }), cite() {}, touch() {},
    commit() { writes++; S.syncTimeline(timeline); },
    dropAssets(handles) {
      for (const owner of [timeline, ...timeline.segments]) owner.assets = owner.assets.filter((asset) => !handles.includes(asset.handle));
    },
  });
  document.body.appendChild(shelf.root);
  shelf.render();
  return { shelf, writes: () => writes };
}
const press = (button) => button.listeners.click.forEach((fn) => fn({ target: button, currentTarget: button, stopPropagation() {}, preventDefault() {} }));
const out = {};

{
  const timeline = initial();
  out.defaults = S.subjectFeatures(timeline.subjects[0]).map((feature) => feature.attr);
  out.explicitClothing = S.subjectFeatures(S.parseTimeline(S.serializeTimeline(timeline)).subjects[1]);
  const { shelf } = host(timeline);
  out.destinations = [shelf.descriptionField(timeline.subjects[0]), shelf.usageRulesField(timeline.subjects[0])]
    .map((field) => field.querySelector(".mmc-cast-field-destination").textContent);
  const button = shelf.root.querySelector(".mmc-cast-clear");
  press(button);
  out.firstClear = timeline.subjects.length;
  timeline.subjects[0].description = "changed after arming";
  press(button);
  out.changedClear = timeline.subjects.length;
  press(button);
  for (const fn of button.listeners.focusout ?? []) fn({ relatedTarget: null });
  press(button);
  out.focusClear = timeline.subjects.length;
  press(button);
  const reloaded = S.parseTimeline(S.serializeTimeline(timeline));
  out.cleared = { cast: reloaded.subjects.length, files: S.castAssets(reloaded).map((asset) => asset.handle),
    text: reloaded.segments[0].prompt,
    missing: S.missingPromptHandles([reloaded.segments[0].prompt], S.castAssets(reloaded), reloaded.subjects).sort() };
}

{
  const timeline = initial();
  const pending = [];
  const { shelf } = host(timeline, (_subject, options) => new Promise((resolve) => {
    pending.push((asset) => {
      if (!options.isCurrent()) { resolve(null); return; }
      timeline.assets.push(asset);
      resolve(asset);
    });
  }));
  const subject = timeline.subjects[0];
  const old = shelf.attachReference(subject);
  shelf.clearRole(subject, "ref-1", "from");
  const newer = shelf.attachReference(subject);
  pending[1](image("ref-5", "new-person.png"));
  await newer;
  pending[0](image("ref-6", "old-picker-result.png"));
  await old;
  const reloaded = S.parseTimeline(S.serializeTimeline(timeline));
  out.detachedThenReplaced = { from: reloaded.subjects[0].from,
    oldResultExists: S.castAssets(reloaded).some((asset) => asset.filename === "old-picker-result.png"),
    appearance: S.castAssets(reloaded).find((asset) => asset.handle === reloaded.subjects[0].from[0])?.filename,
    other: reloaded.subjects[1].from,
    locator: S.replacesOf(reloaded.subjects[0]), text: reloaded.segments[0].prompt };
  shelf.remove(subject);
  shelf.addRole(subject, "ref-6", "from");
  out.removedCannotChange = subject.from;
}

{
  const timeline = initial();
  let land;
  const { shelf } = host(timeline, async () => null, () => new Promise((resolve) => { land = resolve; }));
  const departing = timeline.subjects[0];
  const swap = shelf.recast(departing);
  shelf.remove(departing);
  const newcomer = { handle: "subject", from: ["ref-5"], takes: "person", description: "new performer" };
  timeline.assets.push(image("ref-5", "new-person.png"));
  timeline.subjects.push(newcomer);
  land();
  await swap;
  const reloaded = S.parseTimeline(S.serializeTimeline(timeline));
  out.staleRecast = { names: reloaded.subjects.map((member) => member.handle),
    newFrom: reloaded.subjects.find((member) => member.handle === "subject").from,
    oldPicturePresent: S.castAssets(reloaded).some((asset) => asset.handle === "ref-1"),
    locator: S.castAssets(reloaded).some((asset) => asset.handle === "ref-3"),
    other: reloaded.subjects.find((member) => member.handle === "other").from };
  out.reconnected = S.missingPromptHandles([reloaded.segments[0].prompt.replace(" and @ref-1", "")], S.castAssets(reloaded), reloaded.subjects);
}

{
  const frame = globalThis.requestAnimationFrame;
  const rect = Node.prototype.getBoundingClientRect;
  const add = window.addEventListener;
  const remove = window.removeEventListener;
  const resizing = new Set();
  window.addEventListener = (type, listener, ...args) => { if (type === "resize") resizing.add(listener); add(type, listener, ...args); };
  window.removeEventListener = (type, listener, ...args) => { if (type === "resize") resizing.delete(listener); remove(type, listener, ...args); };
  globalThis.requestAnimationFrame = (fn) => fn();
  window.innerHeight = 480;
  Node.prototype.getBoundingClientRect = function() {
    if (!this.classList.contains("mmc-cast-help-dialog")) return rect.call(this);
    const rows = this.querySelector("tbody").children.length;
    const paged = !this.querySelector(".mmc-cast-help-pages").hidden;
    return { height: 170 + Math.ceil(rows / 2) * 100 + (paged ? 50 : 0) };
  };
  const returnFocus = document.createElement("button");
  document.body.appendChild(returnFocus);
  openReferenceFieldHelp({ title: "Reference usage rules", section: "retention_analysis", note: "What the result retains.",
    examples: Array.from({ length: 10 }, (_, index) => [`example ${index + 1}`, `meaning ${index + 1}`]) }, returnFocus);
  const dialog = document.body.querySelector(".mmc-cast-help-dialog");
  const pages = dialog.querySelector(".mmc-cast-help-pages");
  out.helpFirst = { shown: dialog.querySelector("tbody").children.length, paged: !pages.hidden,
    fits: dialog.getBoundingClientRect().height <= window.innerHeight - 48 };
  const seen = new Set(dialog.querySelector("tbody").children.map((row) => row.children[0].textContent));
  while (!pages.children[2].disabled) {
    press(pages.children[2]);
    dialog.querySelector("tbody").children.forEach((row) => seen.add(row.children[0].textContent));
  }
  out.helpAllReachable = seen.size;
  window.innerHeight = 1080;
  resizing.forEach((listener) => listener());
  out.helpLarge = { shown: dialog.querySelector("tbody").children.length, paged: !pages.hidden };
  press(dialog.querySelector(".mmc-close"));
  out.helpClosed = { open: Boolean(document.body.querySelector(".mmc-cast-help-dialog")),
    focused: document.activeElement === returnFocus, resizing: resizing.size };
  globalThis.requestAnimationFrame = frame;
  Node.prototype.getBoundingClientRect = rect;
  window.addEventListener = add;
  window.removeEventListener = remove;
}
console.log(JSON.stringify(out));
'''

with layout.pack(skip=("atlas",)) as target:
    got = layout.in_pack(SCRIPT, target)

check("new person defaults contain identity features without wardrobe", got["defaults"], ["face", "hair", "build"])
check("explicit saved clothing changes survive reload", got["explicitClothing"],
      [{"attr": "clothing", "is": "a blue coat", "instead": "a red coat"}])
check("cast fields expose their distinct prompt destinations", got["destinations"],
      ["Who or what this is → subject_definitions", "What to keep, change or borrow → retention_analysis"])
check("first clear only arms", got["firstClear"], 2)
check("changing a cast value cancels pending clear", got["changedClear"], 2)
check("leaving clear focus cancels pending clear", got["focusClear"], 2)
check("confirmed clear removes owned files, preserves source footage and prompt tags", got["cleared"],
      {"cast": 0, "files": ["ref-3", "ref-4"], "text": "@subject with @other and @ref-1",
       "missing": ["other", "ref-1", "subject"]})
check("late picker cannot replace new appearance or restore old reference after reload", got["detachedThenReplaced"],
      {"from": ["ref-5"], "oldResultExists": False, "appearance": "new-person.png", "other": ["ref-2"],
       "locator": ["ref-3"], "text": "@subject with @other and @ref-1"})
check("removed member ignores a stale role callback", got["removedCannotChange"], ["ref-5"])
check("late recast preserves the replacement and other cast without restoring departure", got["staleRecast"],
      {"names": ["other", "subject"], "newFrom": ["ref-5"], "oldPicturePresent": False, "locator": True, "other": ["ref-2"]})
check("same handle with a live reference clears the missing connection", got["reconnected"], [])
check("small help viewport fits visible examples without a scroller", got["helpFirst"], {"shown": 4, "paged": True, "fits": True})
check("help paging keeps every example reachable", got["helpAllReachable"], 10)
check("larger help viewport shows every example together", got["helpLarge"], {"shown": 10, "paged": False})
check("help close restores focus and removes resize work", got["helpClosed"], {"open": False, "focused": True, "resizing": 0})
