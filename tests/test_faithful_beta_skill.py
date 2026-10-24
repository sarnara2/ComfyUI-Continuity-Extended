"""The optional faithful skill reaches the real, scoped refine transport.

These are prompt/transport contracts with a captured model call, not claims
that a model obeys the prompt. No model, server, queue, image read or GPU runs.
Run standalone: python -B tests/test_faithful_beta_skill.py
"""

import copy
import hashlib
import json
import sys
import types
from pathlib import Path

import layout
from harness import check, passed


PACKAGE = "faithfulbetacontracts"
NAME = "minimax-h3-faithful-beta"
layout.stub_server()
pkg = layout.load("compile", "prompting", "refine_skill", package=PACKAGE)

# Only the edge transports are inert. The loader, compiler, scope selection,
# input assembly and reply validation below are the installed product code.
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
answer = {"body": "Rewritten."}


def chat(model, system, message, images, **options):
    calls.append({"model": model, "system": system, "message": message,
                  "images": images, "options": options})
    return answer if isinstance(answer, str) else json.dumps(answer, ensure_ascii=False)


pkg.refine_local.chat = chat
pkg.refine_local.to_tensor = lambda image: ("local", image)
pkg.refine_remote.chat = chat
pkg.refine_remote.to_data_url = lambda image: ("remote", image)
route._picture = lambda asset: (_ for _ in ()).throw(AssertionError("unexpected image read"))


def piece():
    return {"version": 2, "family": "h3", "models": {},
            "prompt": "전역 자연광을 유지한다.",
            "soundscape": "처마에 빗방울이 떨어진다.", "music": "잔잔한 피아노 연주.",
            "subjects": [{"handle": "subject", "takes": "person", "description": "CAST_ONLY_IDENTITY"},
                         {"handle": "subject_2", "takes": "person", "description": "CAST_OTHER_IDENTITY"}],
            "segments": [
                {"prompt": "첫 카드에서 램프가 꺼진다.", "duration_s": 6, "assets": [],
                 "prompt_sections": {"summary": "첫 카드의 램프.", "retention_analysis": "램프 모양을 유지한다."},
                 "refined": {"body": "POISON_ACCEPTED_FIRST", "sections": {"summary": "POISON_FIRST_SUMMARY"}}},
                {"prompt": "@subject 가 천천히 손을 든다.", "duration_s": 6, "assets": [],
                 "prompt_sections": {"summary": "[reference generation] @subject 가 손을 든다.",
                                     "retention_analysis": ""},
                 "retention_blocks": [{"type": "subject", "handle": "subject"},
                                      {"type": "text", "text": "@subject: 얼굴과 머리카락을 유지한다."}],
                 "refined": {"body": "POISON_ACCEPTED_SECOND", "sections": {"summary": "POISON_SECOND_SUMMARY"}}}]}


def request(scope="segment", field="prompt", data=None, **overrides):
    return {"kind": "field", "scope": scope, "field": field,
            "index": 1 if scope == "segment" else None, "data": data or piece(),
            "model": "capture-only", "backend": "local", "language": "English",
            "seed": 61, "temperature": 0.05, "max_tokens": 6144,
            "reference_images": False, "template": "auto", "skill": NAME,
            **overrides}


def owned_reply(field, mode):
    if field == "all":
        return {"global_prompt": "Keep natural daylight.", "overall_soundscape": "Rain on the eaves.",
                "non_diegetic_music": "Gentle piano.",
                "shots": [{"index": index, "body": f"Rewritten own movement {index}.",
                           "sections": {"summary": f"Own summary {index}.",
                                        "retention_analysis": f"Own keep rule {index}."}}
                          for index in range(2)]}
    if field == "segment":
        return {"body": "@subject slowly raises a hand.",
                "sections": {"summary": "[reference generation] @subject raises a hand.",
                             "retention_analysis": "@subject: retain the face and hair."}}
    return "Rewritten." if mode == "replace" else {"body": "Rewritten."}


entries = {item["name"]: item for item in pkg.refine_skill.entries()}
check("new package is a separate, discoverable skill", entries.get(NAME),
      {"name": NAME, "kind": "skill", "mode": "replace"})
check("the original skill remains discoverable", "minimax-h3-prompt" in entries, True)
beta = pkg.refine_skill.load(NAME)
beta_text = pkg.refine_skill.instructions(beta)
check("beta package has no bundled generative guide files", beta["files"], [])
check("loader strips metadata, not the guidance", beta["body"].startswith("# Faithful refine"), True)
check("compact skill contains no old mandatory word-count target", "350" in beta_text or "500" in beta_text, False)
check("skill contains no auto-created full-document schema", "subject_definitions:" in beta_text, False)
check("skill contains no forced translated companion output", "Korean translation" in beta_text, False)

# Treat these explicit safety requirements as package contracts. Message tests
# below additionally prove that the real route actually delivers the package.
for requirement in (
    "There is no word-count target", "Empty selected inputs stay empty", "Explicit `N/A` remains `N/A`",
    "do not invent a task from file type alone", "Videos may contain no people",
    "Do not create Subject definitions", "Other cards, global fields",
    "Do not add the camera holder's body", "Do not infer event timestamps from the total clip duration",
    "Source-video performance, frame references, appearance references and audio references are different roles",
    "Preserve every authored `<d>[Language] ...</d>` block exactly", "Keep the node's `(S@handle)` speaker bindings exactly",
):
    check("beta rule: " + requirement, requirement.casefold() in beta_text.casefold(), True)

old_path = Path(pkg.refine_skill.SKILLS_DIR) / "minimax-h3-prompt.skill"
old_hash = hashlib.sha256(old_path.read_bytes()).hexdigest()
old = pkg.refine_skill.load("minimax-h3-prompt")
old_text = pkg.refine_skill.instructions(old)
check("beta and original are different instructions", beta_text == old_text, False)
check("original bundled files remain available", bool(old["files"]), True)

# Both transports and both explicit modes must include the same new guidance
# while preserving the six single inputs, card scope, and all-card ownership.
targets = (("timeline", "prompt"), ("timeline", "soundscape"), ("timeline", "music"),
           ("segment", "summary"), ("segment", "retention_analysis"), ("segment", "prompt"),
           ("segment", "segment"), ("timeline", "all"))
for backend in ("local", "remote"):
    for mode in ("add", "replace"):
        for scope, field in targets:
            label = f"beta {backend}/{mode}/{scope}/{field}"
            answer = owned_reply(field, mode)
            body = request(scope, field, backend=backend, skill_mode=mode)
            before, call_count = copy.deepcopy(body), len(calls)
            result = route._run(body)
            sent = calls[-1]
            check(label + " makes one captured call", len(calls), call_count + 1)
            check(label + " sends complete beta guidance", beta_text in sent["system"], True)
            check(label + " never mixes in the original package", old_text in sent["system"], False)
            check(label + " excludes legacy fill-missing runtime notes",
                  any(note in sent["system"] for note in (pkg.refine_skill.RUNTIME_NOTE, pkg.refine_skill.PROMPT_NOTE)), False)
            check(label + " gives scoped contracts precedence",
                  "take precedence" in sent["system"] and "<skill_reference>" in sent["system"], True)
            check(label + " keeps English prose and independent literal speech",
                  "Write descriptive prose in English" in sent["system"]
                  and "prose language setting does not translate these dialogue blocks" in sent["system"], True)
            check(label + " preserves model and sampling settings",
                  (sent["model"], sent["options"]["temperature"], sent["options"]["seed"], sent["options"]["max_tokens"]),
                  ("capture-only", 0.05, 61, 6144))
            check(label + " cannot look at disabled reference images", sent["images"], [])
            check(label + " keeps authored state immutable", body, before)
            check(label + " excludes all previous refined text", "POISON_" in sent["message"], False)
            if field == "all":
                check(label + " preserves all-card identity/order", [item["index"] for item in result["shots"]], [0, 1])
                check(label + " returns only the three owned fields per card",
                      [item["fields"] for item in result["shots"]], [["prompt", "summary", "retention_analysis"]] * 2)
            elif field == "segment":
                check(label + " owns one card and all its three fields",
                      (result["index"], set(result["sections"])), (1, {"summary", "retention_analysis"}))
                check(label + " cannot read the other card's raw action", "첫 카드에서 램프가 꺼진다." in sent["message"], False)
            else:
                check(label + " returns exactly the requested field owner",
                      (result["field"], result["index"]), (field, 1 if scope == "segment" else None))
                check(label + " has no sibling outputs", bool({"shots", "piece", "sections", "soundscape", "music"} & result.keys()), False)
                selected = (route._segment_fields(body["data"]["segments"][1], "h3")[field]
                            if scope == "segment" else body["data"][field])
                check(label + " includes exactly its original selected input", sent["message"].count(selected), 1)
                sibling_sources = [body["data"][key] for key in ("prompt", "soundscape", "music")]
                sibling_sources += list(route._segment_fields(body["data"]["segments"][1], "h3").values())
                check(label + " does not import sibling field prose",
                      any(text in sent["message"] for text in sibling_sources if text and text != selected), False)

# A package's declared replace mode must really be used when the UI supplies
# no override, rather than only being metadata in the skills list.
answer = "Default replace prose."
result = route._run(request())
check("no override uses the package's declared replace path", result.get("skill"), NAME)
check("default replacement keeps raw prose transport", result["body"], answer)
check("default replacement disables JSON prefill", calls[-1]["options"].get("prefill"), "")

# Language remains a request option, not an English-only instruction copied
# from a historical complete-document skill.
answer = "한국어 문장을 유지한다."
route._run(request(language="Korean"))
check("beta replacement honors Korean prose selection",
      "Write descriptive prose in Korean" in calls[-1]["system"], True)
check("beta contains no competing mandatory English prose setting",
      "Write descriptive prose in English" in calls[-1]["system"], False)

# Empty fields and explicit absence are enforced by the existing route, not
# merely suggested by the new prose. A partial card cannot fill empty slots.
for mode in ("add", "replace"):
    empty = piece()
    empty["segments"][1].update(prompt="", prompt_sections={}, retention_blocks=[])
    for field in ("prompt", "summary", "retention_analysis", "segment"):
        before = len(calls)
        result = route._run(request(field=field, data=empty, skill_mode=mode))
        check(f"{mode}/empty {field} never calls a model", len(calls), before)
        check(f"{mode}/empty {field} returns no invented content", result["body"], "")
    partial = piece()
    partial["segments"][1].update(prompt_sections={}, retention_blocks=[])
    answer = {"body": "@subject raises a hand.",
              "sections": {"summary": "Invented story.", "retention_analysis": "Invented clothing."}}
    result = route._run(request(field="segment", data=partial, skill_mode=mode))
    check(mode + "/whole-card sanitizes unrequested empty fields", result["sections"], {"summary": "", "retention_analysis": ""})
    absent = piece()
    absent["music"] = "N/A"
    answer = "N/A" if mode == "replace" else {"body": "N/A"}
    check(mode + "/explicit N/A remains absent", route._run(request("timeline", "music", data=absent, skill_mode=mode))["body"], "N/A")
    answer = "Invented orchestra." if mode == "replace" else {"body": "Invented orchestra."}
    try:
        route._run(request("timeline", "music", data=absent, skill_mode=mode))
    except route.refine.RefineError as exc:
        check(mode + "/cannot replace explicit N/A", "explicit N/A" in str(exc), True)
    else:
        check(mode + "/cannot replace explicit N/A", False, True)

# The all-card validator stays strict even though replacement skills can use
# raw prose for individual inputs. Invalid scopes must not be silently applied
# to a neighboring card or converted into a partial multi-field update.
for mode in ("add", "replace"):
    valid = owned_reply("all", mode)
    for label, change in (
        ("wrong card owner", lambda data: data["shots"][1].update(index=0)),
        ("missing card", lambda data: data["shots"].pop()),
        ("missing field", lambda data: data["shots"][0]["sections"].pop("summary")),
        ("extra identity field", lambda data: data["shots"][0]["sections"].update(subject_definitions="invention")),
        ("extra global field", lambda data: data.update(subject_definitions="invention")),
    ):
        answer = copy.deepcopy(valid)
        change(answer)
        body = request("timeline", "all", skill_mode=mode)
        before = copy.deepcopy(body)
        try:
            route._run(body)
        except route.refine.RefineError:
            check(mode + "/all rejects " + label + " without state mutation", body, before)
        else:
            check(mode + "/all rejects " + label, False, True)
    empty = {"version": 2, "family": "h3", "prompt": "", "soundscape": "", "music": "", "segments": []}
    before_calls = len(calls)
    result = route._run(request("timeline", "all", data=empty, skill_mode=mode))
    check(mode + "/empty all does not call the model", len(calls), before_calls)
    check(mode + "/empty all returns exactly empty owned inputs",
          (result["piece"], result["soundscape"], result["music"], result["shots"]), ("", "", "", []))

# Canonical stored retention text is selected, not a generated description of
# the cast, typed binding label, or a stale accepted rewrite. Definition
# injection is rejected in both modes, independent of prompt compliance.
for mode in ("add", "replace"):
    answer = "@subject: retain the face and hair." if mode == "replace" else {"body": "@subject: retain the face and hair."}
    result = route._run(request(field="retention_analysis", skill_mode=mode))
    check(mode + "/bound retention source uses the stable handle",
          "<request>\n@subject: 얼굴과 머리카락을 유지한다.\n</request>" in calls[-1]["message"], True)
    check(mode + "/retention result stays a canonical user rule", result["body"], "@subject: retain the face and hair.")
    check(mode + "/retention does not become Subject definitions", "subject_definitions:" in result["body"], False)
    injected = "subject_definitions:\n@subject is a different person."
    answer = injected if mode == "replace" else {"body": injected}
    try:
        route._run(request(field="retention_analysis", skill_mode=mode))
    except route.refine.RefineError as exc:
        check(mode + "/definition injection rejected", "subject definitions" in str(exc), True)
    else:
        check(mode + "/definition injection rejected", False, True)

# English prose must not translate the user's Korean line or transfer it to a
# different actor. This runs the actual final result sanitizer, not a clone.
spoken = '(S@subject) says: <d>[Korean] <sighs> 안녕하세요.\n반갑습니다.</d>'
rewritten = '(S@subject) says softly: <d>[English] Hello.</d>'
expected = '(S@subject) says softly: <d>[Korean] <sighs> 안녕하세요.\n반갑습니다.</d>'
speech = piece()
speech["segments"][1]["prompt"] = spoken
for mode in ("add", "replace"):
    answer = rewritten if mode == "replace" else {"body": rewritten}
    check(mode + "/exact authored speech survives English prose refine",
          route._run(request(data=speech, skill_mode=mode))["body"], expected)
    wrong = '(S@subject_2) says: <d>[English] Hello.</d>'
    answer = wrong if mode == "replace" else {"body": wrong}
    result = route._run(request(data=speech, skill_mode=mode))
    check(mode + "/changed speaker keeps the original owned field", result["body"], spoken)
    check(mode + "/changed speaker fallback visible", any("speaker binding" in item for item in result["problems"]), True)

# The old option remains fully loaded and usable after exercising the new one.
answer = "Original selected prose."
result = route._run(request(skill="minimax-h3-prompt", skill_mode="replace"))
check("old option still routes as its own skill", result.get("skill"), "minimax-h3-prompt")
check("old option delivers its untouched original instructions", old_text in calls[-1]["system"], True)
check("old option does not inherit beta guidance", beta_text in calls[-1]["system"], False)
check("all test calls leave the original package bytes unchanged", hashlib.sha256(old_path.read_bytes()).hexdigest(), old_hash)

passed("faithful beta skill contracts passed (actual scoped routes; mocked backend; no model or GPU)")
