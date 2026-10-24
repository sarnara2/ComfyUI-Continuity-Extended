"""The representative is the first appearance reference, never a duplicate tile.

Runs the real CastShelf, state serializer and existing role menu in an offline
DOM shim. No server, media writes, model loads or generation jobs.
"""

import layout
from domshim import DOM
from harness import check

layout.skip_without_node()

SCRIPT = DOM + r'''
import * as S from "./web/creator/state.js";
import { CastShelf } from "./web/creator/cast.js";
globalThis.app = { extensionManager: { setting: { get: () => "en" } } };
Node.prototype.prepend = function(...nodes) {
  for (const node of nodes.reverse()) { node.remove(); this.children.unshift(node); node.parent = this; }
};
const piece = S.parseTimeline(JSON.stringify({ version: 2, family: "h3", prompt: "@subject @other",
  assets: [
    { handle: "ref-1", filename: "first.png", kind: "image", role: "reference", ref_size: "max" },
    { handle: "ref-2", filename: "second.png", kind: "image", role: "reference", ref_size: "match" },
    { handle: "ref-3", filename: "motion.mp4", kind: "video", role: "reference", ref_size: "match" },
    { handle: "ref-4", filename: "voice.wav", kind: "audio", role: "reference" },
    { handle: "ref-5", filename: "refmod:identity", kind: "image", role: "reference" },
    { handle: "ref-6", filename: "encoded.png", kind: "image", role: "reference", mods: { h3_video: "refmod:identity" } },
  ],
  subjects: [
    { handle: "subject", from: ["ref-1"], description: "Primary actor" },
    { handle: "other", from: ["ref-2", "ref-1"], motion: ["ref-3"], voice: "ref-4" },
  ], segments: [{ prompt: "@subject and @other", duration_s: 3, assets: [] },
    { prompt: "@subject continues", duration_s: 3, assets: [] }] }));
let saved = "", commits = 0;
const shelf = new CastShelf({ getCast: () => piece.subjects,
  setCast: value => { piece.subjects = value; }, getAssets: () => S.castAssets(piece),
  whereCited: () => ({ cited: true, text: "in prompt" }),
  commit: () => { commits++; saved = S.serializeTimeline(piece); } });
// RefMod token inventory is unrelated to these controls; the stub server has
// no model inventory and cannot finish the normal asynchronous cost lookup.
shelf.costMark = () => [];
document.body.append(shelf.root);
const open = subject => { shelf.opened = subject; shelf.render(); };
const button = () => shelf.root.querySelector(".mmc-cast-primary-size");
const face = () => shelf.root.querySelector(".mmc-cast-top").querySelector(".mmc-cast-face");
const strip = () => shelf.root.querySelector(".mmc-cast-refs");
const press = target => {
  for (const listener of target.listeners.click ?? []) listener({ target, currentTarget: target,
    stopPropagation() {}, preventDefault() {} });
};
const subject = piece.subjects[0], other = piece.subjects[1];
const assets = S.castAssets(piece), first = assets.find(a => a.handle === "ref-1");
const before = JSON.stringify({ from: subject.from, other, prompt: piece.segments[0].prompt });
const out = { toggles: [] };
open(subject);
out.single = { primary: shelf.primaryReference(subject)?.handle,
  lower: strip().querySelectorAll(".mmc-cast-ref").length, add: strip().querySelectorAll(".mmc-cast-add").length,
  noFalseEmpty: !strip().querySelector(".mmc-cast-refs-none"),
  badge: face().querySelector(".mmc-cast-size")?.textContent,
  minis: shelf.miniRefs(subject).querySelectorAll(".mmc-cast-mini").length };
for (let i = 0; i < 3; i++) {
  press(button());
  const restored = S.parseTimeline(saved);
  out.toggles.push({ label: button().textContent, badge: face().querySelector(".mmc-cast-size")?.textContent,
    stored: S.refSize(S.castAssets(restored).find(a => a.handle === "ref-1")),
    current: S.refSize(first), unrelated: S.refSize(assets.find(a => a.handle === "ref-2")) });
}
out.isolated = before === JSON.stringify({ from: subject.from, other, prompt: piece.segments[0].prompt });
open(other);
out.multiple = { primary: shelf.primaryReference(other)?.handle,
  lower: strip().querySelectorAll(".mmc-cast-ref").map(tile => tile.querySelector(".mmc-cast-ref-thumb")?.attrs.src
    ?? tile.querySelector(".mmc-cast-ref-thumb")?.tagName),
  minis: shelf.miniRefs(other).querySelectorAll(".mmc-cast-mini").length,
  claims: S.subjectFiles(other), voice: other.voice };
const captures = [];
const existingPickRole = shelf.pickRole;
shelf.pickRole = (anchor, who, handle, role) => captures.push({ who: who.handle, handle, role });
const primaryFace = face();
for (const listener of primaryFace.listeners.keydown ?? []) listener({ key: "Enter", repeat: false,
  stopPropagation() {}, preventDefault() {} });
shelf.pickRole = existingPickRole;
out.primaryMenuGesture = captures;
shelf.pickRole(primaryFace, other, "ref-2", "from");
const menu = document.body.querySelector(".mmc-cast-menu");
const detach = menu?.querySelectorAll("button").find(node =>
  node.querySelector(".mmc-cast-menu-text")?.children[0]?.textContent === "Take it off @other");
out.primaryMenu = { opens: Boolean(menu), detach: Boolean(detach),
  sizeChoices: menu?.querySelectorAll(".mmc-cast-size-pill").map(node => node.textContent) };
if (detach) press(detach);
out.promoted = { primary: shelf.primaryReference(other)?.handle,
  from: [...other.from], lower: strip().querySelectorAll(".mmc-cast-ref").length,
  label: button()?.textContent, badge: face().querySelector(".mmc-cast-size")?.textContent,
  originalFileKept: assets.some(a => a.handle === "ref-2") };
// Retained menus/settings still carry note, wake and muted information when
// there is no duplicate tile left to display it.
first.enabled = false; subject.notes = { "ref-1": "identity note" };
subject.triggers = { "ref-1": "walking" }; open(subject);
out.primaryMarks = { off: face().classList.contains("off"), mute: Boolean(face().querySelector(".mmc-cast-muted")),
  wake: Boolean(face().querySelector(".mmc-cast-noted")?.classList.contains("wake")),
  note: face().title.includes("identity note"), words: face().title.includes("walking") };
const stale = button(); subject.from = ["ref-2"]; press(stale);
out.stale = S.refSize(assets.find(a => a.handle === "ref-2"));
out.special = [];
for (const [name, from] of [["missing", ["ref-gone"]], ["words", []],
  ["mod", ["ref-5"]], ["rendition", ["ref-6"]], ["audio", ["ref-4"]]]) {
  const special = { handle: name, from }; piece.subjects.push(special); open(special);
  out.special.push({ name, hasToggle: Boolean(button()), badge: face().querySelector(".mmc-cast-size")?.textContent ?? "",
    missingTiles: strip().querySelectorAll(".mmc-cast-ref").length });
}
const video = { handle: "video_first", from: ["ref-3", "ref-2"], voice: "ref-4" };
piece.subjects.push(video); open(video);
out.video = { primary: shelf.primaryReference(video)?.handle,
  before: button()?.textContent, lower: strip().querySelectorAll(".mmc-cast-ref").length };
press(button()); out.video.after = button()?.textContent;
out.video.imageUnchanged = S.refSize(assets.find(a => a.handle === "ref-2"));
out.commits = commits;
console.log(JSON.stringify(out));
'''

with layout.pack(skip=["atlas"]) as target:
    got = layout.in_pack(SCRIPT, target)

check("one appearance has one representative and an empty supplementary row with +", got["single"],
      {"primary": "ref-1", "lower": 0, "add": 1, "noFalseEmpty": True, "badge": "max", "minis": 0})
for index, item in enumerate(got["toggles"]):
    value = ["match", "max", "match"][index]
    check(f"primary toggle {index+1} updates live, badge and serialized state immediately", item,
          {"label": value, "badge": value, "stored": value, "current": value, "unrelated": "match"})
check("primary size changes leave membership, prose and other cast unchanged", got["isolated"], True)
check("supplementary appearances, motion and voice are not removed", len(got["multiple"]["lower"]), 3)
check("collapsed strip does not repeat primary", got["multiple"]["minis"], 3)
check("real attachment list still includes representative", got["multiple"]["claims"], ["ref-2", "ref-1", "ref-3", "ref-4"])
check("representative Enter retains the original full role menu", got["primaryMenuGesture"],
      [{"who": "other", "handle": "ref-2", "role": "from"}])
check("representative menu keeps detach and size choices", got["primaryMenu"],
      {"opens": True, "detach": True, "sizeChoices": ["match", "max"]})
check("detaching primary promotes the next reference without deleting media", got["promoted"],
      {"primary": "ref-1", "from": ["ref-1"], "lower": 2, "label": "match", "badge": "match", "originalFileKept": True})
check("representative preserves muted/note/wake indicators", got["primaryMarks"],
      {"off": True, "mute": True, "wake": True, "note": True, "words": True})
check("a stale button cannot toggle a newly attached representative", got["stale"], "match")
check("missing, text-only, encoded and unsupported sources have no misleading size toggle", got["special"],
      [{"name": "missing", "hasToggle": False, "badge": "", "missingTiles": 1},
       {"name": "words", "hasToggle": False, "badge": "", "missingTiles": 0},
       {"name": "mod", "hasToggle": False, "badge": "mod", "missingTiles": 0},
       {"name": "rendition", "hasToggle": False, "badge": "mod", "missingTiles": 0},
       {"name": "audio", "hasToggle": False, "badge": "", "missingTiles": 1}])
check("first video keeps ordered representative and does not change following image", got["video"],
      {"primary": "ref-3", "before": "match", "lower": 2, "after": "max", "imageUnchanged": "match"})
check("only explicit size/detach gestures commit", got["commits"], 5)
