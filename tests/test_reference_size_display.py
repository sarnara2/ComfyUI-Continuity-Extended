"""Focused reference pills and expanded-card ordering, over real UI modules.

Offline DOM shim only: no browser, ComfyUI server, files, models or render jobs.
"""

import layout
from domshim import DOM
from harness import check

layout.skip_without_node()

SCRIPT = DOM + r'''
import * as S from "./web/creator/state.js";
import { openTimeline } from "./web/creator/timeline.js";
import { CreatorEditor } from "./web/creator/editor.js";
import { CastShelf } from "./web/creator/cast.js";
import { castFamilies } from "./web/creator/refmod.js";

globalThis.app = { extensionManager: { setting: { get: () => "en" } } };
Node.prototype.prepend = function(...nodes) {
  for (const node of nodes.reverse()) { node.remove(); this.children.unshift(node); node.parent = this; }
};
const press = (button) => {
  button.focus();
  for (const fn of button.listeners.click ?? []) fn({ target: button, currentTarget: button,
    stopPropagation() {}, preventDefault() {} });
};
const picture = { handle: "ref-1", filename: "portrait.png", kind: "image", role: "reference",
  ref_size: "max", description: "A reference description.", usage_rules: "Keep identity." };
const motion = { handle: "ref-2", filename: "motion.mp4", kind: "video", role: "reference",
  track: "picture", ref_size: "match", trim: [0, 1] };
const source = { handle: "ref-3", filename: "source.mp4", kind: "video", role: "reference", takes: "edit" };
const raw = { version: 2, family: "h3", prompt: "@subject with @ref-1 and @ref-2", assets: [picture, motion, source],
  subjects: [{ handle: "subject", takes: "person", from: ["ref-1"], motion: ["ref-2"], replaces: ["ref-3"],
    description: "The performer.", usage_rules: "Keep the face.", replaces_what: "The central performer." }],
  segments: [{ prompt: "@subject waits.", duration_s: 3, assets: [], loras: [] },
    { prompt: "@subject turns.", duration_s: 3, assets: [], loras: [] }] };
const piece = S.parseTimeline(JSON.stringify(raw));
let widget = "", writes = 0;
openTimeline({ timeline: piece, onCommit: () => { writes++; widget = S.serializeTimeline(piece); } });
const modal = document.body.lastChild;
const out = { toggles: [] };
for (const handle of ["ref-1", "ref-2"]) {
  const row = modal.querySelectorAll(".mmc-piece-reference-row").find(row => row.dataset.referenceHandle === handle);
  const asset = piece.assets.find(asset => asset.handle === handle);
  const button = row.referenceHeader.querySelectorAll("button").find(button => button.textContent === S.refSize(asset));
  const fields = row.referenceFields.querySelectorAll("textarea");
  const beforeFields = fields.map(field => field.value);
  const header = row.referenceHeader.firstChild;
  for (let click = 0; click < 3; click++) {
    press(button);
    const stored = S.parseTimeline(widget);
    out.toggles.push({ handle, size: S.refSize(asset), label: button.textContent,
      saved: S.refSize(stored.assets.find(asset => asset.handle === handle)),
      mirrored: S.refSize(piece.segments[0].pool.find(asset => asset.handle === handle)),
      focused: document.activeElement === button, sameHeader: row.referenceHeader.firstChild === header,
      sameFields: row.referenceFields.querySelectorAll("textarea").every((field, index) => field === fields[index]),
      fields: fields.map(field => field.value), beforeFields });
  }
}
out.writes = writes;

const editorState = S.parseState(JSON.stringify({ prompt: "A standalone shot.", assets: [], loras: [] }));
const bare = new CreatorEditor({ state: editorState });
const structured = new CreatorEditor({ state: piece.segments[0], piece, castPiece: piece,
  structuredPrompt: true, onCommit() {} });
for (const [name, editor] of [["bare", bare], ["structured", structured]]) {
  const children = editor.root.children;
  out[name] = { loras: children.indexOf(editor.loraHost),
    references: children.indexOf(editor.assetsSection?.root ?? editor.assetsHost),
    cast: children.indexOf(editor.castHost), loraHosts: children.filter(node => node === editor.loraHost).length };
}

const shelf = new CastShelf({ getCast: () => piece.subjects, setCast: value => { piece.subjects = value; },
  getAssets: () => S.castAssets(piece), whereCited: () => ({ cited: true, text: "in prompt" }), commit() {},
  families: () => castFamilies("h3", "").filter(family => family.id === "h3") });
const subject = piece.subjects[0];
shelf.opened = subject; document.body.append(shelf.root); shelf.render();
const card = shelf.root.querySelector(".mmc-cast-card"), ident = card.querySelector(".mmc-cast-ident");
const refs = card.querySelector(".mmc-cast-refs"), group = card.querySelector(".mmc-cast-reference-group");
const replacement = card.querySelector(".mmc-cast-replacement-group"), family = card.querySelector(".mmc-wears");
out.cast = { refsInsideIdentity: refs.parent === ident,
  beforeFields: refs.parent === ident && ident.children.indexOf(refs) < ident.children.indexOf(group),
  beforeReplacement: refs.parent === ident && ident.children.indexOf(refs) < ident.children.indexOf(replacement),
  familyAfterFields: card.children.indexOf(family) > card.children.indexOf(card.querySelector(".mmc-cast-top")),
  familyTabs: family.querySelectorAll(".mmc-wears-tab").length,
  strips: card.querySelectorAll(".mmc-cast-refs").length, tiles: refs.querySelectorAll(".mmc-cast-ref").length,
  add: refs.querySelectorAll(".mmc-cast-add").length,
  description: group.querySelector("textarea")?.value, rules: group.querySelectorAll("textarea")[1]?.value,
  target: replacement.querySelector(".mmc-cast-replaces")?.value, claims: S.subjectFiles(subject),
  locator: S.replacesOf(subject), prompt: piece.segments[0].prompt };
bare.destroy(); structured.destroy();
console.log(JSON.stringify(out));
'''

with layout.pack(skip=["atlas"]) as target:
    result = layout.in_pack(SCRIPT, target)

for index, item in enumerate(result["toggles"]):
    expected = (["match", "max", "match"] if item["handle"] == "ref-1" else ["max", "match", "max"])[index % 3]
    check(f"{item['handle']} click {index % 3 + 1} keeps visible, model and saved sizes equal",
          [item["size"], item["label"], item["saved"], item["mirrored"]], [expected] * 4)
    check(f"{item['handle']} retains its focused header and bound fields",
          [item["focused"], item["sameHeader"], item["sameFields"], item["fields"] == item["beforeFields"]], [True] * 4)
check("each reference press commits immediately", result["writes"], 6)
check("segment LoRA controls precede references", result["structured"]["loras"] < result["structured"]["references"], True)
check("normal node-face LoRA order is unchanged", result["bare"]["loras"] > result["bare"]["cast"], True)
check("LoRA host is mounted exactly once in either mode", [result[name]["loraHosts"] for name in ["bare", "structured"]], [1, 1])
check("expanded cast thumbnails precede the bound description fields", result["cast"],
      {"refsInsideIdentity": True, "beforeFields": True, "beforeReplacement": True, "familyAfterFields": True,
       "familyTabs": 1, "strips": 1, "tiles": 1, "add": 1,
       "description": "The performer.", "rules": "Keep the face.", "target": "The central performer.",
       "claims": ["ref-1", "ref-2"], "locator": ["ref-3"], "prompt": "@subject waits."})
