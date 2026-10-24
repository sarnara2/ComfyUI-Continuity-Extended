"""Current preset data, isolated userdata storage, and real modal save/apply.

No user library, ComfyUI server, source media or render jobs are touched.
"""
import layout
import json
import os
import subprocess
import harness
from domshim import DOM
from harness import check

layout.skip_without_node()

SCRIPT = DOM + r'''
import * as S from "./web/creator/state.js";
import * as P from "./web/creator/presets.js";
import { passDraft } from "./web/creator/prompt-overrides.js";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
globalThis.app = { extensionManager: { setting: { get: () => "en" } } };
const checks = {}, details = {};
const ok = (name, value) => { checks[name] = Boolean(value); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const io = () => ({ value: (_name, fallback) => fallback, set() {} });
const picture = (handle, filename, extra = {}) => ({ handle, filename, kind: "image", role: "reference", ...extra });
const shot = (extra = {}) => ({ prompt: "@anna meets @bob.", duration_s: 3, assets: [], loras: [], ...extra });
const raw = { version: 2, render: "chained", prompt: "Standing @anna with @bob.",
  prompt_sections: { summary: "[reference generation] @anna and @bob.", retention_analysis: "Keep @anna." },
  retention_blocks: [{ type: "subject", handle: "anna" }, { type: "text", text: "@bob waits by @ref-3." }],
  retention_overrides: ["anna"],
  assets: [picture("ref-1", "anna.png", { description: "Anna beside @bob in @ref-3.",
    usage_rules: "Compare @ref-2 with @anna.", ref_size: "max" }),
    picture("ref-2", "bob.png", { ref_size: "match" }),
    { handle: "ref-3", filename: "source.mp4", kind: "video", role: "reference", track: "both", takes: "edit", ref_size: "match" },
    picture("ref-4", "target.png", { replacement_origin: { handle: "ref-3", filename: "source.mp4", frame: 12 },
      replacement_annotation: { points: [{ x: 0.2, y: 0.4 }] } })],
  subjects: [{ handle: "anna", takes: "person", from: ["ref-1"], usage_rules: "Keep @anna beside @bob.",
    replaces: ["ref-4"], replaces_what: "The central person.", relationship: "fully_preserved",
    wears: { h3: { send: "pictures", loras: [{ name: "identity.safetensors", strength: 0.75 }] } } },
    { handle: "bob", takes: "person", from: ["ref-2"], usage_rules: "Keep @bob beside @anna in @ref-3." }],
  loras: [{ name: "look.safetensors", strength: 0.6 }],
  segments: [shot({ card_id: "card-a", prompt_sections: { summary: "[reference generation] @anna and @bob." },
    retention_blocks: [{ type: "subject", handle: "bob" }], retention_overrides: ["bob"],
    refined: { body: "@anna turns to @bob.", source: "old", scope: "shot", fields: ["prompt"],
      sections: { summary: "[reference generation] @anna and @bob." } } }),
    shot({ card_id: "card-b", continue: true, feather: 22, feather_pin: true })] };
const source = S.parseTimeline(JSON.stringify(raw));
source.segments[0].hold = true; source.segments[0].seed = 777;
source.segments[0].take = { filename: "done.mp4", subfolder: "takes", duration_s: 3, seed: 777 };
const serialized = JSON.parse(S.serializeTimeline(source));
passDraft(source, serialized, ["card-a"], "Original", () => {}, { references: [] }).set(true, "TEMPORARY DRAFT");
const body = P.capturePiece(source, io());
ok("full piece captures a separate complete roster", body.subjects.members.length === 2 && P.SECTION.subjects.label === "Cast roster");
ok("piece prompt sections and retention edits survive capture", equal(body.prompt.prompt_sections, serialized.prompt_sections)
  && equal(body.prompt.retention_blocks, serialized.retention_blocks) && equal(body.prompt.retention_overrides, serialized.retention_overrides));
ok("capture excludes temporary override and old take state", !JSON.stringify(body).includes("TEMPORARY DRAFT")
  && !Object.hasOwn(body.strip.segments[0], "hold") && !Object.hasOwn(body.strip.segments[0], "take")
  && !Object.hasOwn(body.strip.segments[0], "seed"));
ok("card identity and authored seam pins survive", body.strip.segments[0].card_id === "card-a" && body.strip.segments[1].feather_pin === true);

const row = await P.savePreset({ name: "Synthetic full piece", scope: "piece", data: body, folder: "audit", note: "Synthetic only" });
const loaded = await P.loadBody((await P.listPresets({ force: true })).find(item => item.id === row.id));
ok("actual userdata index and body save/load are lossless", equal(loaded, body));
const restored = S.parseTimeline(JSON.stringify({ version: 2, segments: [shot({ prompt: "Old prompt" })] }));
P.applyToPiece(loaded, Object.keys(loaded), restored, io()); S.syncTimeline(restored);
ok("full apply restores both members and cross-member rules", restored.subjects.length === 2
  && restored.subjects[0].usage_rules.includes("@bob") && restored.subjects[1].usage_rules.includes("@anna"));
ok("full apply restores authored retention order and overrides", equal(restored.retention_blocks, serialized.retention_blocks)
  && equal(restored.retention_overrides, serialized.retention_overrides)
  && equal(restored.segments[0].retention_blocks, serialized.segments[0].retention_blocks));
ok("full apply preserves per-segment summary and refined sections", equal(restored.segments[0].prompt_sections, serialized.segments[0].prompt_sections)
  && equal(restored.segments[0].refined.sections, serialized.segments[0].refined.sections));
ok("model ref sizes and member LoRA survive save and apply", S.refSize(restored.assets.find(a => a.filename === "bob.png")) === "match"
  && restored.subjects[0].wears.h3.loras[0].name === "identity.safetensors");
const captureText = JSON.stringify(loaded);
restored.assets[0].description = "Changed after apply";
restored.segments[0].refined.sections.summary = "Changed after apply";
ok("applied fields do not alias cached preset body", JSON.stringify(loaded) === captureText);

const conflict = () => S.parseTimeline(JSON.stringify({ version: 2, prompt: "Do not rewrite @legacy.",
  assets: [picture("ref-1", "unrelated.png"), picture("ref-3", "unrelated-source.png"),
    picture("ref-8", "anna.png"), picture("bob", "other.png")],
  subjects: [{ handle: "legacy", takes: "person", from: ["ref-1"] }], segments: [shot(), shot()] }));
const target = conflict();
P.applyToPiece(body, ["subjects"], target, io());
const anna = target.subjects.find(s => s.handle === "anna"), bob = target.subjects.find(s => s.handle.startsWith("bob"));
const origin = S.castAssets(target).find(a => a.filename === "target.png").replacement_origin;
const sourceFile = S.castAssets(target).find(a => a.filename === "source.mp4");
ok("roster-only retains unrelated refs and source text", target.assets.some(a => a.filename === "unrelated.png")
  && target.assets.some(a => a.filename === "other.png") && target.prompt === "Do not rewrite @legacy.");
ok("roster preserves target file and safely resolves handle collisions", target.assets.some(a => a.handle === "ref-8" && !a.description)
  && bob.handle === "bob_2" && new Set(target.assets.map(a => a.handle)).size === target.assets.length);
ok("roster rules remap both member names and file references", anna.usage_rules.includes("@bob_2")
  && bob.usage_rules.includes(`@${sourceFile.handle}`) && bob.usage_rules.includes("@anna"));
const restoredAnnaFile = S.castAssets(target).find(a => a.handle === anna.from[0]);
const restoredBobFile = S.castAssets(target).find(a => a.filename === "bob.png");
ok("imported asset annotations rebind without touching unrelated files", restoredAnnaFile.description.includes("@bob_2")
  && restoredAnnaFile.description.includes(`@${sourceFile.handle}`)
  && restoredAnnaFile.usage_rules.includes(`@${restoredBobFile.handle}`)
  && !target.assets.find(a => a.filename === "unrelated.png").description);
ok("replacement origin resolves to restored source file", origin.handle === sourceFile.handle && origin.filename === sourceFile.filename);
const rulesBefore = JSON.stringify(body.subjects);
target.subjects[0].usage_rules = "Change after apply";
ok("restored roster cannot mutate stored member definitions", JSON.stringify(body.subjects) === rulesBefore);
const beforeReapply = target.assets.length;
P.applyToPiece(body, ["subjects"], target, io());
ok("reapplying a roster does not duplicate rebound media", target.assets.length === beforeReapply);
for (const section of ["refs", "strip"]) {
  const partial = conflict(), before = JSON.stringify(partial.subjects);
  P.applyToPiece(body, [section], partial, io());
  ok(`${section}-only never silently replaces the cast`, JSON.stringify(partial.subjects) === before);
}
const legacy = conflict(), legacyBefore = JSON.stringify(legacy.subjects), oldBody = structuredClone(body);
delete oldBody.subjects;
P.applyToPiece(oldBody, [...Object.keys(oldBody), "subjects"], legacy, io());
ok("old preset without roster keeps current cast", JSON.stringify(legacy.subjects) === legacyBefore);
ok("roster scope crossing is explicit and constrained", P.crossable("subjects", "piece", "piece").ok
  && !P.crossable("subjects", "piece", "shot").ok && !P.crossable("subjects", "piece", "prestage").ok);
const variants = S.parseTimeline(JSON.stringify({ version: 2, assets: [
  picture("ref-1", "shared.png", { crop: { x: 0, y: 0, w: 0.5, h: 1 } }),
  picture("ref-2", "shared.png", { crop: { x: 0.5, y: 0, w: 0.5, h: 1 }, ref_size: "match" })],
  subjects: [{ handle: "person", takes: "person", from: ["ref-1", "ref-2", "ref-99"] }], segments: [shot(), shot()] }));
const variantBody = P.capturePiece(variants, io());
const variantTarget = S.parseTimeline(JSON.stringify({ version: 2,
  assets: [picture("ref-99", "unrelated.png")], segments: [shot(), shot()] }));
P.applyToPiece(variantBody, ["subjects"], variantTarget, io());
const variantMember = variantTarget.subjects[0], variantAssets = S.castAssets(variantTarget);
ok("same-file crop and ref-size variants remain distinct", variantMember.from[0] !== variantMember.from[1]
  && variantAssets.find(a => a.handle === variantMember.from[0]).crop.x === 0
  && variantAssets.find(a => a.handle === variantMember.from[1]).crop.x === 0.5
  && S.refSize(variantAssets.find(a => a.handle === variantMember.from[1])) === "match");
ok("dangling claim stays missing instead of binding unrelated target", variantMember.from.length === 3
  && variantMember.from[2] !== "ref-99" && !variantAssets.some(a => a.handle === variantMember.from[2]));
const textOnlyBody = structuredClone(variantBody);
textOnlyBody.subjects.members[0].usage_rules = "Compare @ref-100 with @person여.";
variantTarget.assets.push(picture("ref-100", "unrelated-text-only.png"));
P.applyToPiece(textOnlyBody, ["subjects"], variantTarget, io());
const missingTextHandle = variantTarget.subjects[0].usage_rules.match(/@(ref-\d+)/)?.[1];
ok("text-only missing reference cannot bind unrelated target", missingTextHandle !== "ref-100"
  && !S.castAssets(variantTarget).some(a => a.handle === missingTextHandle));
ok("Unicode trailing handle characters prevent partial tag rewriting", variantTarget.subjects[0].usage_rules.includes("@person여"));
P.applyToPiece({ subjects: { members: [], assets: [] } }, ["subjects"], variantTarget, io());
ok("explicit empty roster clears cast but not attached media", variantTarget.subjects.length === 0 && variantTarget.assets.length > 0);
const panelSource = S.parseTimeline(JSON.stringify({ version: 2, assets: [picture("plate-1", "sheet.png", {
  panels: [{ handle: "img-1", filename: "left.png", usage_rules: "Compare @img-2." },
    { handle: "img-2", filename: "right.png" }] })],
  subjects: [{ handle: "panelperson", takes: "person", from: ["img-1", "img-2"] }], segments: [shot(), shot()] }));
const panelTarget = S.parseTimeline(JSON.stringify({ version: 2,
  assets: [picture("img-1", "unrelated-panel.png")], segments: [shot(), shot()] }));
P.applyToPiece(P.capturePiece(panelSource, io()), ["subjects"], panelTarget, io());
const plate = panelTarget.assets.find(a => a.filename === "sheet.png");
ok("panel claims retain source plates and remap panel handles", plate.panels.length === 2
  && equal(panelTarget.subjects[0].from, plate.panels.map(p => p.handle)) && plate.panels[0].handle !== "img-1"
  && plate.panels[0].usage_rules === `Compare @${plate.panels[1].handle}.`);
const chainSource = S.parseTimeline(JSON.stringify({ version: 2, assets: [
  picture("ref-1", "A.png", { takes: "person", description: "Use @ref-2" }),
  picture("ref-2", "B.png", { takes: "person", description: "Use @ref-3" }),
  picture("ref-3", "C.png", { takes: "person" })], subjects: [{ handle: "person", takes: "person", from: ["ref-1", "ref-2", "ref-3"] }],
  segments: [shot(), shot()] }));
const chainTarget = S.parseTimeline(JSON.stringify({ version: 2, assets: [
  picture("ref-1", "A.png", { takes: "person", description: "Use @ref-2" }),
  picture("ref-2", "B.png", { takes: "person", description: "Use @ref-4" }),
  picture("ref-3", "C.png", { takes: "person" }), picture("ref-4", "C.png", { takes: "person" })], segments: [shot(), shot()] }));
const chainBody = P.capturePiece(chainSource, io()), originalChain = JSON.stringify(chainTarget.assets);
P.applyToPiece(chainBody, ["subjects"], chainTarget, io());
ok("cascading annotation remaps never mutate existing target references", JSON.stringify(chainTarget.assets.slice(0, 4)) === originalChain);
const chainSize = chainTarget.assets.length;
P.applyToPiece(chainBody, ["subjects"], chainTarget, io());
ok("cascading annotation remaps reuse exact copies on repeated apply", chainTarget.assets.length === chainSize);

const shotBody = P.captureShot(source, 1, io());
const shotTarget = S.parseTimeline(JSON.stringify({ version: 2, segments: [shot(), shot()] }));
P.applyToShot(shotBody, Object.keys(shotBody), shotTarget.segments[1], io(), { piece: shotTarget });
ok("shot presets retain seam pins and no runtime state", shotTarget.segments[1].feather_pin === true
  && !Object.hasOwn(shotBody.shot, "hold") && !Object.hasOwn(shotBody.shot, "seed"));
const clip = { prompt: {}, shot: { kind: "clip", filename: "clip.mp4", duration_s: 5, width: 1280, height: 720,
  trim: { start: 2, end: 7 }, crop: { x: 0, y: 0, w: 0.5, h: 1 }, sound: false } };
P.applyToShot(clip, ["shot"], shotTarget.segments[1], io(), { piece: shotTarget });
ok("clip preset timing actually restores supplied clip metadata", shotTarget.segments[1].kind === "clip"
  && shotTarget.segments[1].filename === "clip.mp4" && shotTarget.segments[1].trim.start === 2 && shotTarget.segments[1].sound === false);

const pre = S.parsePreStage(JSON.stringify({ version: 1, arch: "krea2", prompt: "@anna portrait.",
  refs: [{ handle: "img-1", filename: "anna.png", crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.7 },
    mods: { flux2: "refmod:anna" }, panels: [{ filename: "panel.png", cut: true, points: [{ x: 0.1, y: 0.2 }] }] },
    { handle: "img-2", filename: "guide.png", role: "guide", guide: "canny" }],
  subjects: [{ handle: "anna", takes: "person", from: ["img-1"], usage_rules: "Keep identity." }],
  guide: { strength: 0.8 }, edit_first: true, ref_method: "kontext", ref_lora: "adapter.safetensors" }));
const preBody = P.capturePreStage(pre, io()), preTarget = S.emptyPreStage();
P.applyToPreStage(preBody, Object.keys(preBody), preTarget, io());
const preWritten = JSON.parse(S.serializePreStage(preTarget)), originalPre = JSON.parse(S.serializePreStage(pre));
details.preRefs = { got: preWritten.refs, expected: originalPre.refs };
ok("image pre-stage keeps canonical crops panels guides and renditions", equal(preWritten.refs, originalPre.refs));
ok("image pre-stage keeps cast and reference behavior", preTarget.subjects[0].handle === "anna"
  && preTarget.guide.strength === 0.8 && preTarget.edit_first === true && preTarget.ref_lora === "adapter.safetensors");
preTarget.refs[0].panels[0].points[0].x = 0.9;
ok("pre-stage references are deep copies", preBody.refs.refs[0].panels[0].points[0].x === 0.1);
const defaultPre = P.capturePreStage(S.emptyPreStage(), io());
const oldSettings = S.emptyPreStage();
oldSettings.neural.on = true;
oldSettings.models.krea2 = Object.fromEntries(Object.keys(oldSettings.models.krea2).map(key => [key, "old.safetensors"]));
P.applyToPreStage(defaultPre, ["look", "weights"], oldSettings, io());
ok("default pre-stage look clears an old enabled postprocessor", oldSettings.neural.on === false);
ok("default pre-stage weights clear old checkpoints", equal(oldSettings.models, S.emptyPreStage().models));

const h3 = S.parsePreStage(JSON.stringify({ version: 1, arch: "minimax", prompt: "Outer hidden image prompt.",
  minimax: { frames: 5, latent_index: 0, prompt_mode: "native", request: {
    prompt: "Actual @anna H3 still prompt.", prompt_sections: { summary: "[reference generation] @anna." },
    retention_blocks: [{ type: "subject", handle: "anna" }], retention_overrides: ["anna"],
    assets: [picture("img-1", "anna.png", { ref_size: "match", description: "Actual picture" })],
    loras: [{ name: "h3-still.safetensors", strength: 0.65 }],
    subjects: [{ handle: "anna", takes: "person", from: ["img-1"], usage_rules: "Keep face." }],
    aspect: "9:16", short_edge: 480 } } }));
const h3Body = P.capturePreStage(h3, io()), h3Target = S.emptyPreStage();
P.applyToPreStage(h3Body, Object.keys(h3Body), h3Target, io());
const request = h3Target.minimax.request;
ok("H3 pre-stage restores active nested prompt not hidden image prompt", request.prompt === "Actual @anna H3 still prompt."
  && equal(request.prompt_sections, h3.minimax.request.prompt_sections));
ok("H3 pre-stage restores nested media LoRAs and cast", request.assets[0].filename === "anna.png"
  && S.refSize(request.assets[0]) === "match" && request.loras[0].name === "h3-still.safetensors" && request.subjects[0].handle === "anna");
ok("H3 pre-stage keeps nested authored retention fields", equal(request.retention_blocks, h3.minimax.request.retention_blocks)
  && equal(request.retention_overrides, h3.minimax.request.retention_overrides));
ok("H3 pre-stage keeps nested canvas", request.aspect === "9:16" && request.short_edge === 480);
const h3Partial = S.parsePreStage(S.serializePreStage(h3));
const promptBefore = h3Partial.minimax.request.prompt;
P.applyToPreStage(h3Body, ["weights"], h3Partial, io());
ok("H3 weights-only cannot overwrite nested prompt", h3Partial.minimax.request.prompt === promptBefore);
const h3Defaults = S.parsePreStage(JSON.stringify({ version: 1, arch: "minimax" }));
const previousH3 = S.parsePreStage(S.serializePreStage(h3));
previousH3.minimax.request.neural.on = true;
previousH3.minimax.request.face.on = true;
P.applyToPreStage(P.capturePreStage(h3Defaults, io()), ["look"], previousH3, io());
ok("default H3 look clears nested processor and face flags", previousH3.minimax.request.neural.on === false
  && previousH3.minimax.request.face.on === false);
// Exact missing-field shape of the previously shipped H3 capture: outer image
// prompt/refs/LoRAs/look, but the real H3 weights and sampler row were saved.
const legacyH3 = structuredClone(h3Body);
legacyH3.prompt = { prompt: h3.prompt };
legacyH3.refs = { refs: [] };
legacyH3.look = { aspect: h3.aspect, short_edge: h3.short_edge };
legacyH3.loras = [{ name: "hidden-image-lora.safetensors", strength: 1 }];
delete legacyH3.speed.still; delete legacyH3.subjects;
for (const section of ["prompt", "refs", "look", "loras"]) {
  const legacyTarget = S.parsePreStage(S.serializePreStage(h3)), before = S.serializePreStage(legacyTarget);
  let refused = false;
  try { P.applyToPreStage(legacyH3, ["weights", section], legacyTarget, io()); }
  catch (error) { refused = /older H3 preset/.test(error.message); }
  ok(`legacy H3 missing active ${section} refuses before all mutation`, refused && before === S.serializePreStage(legacyTarget));
}
const legacyWeights = S.parsePreStage(S.serializePreStage(h3));
const oldPrompt = legacyWeights.minimax.request.prompt, oldAssets = JSON.stringify(legacyWeights.minimax.request.assets);
P.applyToPreStage(legacyH3, ["weights"], legacyWeights, io());
ok("legacy H3 weights remain usable without clearing active content", legacyWeights.minimax.request.prompt === oldPrompt
  && JSON.stringify(legacyWeights.minimax.request.assets) === oldAssets);
legacyWeights.minimax.request.turbo.on = true;
const activeTurbo = JSON.stringify(legacyWeights.minimax.request.turbo);
P.applyToPreStage(legacyH3, ["speed"], legacyWeights, io());
ok("legacy H3 sampler load preserves unknown active turbo setting", JSON.stringify(legacyWeights.minimax.request.turbo) === activeTurbo);
// Selective same-scope loads must read the SOURCE's active architecture even
// when the target stays on another architecture because Weights is unchecked.
const crossImage = S.parsePreStage(JSON.stringify({ arch: "krea2", prompt: "Old target image prompt.",
  refs: [{ handle: "img-9", filename: "old-image.png" }],
  minimax: { request: { prompt: "Keep hidden target H3 branch." } } }));
const crossImageWeights = JSON.stringify({ arch: crossImage.arch, models: crossImage.models });
const hiddenRequest = JSON.stringify(crossImage.minimax);
P.applyToPreStage(h3Body, ["prompt", "refs"], crossImage, io());
ok("H3-to-image selective load uses active source prompt and files", crossImage.prompt === h3.minimax.request.prompt
  && crossImage.refs.length === 1 && crossImage.refs[0].filename === "anna.png"
  && !crossImage.refs.some(ref => ref.filename === "old-image.png"));
ok("H3-to-image selective load preserves target weights and inactive request", crossImageWeights === JSON.stringify({ arch: crossImage.arch, models: crossImage.models })
  && hiddenRequest === JSON.stringify(crossImage.minimax));
const imageSource = S.parsePreStage(S.serializePreStage(pre));
imageSource.prompt = "ACTIVE IMAGE PROMPT";
imageSource.init = { filename: "init.png", denoise: 0.65, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } };
const crossH3 = S.parsePreStage(JSON.stringify({ arch: "minimax", prompt: "Keep hidden image prompt.",
  refs: [{ handle: "img-8", filename: "keep-hidden-image.png" }],
  minimax: { request: { prompt: "OLD H3 PROMPT", models: { ref2va: "keep-h3.safetensors" },
    assets: [picture("img-9", "OLD-H3.png")] } } }));
const crossH3Weights = JSON.stringify({ arch: crossH3.arch, models: crossH3.minimax.request.models });
P.applyToPreStage(P.capturePreStage(imageSource, io()), ["prompt", "refs"], crossH3, io());
const crossAssets = crossH3.minimax.request.assets;
details.crossAssets = crossAssets;
details.crossRequest = JSON.parse(S.serializeState(crossH3.minimax.request));
ok("image-to-H3 selective load replaces active request not old files", crossH3.minimax.request.prompt === "ACTIVE IMAGE PROMPT"
  && !crossAssets.some(asset => asset.filename === "OLD-H3.png")
  && crossAssets.some(asset => asset.role === "first_frame" && asset.filename === "init.png" && asset.crop.x === 0.1)
  && crossAssets.some(asset => asset.role === "reference" && asset.filename === "anna.png")
  && crossAssets.some(asset => asset.role === "guide" && asset.filename === "guide.png" && asset.op === "canny"));
ok("image-to-H3 selective load preserves weights and hidden image fields", crossH3Weights === JSON.stringify({ arch: crossH3.arch, models: crossH3.minimax.request.models })
  && crossH3.prompt === "Keep hidden image prompt." && crossH3.refs[0].filename === "keep-hidden-image.png");
ok("image-to-H3 converted parent and panel handles are valid and unique", crossAssets.every(asset => asset.handle)
  && crossAssets.every(asset => (asset.panels ?? []).every(panel => panel.handle))
  && S.takenHandles({ assets: crossAssets }).size === crossAssets.reduce((n, asset) => n + 1 + (asset.panels?.length ?? 0), 0));
for (const section of ["refs", "subjects"]) {
  const unsupported = structuredClone(h3Body);
  if (section === "refs") unsupported.refs.still.assets.push({ handle: "vid-1", filename: "actor.mp4", kind: "video", role: "reference" });
  else unsupported.subjects.assets.push({ handle: "vid-1", filename: "actor.mp4", kind: "video", role: "reference" });
  const imageTarget = S.emptyPreStage(), before = S.serializePreStage(imageTarget);
  let rejected = false;
  try { P.applyToPreStage(unsupported, ["prompt", section], imageTarget, io()); }
  catch (error) { rejected = /References and Cast roster/.test(error.message); }
  ok(`unsupported cross-arch ${section} refuses before any mutation`, rejected && before === S.serializePreStage(imageTarget));
}
for (const role of ["init", "guide"]) {
  const invalid = P.capturePreStage(imageSource, io());
  if (role === "init") invalid.refs.init.panels = [{ filename: "cutout.png", cut: true }];
  else invalid.refs.refs.find(ref => ref.role === "guide").panels = [{ filename: "guide-part.png" }];
  const h3Target = S.parsePreStage(JSON.stringify({ arch: "minimax" })), before = S.serializePreStage(h3Target);
  let rejected = false;
  try { P.applyToPreStage(invalid, ["prompt", "refs"], h3Target, io()); }
  catch (error) { rejected = /framing.*H3 branch/.test(error.message); }
  ok(`unsupported image ${role} plate refuses atomically on H3`, rejected && before === S.serializePreStage(h3Target));
}

// Exercise the actual modal's Save current -> lazy body load -> Apply path.
const libraryURL = pathToFileURL(path.join(process.cwd(), "web/creator/presetlib.js"));
const librarySource = readFileSync(libraryURL, "utf8").replace("class PresetLibrary {", "export class PresetLibrary {")
  .replace(/from "(\.[^"]+)"/g, (_, spec) => `from "${new URL(spec, libraryURL).href}"`);
const { PresetLibrary } = await import("data:text/javascript;base64," + Buffer.from(librarySource).toString("base64"));
const modalTarget = conflict(); let applied = 0;
const library = new PresetLibrary({ scope: "piece", target: { scope: "piece", family: () => "h3",
  capture: () => ({ data: body, defaultName: "Modal audit" }),
  apply: (data, keys, from) => { P.applyToPiece(data, keys, modalTarget, io(), { from }); applied++; } } }, () => {});
library.mount();
for (let i = 0; i < 4; i++) await new Promise(done => setTimeout(done, 0));
const modalRow = await library.saveCurrent();
ok("modal save uses the latest captured full body", modalRow?.name === "Modal audit" && equal(await P.loadBody(modalRow), body));
ok("modal exposes separate roster section selected by default", library.keys.has("subjects")
  && library.inspector.querySelectorAll(".mmc-preset-row").length === modalRow.sections.length);
await library.apply(modalRow);
ok("modal apply restores latest authored fields and roster", applied === 1 && modalTarget.subjects.length === 2
  && equal(modalTarget.prompt_sections, body.prompt.prompt_sections));

let exported;
const createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
URL.createObjectURL = blob => { exported = blob; return "blob:preset-audit"; };
URL.revokeObjectURL = () => {};
if (!Node.prototype.click) Node.prototype.click = function() {};
P.exportPresets([row], [body]);
URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL;
const imported = await P.importPresets(exported);
ok("JSON export and import keep full current schema", equal(await P.loadBody(imported[0]), body) && imported[0].id !== row.id);
console.log(JSON.stringify({ checks, details }));
'''

with layout.pack(skip=("atlas",)) as target:
    # Windows has a 32K command-line limit; use a generated harness file rather
    # than passing this full current-schema fixture with --eval.
    script_path = os.path.join(target, "preset-schema-check.mjs")
    with open(script_path, "w", encoding="utf-8") as handle:
        handle.write(SCRIPT)
    proc = subprocess.run(["node", script_path], cwd=target, capture_output=True, text=True, encoding="utf-8")
    if proc.returncode:
        harness.died(f"node failed:\n{proc.stderr}")
    got = json.loads(proc.stdout)
for name, value in got["checks"].items():
    check(name, value, True)
check("pre-stage canonical references", got["details"]["preRefs"]["got"], got["details"]["preRefs"]["expected"])
compiler = layout.load("canvas", "contextir", "compile").compile
check("converted cross-arch assets pass the real H3 asset parser", len(compiler._parse_assets(got["details"]["crossAssets"])),
      len(got["details"]["crossAssets"]))
compiled = compiler.compile_request(got["details"]["crossRequest"], image_size_lookup=lambda _filename: (1500, 1000))
check("converted active request compiles through the real H3 compiler", bool(compiled.prompt), True)
