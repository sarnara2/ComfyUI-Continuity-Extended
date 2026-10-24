"""Temporary final-prompt drafts reach real pass payloads, not source fields."""

from copy import deepcopy
from pathlib import Path

import layout
from harness import check, FAILURES, passed

compiler = layout.load("compile").compile


def card(identity, text="@anna walks.", **extra):
    return {"card_id": identity, "duration_s": 3, "prompt": text, "assets": [], **extra}


def piece(cards):
    return {"version": 2, "face_schema": 1, "family": "h3", "render": "chained", "prompt": "",
            "assets": [{"handle": "ref-1", "kind": "image", "role": "reference", "filename": "anna.png"}],
            "subjects": [{"handle": "anna", "from": ["ref-1"], "description": "the woman"}],
            "segments": cards}


def draft(data, cards, text):
    original = deepcopy(data)
    original.pop("prompt_overrides", None)
    segments = compiler.timeline_segments(original)
    runs = compiler.timeline_runs(original, segments)
    position = next(position for position, (start, end) in enumerate(runs)
                    if cards == [segment.get("card_id") for segment in segments[start:end]])
    payload = compiler.timeline_payloads(original)[position]
    return {"cards": cards, "text": text, "binding": compiler.prompt_binding(compiler.compile_segment(payload))}


def expect_error(label, data):
    try:
        for payload in compiler.timeline_payloads(data):
            if "request" in payload:
                compiler.compile_segment(payload)
    except compiler.CompileError:
        return
    FAILURES.append(label + ": accepted a stale or invalid final-prompt draft")


source = piece([card("card-a")])
before = deepcopy(source)
base = compiler.timeline_payloads(source)
compiled_base = compiler.compile_segment(base[0])
check("OFF creates no override", "prompt_override" in base[0], False)
check("ordinary compilation never changes source fields", source, before)

forced = deepcopy(source)
forced["prompt_overrides"] = [draft(forced, ["card-a"], "Temporary final text.")]
forced_before = deepcopy(forced)
payload = compiler.timeline_payloads(forced)[0]
compiled = compiler.compile_segment(payload)
check("ON reaches the actual generation payload", payload.get("prompt_override"), "Temporary final text.")
check("compiling still derives the base from original source", compiled.prompt, compiled_base.prompt)
check("override does not change checkpoint routing", compiled.checkpoint, compiled_base.checkpoint)
check("override does not change bound reference files",
      [asset.filename for asset in compiled.ref_images], [asset.filename for asset in compiled_base.ref_images])
check("ON never writes into source input fields", forced, forced_before)
off = deepcopy(forced)
off.pop("prompt_overrides")
check("OFF restores identical ordinary payload", compiler.timeline_payloads(off), base)

two = piece([card("card-a"), card("card-b", "@anna turns.")])
two["prompt_overrides"] = [draft(two, ["card-b"], "Only the second pass changes.")]
two_payloads = compiler.timeline_payloads(two)
check("separate cards remain separate passes", len(two_payloads), 2)
check("unselected pass has no override", "prompt_override" in two_payloads[0], False)
check("selected pass has its own override", two_payloads[1].get("prompt_override"), "Only the second pass changes.")

merged = piece([card("card-a"), card("card-b", "@anna turns.", merge=True)])
merged["prompt_overrides"] = [draft(merged, ["card-a", "card-b"], "One final text for the merged pass.")]
merged_before = deepcopy(merged)
merged_payloads = compiler.timeline_payloads(merged)
check("merged cards produce one generation payload", len(merged_payloads), 1)
check("merged override replaces the entire pass", merged_payloads[0].get("prompt_override"),
      "One final text for the merged pass.")
check("real merged compiler still has both source actions", "walks" in compiler.compile_segment(
      merged_payloads[0]).prompt and "turns" in compiler.compile_segment(merged_payloads[0]).prompt, True)
check("merged sources remain unchanged", merged, merged_before)

wrong_pass = deepcopy(merged)
wrong_pass["prompt_overrides"][0]["cards"] = ["card-b"]
expect_error("one-card draft cannot replace a larger merged pass", wrong_pass)
changed_file = deepcopy(forced)
changed_file["assets"][0]["filename"] = "someone-else.png"
expect_error("changing the bound file invalidates its draft", changed_file)
changed_subject = deepcopy(forced)
changed_subject["subjects"][0]["handle"] = "ben"
expect_error("renaming a subject invalidates numeric label assumptions", changed_subject)
changed_topology = deepcopy(merged)
changed_topology["segments"][1]["merge"] = False
expect_error("splitting a merged pass invalidates its draft", changed_topology)
changed_card = deepcopy(forced)
changed_card["segments"][0]["card_id"] = "replacement-card"
check("another card never inherits an old draft",
      "prompt_override" in compiler.timeline_payloads(changed_card)[0], False)

varying = piece([card("card-a")])
varying["subjects"][0]["description"] = "the woman with {long|short} hair"
varying["subjects"][0]["usage_rules"] = "Keep {face|hair}."
varying["prompt_overrides"] = [draft(varying, ["card-a"], "Temporary text over the same references.")]
varied = compiler.varied_piece(varying, 17)
check("seeded prose changes keep the same reference binding",
      compiler.compile_segment(compiler.timeline_payloads(varied)[0]).labels, compiled_base.labels)

held = piece([card("card-a", hold=True), card("card-b", "@anna turns.")])
held["prompt_overrides"] = [draft(held, ["card-a"], "Held draft."), draft(held, ["card-b"], "Live draft.")]
rendered = compiler.rendered_piece(held)
held_payloads = compiler.timeline_payloads(rendered)
check("held draft is ignored while live draft remains", len(held_payloads), 1)
check("held filtering retains the surviving pass draft", held_payloads[0].get("prompt_override"), "Live draft.")
check("held filtering does not invalidate surviving references",
      compiler.compile_segment(held_payloads[0]).labels, compiled_base.labels)

kept = deepcopy(held)
kept["segments"][0]["take"] = {"filename": "kept.mp4", "duration_s": 3}
kept_payloads = compiler.timeline_payloads(compiler.rendered_piece(kept))
check("kept footage is not sent a prompt draft", "prompt_override" in kept_payloads[0], False)
check("live draft survives earlier kept footage", kept_payloads[1].get("prompt_override"), "Live draft.")
compiler.compile_segment(kept_payloads[1])

choice = piece([card("card-a", "{@anna waits.|@ben turns.}")])
choice["assets"].append({"handle": "ref-2", "kind": "image", "role": "reference", "filename": "ben.png"})
choice["subjects"].append({"handle": "ben", "from": ["ref-2"]})
selection = compiler.varied_piece(choice, 0)
selected_draft = draft(selection, ["card-a"], "A draft using the currently selected subject.")
choice["prompt_overrides"] = [selected_draft]
other_seed = next(seed for seed in range(1, 32) if compiler.prompt_binding(compiler.compile_segment(
    compiler.timeline_payloads(compiler.varied_piece({key: value for key, value in choice.items()
        if key != "prompt_overrides"}, seed))[0])) != selected_draft["binding"])
expect_error("a seed selecting another subject cannot silently rebind the draft",
             compiler.varied_piece(choice, other_seed))

# No browser or model is needed to check the UI's lifetime and serialization
# contract, and the same fixture checks JS/Python reference-layout agreement.
if layout.shutil.which("node"):
    binding = compiler.prompt_binding(compiled_base)
    reflected = layout.run("""
const p = await import(process.argv[1]);
const data = JSON.parse(process.argv[2]);
const binding = JSON.parse(process.argv[3]);
const owner = {}, cards = [data.segments[0].card_id];
const d = p.passDraft(owner, data, cards, 'base text', () => {}, binding);
const initial = p.withRuntimePrompts(owner, data);
d.set(true, 'edited text');
const on = p.withRuntimePrompts(owner, data);
const reopened = p.passDraft(owner, data, cards, 'base text', () => {}, binding);
reopened.set(false);
const off = p.withRuntimePrompts(owner, data);
reopened.set(true);
const changed = {...data, prompt: 'source changed'};
const stale = p.withRuntimePrompts(owner, changed);
const rearmed = reopened.set(true);
const loaded = p.withRuntimePrompts({}, data);
const nextOwner = {};
const oldBindingDraft = p.passDraft(nextOwner, data, cards, 'old base', () => {}, binding);
oldBindingDraft.set(true, 'old edited text');
const newBinding = {...binding, subject_labels: {...binding.subject_labels, anna: '<Subject 2>'}};
const freshBindingDraft = p.passDraft(nextOwner, data, cards, 'new base', () => {}, newBinding);
const freshStartsOff = !freshBindingDraft.enabled;
const oldBindingRejected = !oldBindingDraft.set(true, 'late old-binding edit');
freshBindingDraft.set(true, 'new edited text');
const recovered = p.withRuntimePrompts(nextOwner, data);
const clearedOwner = {};
const clearing = p.passDraft(clearedOwner, data, cards, 'base text', () => {}, binding);
clearing.set(true, 'draft being cleared');
p.clearRuntimePrompts(clearedOwner);
const cleared = p.withRuntimePrompts(clearedOwner, data);
const clearedRejected = !clearing.set(true);
console.log(JSON.stringify({initial, on, off, stale, rearmed, loaded, freshStartsOff,
  freshText: freshBindingDraft.text, recovered, newBinding, oldBindingRejected, cleared, clearedRejected}));
""", Path(layout.js("prompt-overrides.js")).as_uri(), source, binding)
    check("UI serializes the actual compiled binding", reflected["on"]["prompt_overrides"][0]["binding"], binding)
    check("UI draft starts OFF", "prompt_overrides" in reflected["initial"], False)
    check("UI ON serializes only its edited final text",
          reflected["on"]["prompt_overrides"][0]["text"], "edited text")
    check("UI OFF serializes original inputs without an override", reflected["off"], source)
    check("source edit invalidates the old draft", "prompt_overrides" in reflected["stale"], False)
    check("a delayed old modal cannot re-arm an invalidated draft", reflected["rearmed"], False)
    check("a new owner/reloaded workflow starts OFF", reflected["loaded"], source)
    check("receiving changed live binding resets an old enabled draft", reflected["freshStartsOff"], True)
    check("changed binding starts from the new model prompt", reflected["freshText"], "new base")
    check("a fresh enable uses the newly received binding",
          reflected["recovered"]["prompt_overrides"][0]["binding"], reflected["newBinding"])
    check("an old-binding modal cannot report a successful late edit", reflected["oldBindingRejected"], True)
    check("error recovery clears serialized overrides", reflected["cleared"], source)
    check("error recovery invalidates pending modal callbacks", reflected["clearedRejected"], True)

passed("all final-prompt draft regression tests passed")
