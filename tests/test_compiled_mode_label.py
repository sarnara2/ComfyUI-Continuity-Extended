"""Compiled-prompt status distinguishes workflow mode from pass count.

Actual frontend modules with an offline response stub, not a browser/render test.
"""

import layout
from domshim import DOM
from harness import check

layout.skip_without_node()

SCRIPT = DOM + r'''
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import * as S from "./web/creator/state.js";
import { api } from "../scripts/api.js";
globalThis.app = { extensionManager: { setting: { get: () => "en" } } };

// Expose the real private hook without changing its imports or implementation.
const timelineURL = pathToFileURL(path.join(process.cwd(), "web/creator/timeline.js"));
const moduleSource = readFileSync(timelineURL, "utf8")
  .replace("async function compiledFor(", "export async function compiledFor(")
  .replace(/from "(\.[^"]+)"/g, (_, spec) => `from "${new URL(spec, timelineURL).href}"`);
const { compiledFor } = await import("data:text/javascript;base64," + Buffer.from(moduleSource).toString("base64"));
const fetchApi = api.fetchApi;
let replies = [], sent = [];
api.fetchApi = async (url, options) => {
  if (url !== "/continuity/compiled_prompt") return fetchApi(url, options);
  sent.push(JSON.parse(options.body));
  const reply = replies.length > 1 ? replies.shift() : replies[0];
  return { ok: true, status: 200, json: async () => reply };
};
let cardNumber = 0;
const segment = (extra = {}) => ({ card_id: `test-card-${++cardNumber}`,
  prompt: "A person walks.", duration_s: 3, ...extra });
const timeline = (render, segments) => S.parseTimeline(JSON.stringify({ version: 2,
  family: "h3", render, segments }));
const pass = (extra = {}) => ({ prompt: "summary: A person walks.", base_prompt: "summary: A person walks.",
  mode: "REF2VA", tags: [{ label: "<Subject 1>", handle: "subject" }],
  prompt_binding: { references: ["portrait.png"] }, loras: [{ name: "test.safetensors", strength: 0.7 }], ...extra });
const answer = (cards, passes) => ({ cards, passes });
const out = {};
async function inspect(name, piece, reply, card = 0) {
  replies = [reply]; sent = [];
  const before = S.serializeTimeline(piece);
  const got = await compiledFor(piece, card, 123);
  out[name] = { note: got.note, text: got.text, unchanged: before === S.serializeTimeline(piece),
    modeSent: sent[0].creator_data.render, seed: sent[0].seed, scope: got.scope };
  return got;
}

await inspect("chainOne", timeline("chained", [segment()]), answer({ 0: 0 }, [pass()]));
await inspect("singleOne", timeline("single", [segment()]), answer({ 0: 0 }, [pass()]));
await inspect("chainMany", timeline("chained", [segment(), segment(), segment()]),
  answer({ 0: 0, 1: 1, 2: 2 }, [pass(), pass({ mode: "I2VA" }), pass()]), 1);
await inspect("singleMerged", timeline("single", [segment(), segment(), segment()]),
  answer({ 0: 0, 1: 0, 2: 0 }, [pass()]), 2);
await inspect("mixed", timeline("chained", [segment(), segment({ merge: true }), segment()]),
  answer({ 0: 0, 1: 0, 2: 1 }, [pass(), pass()]), 1);
const withClip = timeline("chained", [segment(), { kind: "clip", filename: "source.mp4", duration_s: 2 }, segment()]);
await inspect("chainWithClip", withClip,
  answer({ 0: 0, 1: 1, 2: 2 }, [pass(), { clip: true }, pass()]), 2);
const clip = await inspect("clip", withClip,
  answer({ 0: 0, 1: 1, 2: 2 }, [pass(), { clip: true }, pass()]), 1);
out.clipMessage = Boolean(clip.message) && !clip.override;

const owner = timeline("chained", [segment(), segment()]);
let changed = 0;
replies = [answer({ 0: 0, 1: 1 }, [pass(), pass({ warnings: ["External warning stays unchanged."] })])];
const initial = await compiledFor(owner, 1, 456, () => changed++);
out.payloads = { text: initial.text, tags: initial.tags, loras: initial.loras,
  warnings: initial.warnings, bindingAvailable: Boolean(initial.override) };
initial.override.set(true, "Temporary hand edit.");
replies = [answer({ 0: 0, 1: 1 }, [pass(), pass({ prompt: "Temporary hand edit.", overridden: true })])];
const edited = await compiledFor(owner, 1, 456, () => changed++);
const written = JSON.parse(S.serializeTimeline(owner));
out.draft = { note: edited.note, text: edited.text, changes: changed,
  cards: written.prompt_overrides[0].cards,
  originalCards: owner.segments.map(item => item.prompt),
  binding: written.prompt_overrides[0].binding };

// Existing stale-binding recovery must still clear the session override and
// retry on the original source, without changing workflow mode or source prose.
replies = [{ problem: "final-prompt draft reference binding changed", passes: [] },
  answer({ 0: 0, 1: 1 }, [pass(), pass()])];
sent = [];
const recovered = await compiledFor(owner, 1, 456, () => changed++);
out.recovered = { note: recovered.note, text: recovered.text, calls: sent.length,
  overrideFirst: Boolean(sent[0].creator_data.prompt_overrides),
  overrideRetry: Boolean(sent[1].creator_data.prompt_overrides),
  warning: recovered.warnings[0], render: JSON.parse(S.serializeTimeline(owner)).render,
  originalCards: owner.segments.map(item => item.prompt) };
console.log(JSON.stringify(out));
'''

with layout.pack(skip=("atlas",)) as target:
    got = layout.in_pack(SCRIPT, target)

for name, label in {
    "chainOne": "chained · pass 1 of 1 · REF2VA",
    "singleOne": "one pass · REF2VA",
    "chainMany": "chained · pass 2 of 3 · I2VA",
    "singleMerged": "one pass · 3 shots merged · REF2VA",
    "mixed": "Mixed · pass 1 of 2 · 2 shots merged · REF2VA",
    "chainWithClip": "chained · pass 3 of 3 · REF2VA",
    "clip": "supplied footage",
}.items():
    check(f"{name} shows selected workflow and actual pass", got[name]["note"], label)
    check(f"{name} does not rewrite source or render mode", got[name]["unchanged"], True)
    check(f"{name} forwards the requested seed", got[name]["seed"], 123)

check("chain and single requests remain distinct", [got[name]["modeSent"] for name in ["chainOne", "singleOne"]],
      ["chained", "single"])
check("unmerged force edit remains segment-scoped", got["chainOne"]["scope"],
      "Force edit affects only this segment's generation.")
check("merged force edit remains pass-scoped", got["mixed"]["scope"],
      "Force edit affects this entire merged pass (2 segments).")
check("attached clip still has no generated prompt or override", got["clipMessage"], True)
check("compiler text, tags, LoRAs and warning payloads remain intact", got["payloads"], {
    "text": "summary: A person walks.", "tags": [{"label": "<Subject 1>", "handle": "subject"}],
    "loras": [{"name": "test.safetensors", "strength": 0.7}],
    "warnings": ["External warning stays unchanged."], "bindingAvailable": True,
})
check("manual draft keeps truthful chain label", [got["draft"]["note"], got["draft"]["text"]],
      ["chained · pass 2 of 2 · REF2VA · replaced by hand", "Temporary hand edit."])
check("draft stays on the selected card only", len(got["draft"]["cards"]), 1)
check("draft preserves original segment prose and binding", [got["draft"]["originalCards"], got["draft"]["binding"]],
      [["A person walks.", "A person walks."], {"references": ["portrait.png"]}])
check("stale draft retries without its override", [got["recovered"]["calls"], got["recovered"]["overrideFirst"],
      got["recovered"]["overrideRetry"]], [2, True, False])
check("stale draft recovery retains chain mode and source", [got["recovered"]["note"], got["recovered"]["render"],
      got["recovered"]["originalCards"]], ["chained · pass 2 of 2 · REF2VA", "chained", ["A person walks."] * 2])
check("stale draft warning is retained", got["recovered"]["warning"].startswith("The final-prompt draft was disabled"), True)
