"""One-input refines ask for one input, with no server/model/GPU or file writes.

Run standalone: python -B tests/test_refine_fields.py
"""

import copy
import json
import sys
import types

import layout
from harness import check, passed


PACKAGE = "fieldrefinecontracts"
layout.stub_server()
pkg = layout.load("compile", "prompting", package=PACKAGE)

# Import the actual route with inert edge dependencies. No disk reference can
# be opened, no real queue submitted, and neither backend has a real chat call.
for name in ("jobs", "media", "preview", "refine_local", "refine_remote", "guard"):
    stub = types.ModuleType(f"{PACKAGE}.{name}")
    setattr(pkg, name, stub)
    sys.modules[stub.__name__] = stub
pkg.jobs.register = lambda *args: None
pkg.jobs.JobError = type("JobError", (RuntimeError,), {})
pkg.media.image_size = lambda *args: (640, 480)
pkg.media.MediaError = type("MediaError", (RuntimeError,), {})
pkg.guard.same_origin = lambda fn: fn
route = layout.load("refine_routes", package=PACKAGE).refine_routes

calls = []
reply = {"body": "expanded target"}


def chat(model, system, message, images, **options):
    calls.append({"model": model, "system": system, "message": message,
                  "images": images, "options": options})
    return reply if isinstance(reply, str) else json.dumps(reply)


pkg.refine_local.chat = chat
pkg.refine_local.to_tensor = lambda image: ("local", image)
pkg.refine_remote.chat = chat
pkg.refine_remote.to_data_url = lambda image: ("remote", image)


def piece(family="h3"):
    return {"version": 2, "family": family, "models": {},
            "prompt": "global style", "soundscape": "room sound", "music": "score",
            "segments": [{"prompt": "card zero", "duration_s": 6, "assets": [],
                          "refined": {"body": "existing effective zero", "scope": "shot"}},
                         {"prompt": 'card one says "KEEP ME" {day|night}',
                          "duration_s": 6, "assets": []}]}


def request(scope="timeline", field="prompt", data=None, **patch):
    return {"kind": "field", "scope": scope, "field": field,
            "data": data if data is not None else piece(), "index": 1 if scope == "segment" else None,
            "model": "fixture-model", "language": "Korean", "seed": 37,
            "temperature": 0.2, "max_tokens": 2048, "template": "auto", **patch}


def raises(label, body, error, fragment):
    before = len(calls)
    try:
        route._run(body)
    except error as exc:
        check(label, fragment in str(exc), True)
    else:
        check(label, "did not raise", fragment)
    check(label + " does not ask a model", len(calls), before)


for scope, field in (("segment", "prompt"), ("timeline", "prompt"),
                     ("timeline", "soundscape"), ("timeline", "music")):
    body = request(scope, field)
    before = copy.deepcopy(body)
    result = route._run(body)
    check(f"{scope}/{field} owns exactly its target",
          (result["scope"], result["target_scope"], result["field"], result["index"]),
          ("field", scope, field, 1 if scope == "segment" else None))
    check(f"{scope}/{field} has no sibling rewrite outputs",
          bool({"shots", "piece", "soundscape", "music", "sections"} & result.keys()), False)
    check(f"{scope}/{field} leaves the input blob byte-equivalent", body, before)
    check(f"{scope}/{field} asks for a single body, not the family's whole reply",
          'exactly one rewritten string key, "body"' in calls[-1]["system"], True)
    check(f"{scope}/{field} explicitly forbids rewriting other fields",
          "read-only context, not material to rewrite" in calls[-1]["message"], True)
    check(f"{scope}/{field} preserves all sampling options", calls[-1]["options"],
          {"temperature": 0.2, "seed": 37, "max_tokens": 2048})
    check(f"{scope}/{field} uses Korean instruction", "Korean" in calls[-1]["system"], True)
    check(f"{scope}/{field} never imports a sibling's previous rewrite",
          "existing effective zero" in calls[-1]["message"], False)
    if scope == "segment":
        check("individual refine does not expose another card's raw prose",
              '"prompt": "card zero"' in calls[-1]["message"], False)

# Invalid targets are rejected before compile/look/chat; no fallback broad job.
for patch in ({"scope": "other"}, {"field": "sections"},
              {"scope": "segment", "field": "music"},
              {"scope": "segment", "index": True},
              {"scope": "segment", "index": -1},
              {"scope": "segment", "index": 19}):
    raises("invalid target " + str(patch), request(**patch), route.compiler.CompileError,
           "refine" if patch.get("index") is None else "segment")

for field in ("prompt", "soundscape", "music"):
    body = request(field=field, data={**piece(), "segments": []})
    check(f"empty timeline {field} still refines its own field", route._run(body)["field"], field)
    clip_only = {**piece(), "segments": [{"kind": "clip", "duration_s": 2,
                                         "clip": {"filename": "fixture.mp4", "duration_s": 2}}]}
    check(f"clip-only timeline {field} still refines its own field",
          route._run(request(field=field, data=clip_only))["field"], field)

body = request("segment", data={**piece(), "segments": [{"kind": "clip"}]}, index=0)
raises("a supplied clip cannot be prompt-refined", body, route.compiler.CompileError, "clip")

reply = {"body": "expanded target", "soundscape": "unasked audio"}
before = len(calls)
try:
    route._run(request())
except route.refine.RefineError as exc:
    check("an accidental broad model reply is rejected", "single-field" in str(exc), True)
else:
    check("an accidental broad model reply is rejected", False, True)
check("rejecting a broad reply never runs a second job", len(calls), before + 1)

reply = {"body": 'expanded "KEEP ME" {sunny day|rainy night}'}
result = route._run(request("segment"))
check("quoted words and brace alternatives survive without warnings", result["problems"], [])
reply = {"body": "lost both"}
result = route._run(request("segment"))
check("quote loss is visible", any('"KEEP ME"' in p for p in result["problems"]), True)
check("variation loss is visible", any("{day|night}" in p for p in result["problems"]), True)

reply = {"body": "N/A"}
result = route._run(request(field="music", data={**piece(), "music": "N/A"}))
check("an explicit N/A remains absence", result["body"], "N/A")
check("the instructions forbid inventing music from N/A",
      "keep it as N/A" in calls[-1]["message"], True)
reply = {"body": "invented brass score"}
try:
    route._run(request(field="music", data={**piece(), "music": "N/A"}))
except route.refine.RefineError as exc:
    check("N/A cannot silently become invented content", "explicit N/A" in str(exc), True)
else:
    check("N/A cannot silently become invented content", False, True)

# Reference grounding is read-only, respects muted files, and carries the
# user's cast feature/retention/role overrides instead of guessing from pixels.
grounded = {**piece(), "segments": [], "assets": [
    {"handle": "img-1", "kind": "image", "role": "reference", "filename": "active.png"},
    {"handle": "img-2", "kind": "image", "role": "reference", "filename": "MUTED.png", "enabled": False}],
    "subjects": [{"handle": "anna", "from": ["img-1", "img-2"],
                  "description": "kept identity", "takes": "person", "marker": "partially_preserved",
                  "features": [{"is": "blue coat", "instead": "red jacket", "attr": "clothing"}],
                  "notes": {"img-1": "front-lit face", "img-2": "MUTED NOTE"},
                  "triggers": {"img-1": ["face"], "img-2": ["MUTED WORD"]},
                  "replaces_what": "the man by the counter"}]}
before_grounded = copy.deepcopy(grounded)
looked = []
was_picture = route._picture
route._picture = lambda asset: looked.append(asset.filename) or "virtual image"
try:
    reply = {"body": "global @anna identity"}  # optional seen is allowed even with an image.
    result = route._run(request(data=grounded))
    check("only active reference pictures are looked at", looked, ["active.png"])
    check("a valid response may omit optional image readout", result["seen"], "")
    check("the user feature override is present", "red jacket" in calls[-1]["message"], True)
    check("the source feature is still described", "blue coat" in calls[-1]["message"], True)
    check("the replacement target is present", "the man by the counter" in calls[-1]["message"], True)
    check("active source notes survive", "front-lit face" in calls[-1]["message"], True)
    check("muted file notes do not leak into the model", "MUTED NOTE" in calls[-1]["message"], False)
    check("muted triggers do not leak into the model", "MUTED WORD" in calls[-1]["message"], False)
    check("muted filenames do not leak into the model", "MUTED.png" in calls[-1]["message"], False)
    check("grounding does not mutate asset or cast state", grounded, before_grounded)
finally:
    route._picture = was_picture

local_asset = {**piece(), "segments": [{"prompt": "use @img-7", "duration_s": 6,
                                       "assets": [{"handle": "img-7", "kind": "image",
                                                   "role": "reference", "filename": "local.png"}]}]}
route._picture = lambda asset: None
try:
    reply = {"body": "use <Picture 1>"}
    result = route._run(request("segment", data=local_asset, index=0))
    check("single-card ordinals normalize back to stable handles", result["body"], "use @img-7")
    check("valid single-card reference is accepted", result["problems"], [])
    result = route._run(request(data=local_asset))
    check("global fields do not adopt a card-local ordinal", result["body"], "use <Picture 1>")
    check("a global card-local ordinal is reported", bool(result["problems"]), True)
finally:
    route._picture = was_picture

# The family pin and add/replace modes are not hidden casualties of isolation.
reply = {"body": "LTX field"}
body = request(data=piece("ltx25"), template="T2V")
result = route._run(body)
check("the piece family writes the field", result["template"], "T2V")
check("family-specific craft remains in the prompt", "LTX" in calls[-1]["system"], True)

skill = {"name": "fixture.md", "kind": "prompt", "mode": "add", "files": [],
         "text": "USER CRAFT", "instructions": "USER CRAFT"}
was_load = route.refine_skill.load
was_instructions = route.refine_skill.instructions
was_system = route.refine_skill.system_prompt
route.refine_skill.load = lambda name: skill
route.refine_skill.instructions = lambda item: "USER CRAFT"
route.refine_skill.system_prompt = lambda item: "SKILL REPLACES THE FAMILY"
try:
    reply = {"body": "added field"}
    route._run(request(skill="fixture.md", skill_mode="add"))
    check("add keeps the user's instructions", "USER CRAFT" in calls[-1]["system"], True)
    check("add keeps the one-field contract", "SINGLE FIELD ONLY" in calls[-1]["system"], True)
    reply = "skill field prose"
    result = route._run(request("segment", skill="fixture.md", skill_mode="replace"))
    check("replace keeps its raw document reply", result["body"], "skill field prose")
    check("replace remains the selected skill", result["skill"], "fixture.md")
    check("replace does not silently use the built-in harness",
          "<skill_reference>\nUSER CRAFT\n</skill_reference>" in calls[-1]["system"], True)
    check("replace still owns exactly one field", "SINGLE FIELD ONLY" in calls[-1]["system"], True)
    check("replace does not use JSON prefill", calls[-1]["options"]["prefill"], "")
finally:
    route.refine_skill.load = was_load
    route.refine_skill.instructions = was_instructions
    route.refine_skill.system_prompt = was_system

reply = {"body": "remote field"}
route._run(request(backend="remote", eject=True))
check("remote unload option survives", calls[-1]["options"].get("eject"), True)

# The three editable inputs have distinct ownership. Subject definitions and
# inherited Cast blocks are read-only, even when they share the visible panel.
three = piece()
three["subjects"] = [{"handle": "anna", "from": [], "description": "the performer"}]
three["segments"][1]["prompt"] = "subject_definitions:\n@anna is the performer.\n\ndetailed_description:\nCard one motion."
three["segments"][1]["prompt_sections"] = {
    "summary": "Make a closeup of @anna.", "retention_analysis": "legacy manual rule"}
three["segments"][1]["retention_blocks"] = [
    {"type": "subject", "handle": "anna"},
    {"type": "text", "text": "@anna: retain face and hair."}]
for field, expected in (("summary", "Make a closeup of @anna."),
                        ("retention_analysis", "@anna: retain face and hair."),
                        ("prompt", "Card one motion.")):
    reply = {"body": "rewritten " + field}
    before = copy.deepcopy(three)
    result = route._run(request("segment", field, data=three))
    check(field + " reads only its original selected input",
          "FIELD TO REWRITE: " + ("detailed_description" if field == "prompt" else field)
          + "\n<request>\n" + expected + "\n</request>" in calls[-1]["message"], True)
    check(field + " returns only its own field", result["field"], field)
    check(field + " does not mutate subject definitions or neighboring values", three, before)

translated = piece()
translated["prompt"] = "흐린 오후의 자연광."
translated["soundscape"] = "지붕에 빗방울이 떨어진다."
translated["music"] = "잔잔한 피아노 연주."
translated["segments"][1].update({"prompt": '카메라가 천천히 접근한다. 간판에는 "열림"이라고 적혀 있다.',
                                  "prompt_sections": {"summary": "고양이가 창가에서 잠든다.",
                                                      "retention_analysis": "고양이의 무늬를 유지한다."}})
for scope, field in (("segment", "summary"), ("segment", "retention_analysis"),
                     ("segment", "prompt"), ("timeline", "prompt"),
                     ("timeline", "soundscape"), ("timeline", "music")):
    reply = {"body": "English rewrite"}
    body = request(scope, field, data=translated, language="English")
    result = route._run(body)
    call = calls[-1]
    selected = route._field_target(body)[-1]
    check(f"{scope}/{field} wraps the real input without inventing quote preservation",
          "<request>\n" + selected + "\n</request>" in call["message"], True)
    check(f"{scope}/{field} explicitly requests English even for Korean input",
          "Write descriptive prose in English" in call["system"]
          and "Write descriptive prose in English" in call["message"], True)
    check(f"{scope}/{field} has no competing whole-video audio instruction",
          "Always write `overall_soundscape`" in call["system"], False)
    check(f"{scope}/{field} has no competing whole-video expansion example",
          "H3-Context-IR module" in call["system"], False)
    check(f"{scope}/{field} preserves actual quoted content only",
          "actual quoted dialogue" in call["system"], True)
    unrelated = [translated["prompt"], translated["soundscape"], translated["music"],
                 *route._segment_fields(translated["segments"][1], "h3").values()]
    check(f"{scope}/{field} cannot borrow prose from any sibling input",
          any(text in call["message"] for text in unrelated if text != selected), False)
    check(f"{scope}/{field} returns the chosen ownership with the rewritten text",
          (result["field"], result["body"]), (field, "English rewrite"))

reply = {"body": "Refined motion.",
         "sections": {"summary": "Refined card one summary.",
                      "retention_analysis": "@anna: retain face and hair."}}
before = copy.deepcopy(three)
whole = route._run(request("segment", "segment", data=three))
check("whole-card returns all three outputs together",
      (whole["index"], whole["body"], whole["sections"]),
      (1, "Refined motion.", reply["sections"]))
check("whole-card does not return subject definitions", "subject_definitions" in whole["sections"], False)
check("whole-card leaves the complete request unchanged", three, before)
check("whole-card explicitly owns only the selected card", "SINGLE CARD ONLY" in calls[-1]["system"], True)
check("whole-card never includes the other card's previous rewrite",
      "existing effective zero" in calls[-1]["message"], False)

# Refining 2 and then 1 cannot put the accepted result from 2 into 1's input.
three["segments"][1]["refined"] = {"body": "UNIQUE_ACCEPTED_SECOND_REWRITE"}
three["segments"][0]["prompt_sections"] = {"summary": "First card summary."}
reply = {"body": "First card motion.", "sections": {"summary": "First card summary.", "retention_analysis": ""}}
route._run(request("segment", "segment", data=three, index=0))
check("2 then 1 keeps the accepted second rewrite out of the first request",
      "UNIQUE_ACCEPTED_SECOND_REWRITE" in calls[-1]["message"], False)
check("2 then 1 does not expose second-card raw prompt prose",
      "Card one motion." in calls[-1]["message"], False)

empty = piece()
empty["segments"][1]["prompt"] = ""
for field in ("prompt", "summary", "retention_analysis", "segment"):
    before_calls = len(calls)
    result = route._run(request("segment", field, data=empty))
    check("empty " + field + " remains empty without an LLM call", len(calls), before_calls)
    check("empty " + field + " is marked as an unchanged input", result["unchanged"], True)
    check("empty " + field + " has no invented body", result["body"], "")

partial = piece()
partial["segments"][1]["prompt_sections"] = {"summary": ""}
reply = {"body": "Requested motion.", "sections": {"summary": "Unasked summary", "retention_analysis": "Invented wardrobe rule"}}
result = route._run(request("segment", "segment", data=partial))
check("whole-card leaves empty fields empty even if an LLM fills them", result["sections"],
      {"summary": "", "retention_analysis": ""})

for bad in ({"body": "ok", "sections": {"summary": "incomplete"}},
            {"body": "ok", "sections": {"summary": "s", "retention_analysis": "r", "subject_definitions": "bad"}},
            {"body": "ok", "sections": {"summary": "s", "retention_analysis": "r"}, "piece": "global overwrite"}):
    reply = bad
    try:
        route._run(request("segment", "segment", data=three))
    except route.refine.RefineError:
        check("invalid whole-card output is rejected atomically " + str(bad), True, True)
    else:
        check("invalid whole-card output is rejected atomically " + str(bad), False, True)

reply = {"body": "subject_definitions:\n@anna is a newly invented person."}
try:
    route._run(request("segment", "prompt", data=three))
except route.refine.RefineError as exc:
    check("definition injection cannot hide inside the body", "subject definitions" in str(exc), True)
else:
    check("definition injection cannot hide inside the body", False, True)

all_piece = piece()
all_piece["prompt"] = "자연광을 유지한다."
all_piece["soundscape"], all_piece["music"] = "N/A", ""
for index, segment in enumerate(all_piece["segments"]):
    segment["prompt"] = f"카드 {index}의 움직임"
    segment["prompt_sections"] = {"summary": f"카드 {index}의 요약", "retention_analysis": f"카드 {index}의 유지 규칙"}
    segment["refined"] = {"body": "POISON_PREVIOUS_REWRITE", "sections": {"summary": "POISON_PREVIOUS_SUMMARY"}}
all_piece["segments"].insert(1, {"kind": "clip", "duration_s": 2, "filename": "fixture.mp4"})
all_reply = {"global_prompt": "Keep natural daylight.", "overall_soundscape": "N/A", "non_diegetic_music": "",
             "shots": [{"index": index, "body": f"English movement {index}.",
                        "sections": {"summary": f"English summary {index}.",
                                     "retention_analysis": f"English retention {index}."}} for index in (0, 2)]}
reply = all_reply
before, before_calls = copy.deepcopy(all_piece), len(calls)
result = route._run(request("timeline", "all", data=all_piece, language="English"))
check("Refine all makes exactly one backend call", len(calls), before_calls + 1)
check("Refine all declares its distinct ownership", (result["scope"], result["target_scope"], result["field"]),
      ("shot", "timeline", "all"))
check("Refine all keeps exact generated-card indices around supplied footage", [item["index"] for item in result["shots"]], [0, 2])
check("Refine all returns three explicit owned fields per generated card",
      [item["fields"] for item in result["shots"]], [["prompt", "summary", "retention_analysis"]] * 2)
check("Refine all rewrites selected globals and honors explicit absent sound/music",
      (result["piece"], result["soundscape"], result["music"]), ("Keep natural daylight.", "N/A", ""))
check("Refine all source values are read-only", all_piece, before)
check("Refine all never feeds prior accepted prose back into other cards",
      "POISON_PREVIOUS_" in calls[-1]["message"], False)
check("Refine all shows original source values once each",
      all(calls[-1]["message"].count(text) == 1 for segment in (all_piece["segments"][0], all_piece["segments"][2])
          for text in route._segment_fields(segment, "h3").values()), True)
check("Refine all explicitly asks for English", "Write descriptive prose in English" in calls[-1]["system"], True)

for label, change in (
    ("missing card", lambda data: data["shots"].pop()),
    ("duplicate index", lambda data: data["shots"][1].update(index=0)),
    ("wrong index", lambda data: data["shots"][1].update(index=1)),
    ("boolean index", lambda data: data["shots"][0].update(index=False)),
    ("missing field", lambda data: data["shots"][0]["sections"].pop("summary")),
    ("invented definitions", lambda data: data["shots"][0]["sections"].update(subject_definitions="bad")),
    ("invalid global type", lambda data: data.update(global_prompt=[])),
    ("absent sound replaced", lambda data: data.update(overall_soundscape="invented sound")),
):
    reply = copy.deepcopy(all_reply)
    change(reply)
    try:
        route._run(request("timeline", "all", data=all_piece))
    except route.refine.RefineError:
        check("Refine all rejects " + label + " atomically", all_piece, before)
    else:
        check("Refine all rejects " + label + " atomically", False, True)

reply = copy.deepcopy(all_reply)
reply["non_diegetic_music"] = "Unasked orchestra."
all_piece["segments"][0]["prompt_sections"]["summary"] = ""
result = route._run(request("timeline", "all", data=all_piece))
check("Refine all keeps empty summary empty", result["shots"][0]["sections"]["summary"], "")
check("Refine all keeps empty global music empty", result["music"], "")

reply = {"global_prompt": "Only global.", "overall_soundscape": "N/A", "non_diegetic_music": "", "shots": []}
for segments in ([], [{"kind": "clip", "duration_s": 2,
                       "clip": {"filename": "fixture.mp4", "duration_s": 2}}]):
    result = route._run(request("timeline", "all", data={**all_piece, "segments": segments}))
    check("Refine all supports global fields without generated cards", result["shots"], [])

before_calls = len(calls)
result = route._run(request("timeline", "all", data={"version": 2, "family": "h3", "segments": []}))
check("an entirely empty Refine all makes no model call", len(calls), before_calls)
check("an entirely empty Refine all returns empty authored fields", (result["piece"], result["soundscape"], result["music"], result["shots"]),
      ("", "", "", []))

# Explicit spoken text is independent from the refiner's prose language.
speech = piece()
speech["subjects"] = [{"handle": "anna", "takes": "person", "description": "a person"}]
speech["segments"][1]["prompt"] = '(S@anna) says: <d>[Korean] <sighs> 안녕하세요.\n반갑습니다.</d>'
reply = {"body": '(S@anna) says warmly: <d>[English] Hello. Nice to meet you.</d>'}
result = route._run(request("segment", data=speech, language="English"))
check("refine keeps the original speech language, words, newlines and inline cues",
      result["body"], '(S@anna) says warmly: <d>[Korean] <sighs> 안녕하세요.\n반갑습니다.</d>')
check("prose translation explicitly excludes authored dialogue blocks",
      "prose language setting does not translate these dialogue blocks" in calls[-1]["system"], True)

reply = {"body": '(S@ben) says: <d>[English] Hello.</d>'}
result = route._run(request("segment", data=speech))
check("a changed speaker cannot be paired with restored dialogue", result["body"], speech["segments"][1]["prompt"])
check("ambiguous dialogue fallback is visible", any("speaker binding" in p for p in result["problems"]), True)

reply = {"body": "The character walks away."}
result = route._run(request("segment", data=speech))
check("dropped dialogue keeps the authored field rather than losing speech", result["body"], speech["segments"][1]["prompt"])

translated_line = '(S@anna) says warmly: <d>[English] Hello.</d>'
expected_line = '(S@anna) says warmly: <d>[Korean] <sighs> 안녕하세요.\n반갑습니다.</d>'
reply = {"body": translated_line, "sections": {"summary": "", "retention_analysis": ""}}
result = route._run(request("segment", "segment", data=speech, language="English"))
check("whole-segment refine preserves explicit speech too", result["body"], expected_line)
reply = {"global_prompt": "Global.", "overall_soundscape": "Room.", "non_diegetic_music": "Music.",
         "shots": [{"index": 0, "body": "Card zero.", "sections": {"summary": "", "retention_analysis": ""}},
                   {"index": 1, "body": translated_line, "sections": {"summary": "", "retention_analysis": ""}}]}
result = route._run(request("timeline", "all", data=speech, language="English"))
check("Refine all preserves each card's own speech", result["shots"][1]["body"], expected_line)
check("speech preservation does not import words into another card", "안녕하세요" in result["shots"][0]["body"], False)

duet = '(S@anna) says: <d>[Korean] 하나.</d> (S@ben) replies: <d>[Japanese] 二。</d>'
reordered = '(S@ben) replies: <d>[English] Two.</d> (S@anna) says: <d>[English] One.</d>'
check("reordered speakers never receive another person's original words",
      route.refine.preserve_dialogue(duet, reordered), (duet, True))
numbered = '(S1) says: <d>[Korean] 하나.</d> (S2) replies: <d>[Japanese] 二。</d>'
numbered_swap = '(S2) replies: <d>[English] Two.</d> (S1) says: <d>[English] One.</d>'
check("standalone official voice numbers protect dialogue ownership too",
      route.refine.preserve_dialogue(numbered, numbered_swap), (numbered, True))
spaced_group = '(S1, S2) say together: <d>[Korean] 함께.</d>'
changed_group = '(S3, S4) say together: <d>[English] Together.</d>'
check("spaced compound speaker IDs protect dialogue ownership",
      route.refine.preserve_dialogue(spaced_group, changed_group), (spaced_group, True))
check("spaced compound speaker ID formatting is normalized",
      route.refine.preserve_dialogue(spaced_group, '(S1,S2) say together: <d>[English] Together.</d>'),
      ('(S1,S2) say together: <d>[Korean] 함께.</d>', False))
check("a model may still add speech when the user did not author a fixed dialogue block",
      route.refine.preserve_dialogue("Say hello.", '<d>[English] Hello.</d>'),
      ('<d>[English] Hello.</d>', False))
check("a malformed earlier opener cannot absorb a later complete dialogue",
      route.refine.preserve_dialogue('<d>[Korean] unfinished\n<d>[Japanese] 本文</d>',
                                    '<d>[Korean] unfinished\n<d>[English] changed</d>'),
      ('<d>[Korean] unfinished\n<d>[Japanese] 本文</d>', False))

# Exercise the shipped package, not just a one-line skill stub. This captures
# the actual messages sent to either transport without loading a model.
package = route.refine_skill.load("minimax-h3-prompt")
package_text = route.refine_skill.instructions(package)
skill_piece = piece()
for segment in skill_piece["segments"]:
    segment["prompt_sections"] = {"summary": "한 사람이 걷는다.", "retention_analysis": "얼굴을 유지한다."}
for backend in ("local", "remote"):
    for skill_mode in ("add", "replace"):
        for scope, field in (("timeline", "prompt"), ("timeline", "soundscape"),
                             ("timeline", "music"), ("segment", "summary"),
                             ("segment", "retention_analysis"), ("segment", "prompt"),
                             ("segment", "segment"), ("timeline", "all")):
            label = f"shipped skill {backend}/{skill_mode}/{scope}/{field}"
            if field == "all":
                reply = {"global_prompt": "Global.", "overall_soundscape": "Room.", "non_diegetic_music": "Score.",
                         "shots": [{"index": index, "body": "Walk.",
                                    "sections": {"summary": "Walking.", "retention_analysis": "Keep face."}}
                                   for index in range(2)]}
            elif field == "segment":
                reply = {"body": "Walk.", "sections": {"summary": "Walking.", "retention_analysis": "Keep face."}}
            else:
                reply = "Walk." if skill_mode == "replace" else {"body": "Walk."}
            body = request(scope, field, data=skill_piece, backend=backend, skill="minimax-h3-prompt",
                           skill_mode=skill_mode, reference_images=False, temperature=0.05, max_tokens=6144,
                           language="English")
            original = copy.deepcopy(body)
            route._run(body)
            sent = calls[-1]
            check(label + " includes the whole original package", package_text in sent["system"], True)
            check(label + " distinguishes the package from the active output contract",
                  "<skill_reference>" in sent["system"] and "</skill_reference>" in sent["system"], True)
            check(label + " omits the old fill-missing-information runtime note",
                  route.refine_skill.RUNTIME_NOTE in sent["system"], False)
            check(label + " explains scoped precedence before the package",
                  sent["system"].index("take precedence") < sent["system"].index(package_text), True)
            check(label + " keeps English and sampling settings",
                  ("Write descriptive prose in English" in sent["system"],
                   sent["options"]["temperature"], sent["options"]["max_tokens"]), (True, 0.05, 6144))
            check(label + " does not alter authored inputs", body, original)

passed("all field refine contracts passed (isolated backend; no model, queue, disk or GPU)")
