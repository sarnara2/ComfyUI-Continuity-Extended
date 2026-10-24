"""Reference image analysis is an input policy, never a generation-file edit.

Run standalone: python -B tests/test_refine_visual_input.py
Only CPU contracts: real compile/refine paths, inert media/model/queue edges.
"""

import copy
import json
import sys
import types

import layout
from harness import check, passed


PACKAGE = "visualrefinecontracts"
layout.stub_server()
pkg = layout.load("compile", "prompting", package=PACKAGE)
for name in ("jobs", "media", "preview", "refine_local", "refine_remote", "guard"):
    stub = types.ModuleType(f"{PACKAGE}.{name}")
    setattr(pkg, name, stub)
    sys.modules[stub.__name__] = stub
pkg.jobs.register = lambda *args: None
pkg.jobs.JobError = type("JobError", (RuntimeError,), {})
pkg.media.MediaError = type("MediaError", (RuntimeError,), {})
pkg.guard.same_origin = lambda fn: fn
route = layout.load("refine_routes", package=PACKAGE).refine_routes

calls, decoded, sized, converted = [], [], [], []
reply = {"body": "@anna walks past @scene.", "what_i_see": "UNREQUESTED_IMAGE_READOUT"}


def chat(model, system, message, images, **options):
    calls.append({"system": system, "message": message, "images": images, "options": options})
    return reply if isinstance(reply, str) else json.dumps(reply)


def picture(asset):
    decoded.append(asset.filename)
    return None if asset.kind == "audio" else asset.filename


def size(filename):
    sized.append(filename)
    return (960, 640)


def convert(backend, image):
    converted.append((backend, image))
    return (backend, image)


route._picture = picture
pkg.media.image_size = size
pkg.refine_local.chat = pkg.refine_remote.chat = chat
pkg.refine_local.to_tensor = lambda image: convert("local", image)
pkg.refine_remote.to_data_url = lambda image: convert("remote", image)


def asset(handle, kind="image", role="reference", **extra):
    return {"handle": handle, "kind": kind, "role": role,
            "filename": handle + {"image": ".png", "video": ".mp4", "audio": ".wav"}[kind], **extra}


def piece():
    return {"version": 2, "family": "h3", "aspect": "16:9", "aspect_source": "auto",
            "prompt": "Standing style for @anna in @scene.", "soundscape": "Rain.", "music": "Piano.",
            "assets": [asset("face", description="AUTHORED_FACE_DESCRIPTION", usage_rules="AUTHORED_FACE_RULE"),
                       asset("scene", takes="scene", description="AUTHORED_SCENE_DESCRIPTION", usage_rules="AUTHORED_SCENE_RULE"),
                       asset("source", "video", takes="edit"), asset("voice", "audio", takes="voice"),
                       asset("muted", enabled=False)],
            "subjects": [{"handle": "anna", "from": ["face"], "description": "AUTHORED_CAST_DESCRIPTION",
                          "usage_rules": "AUTHORED_CAST_RULE", "notes": {"face": "AUTHORED_CAST_NOTE"}}],
            "segments": [{"prompt": "@anna walks through @scene in @source with @voice.", "duration_s": 6,
                          "prompt_sections": {"summary": "@anna walks.", "retention_analysis": "Retain @anna."},
                          "assets": [asset("first", role="first_frame"), asset("last", role="last_frame")]},
                         {"prompt": "@anna stops by @scene.", "duration_s": 6, "assets": [],
                          "prompt_sections": {"summary": "@anna stops.", "retention_analysis": "Keep @scene."}}]}


def request(scope="segment", field="summary", data=None, **extra):
    return {"kind": "field", "scope": scope, "field": field, "index": 0,
            "data": piece() if data is None else data, "model": "fixture-model", "language": "English",
            "temperature": 0.1, "seed": 23, "max_tokens": 2048, **extra}


def clear():
    calls.clear()
    decoded.clear()
    sized.clear()
    converted.clear()


def assert_off(label, body):
    clear()
    before = copy.deepcopy(body)
    result = route._run(body)
    check(label + " no image/video/keyframe decoding", decoded, [])
    check(label + " no media dimension reads", sized, [])
    check(label + " no backend image conversion", converted, [])
    check(label + " no image attachments", calls[-1]["images"], [])
    check(label + " no invented seen readout", result["seen"], "")
    check(label + " no input or generation-reference mutation", body, before)
    check(label + " explicit system text-only contract", "REFERENCE IMAGE ANALYSIS IS OFF" in calls[-1]["system"], True)
    check(label + " explicit message text-only contract", "REFERENCE IMAGE ANALYSIS IS OFF" in calls[-1]["message"], True)
    check(label + " no attached image ordinal", "[image " in calls[-1]["message"] or "[attached image " in calls[-1]["message"], False)
    check(label + " no unreadable/limit warnings",
          any("could not be read" in text or "not shown" in text for text in result["problems"]), False)
    return result


# Existing workflows default to ON; explicit ON is byte-equivalent at the model boundary.
clear()
route._run(request())
default_call, default_decoded = copy.deepcopy(calls[-1]), list(decoded)
clear()
route._run(request(reference_images=True))
check("explicit ON matches existing default request", calls[-1], default_call)
check("explicit ON matches existing decode set", decoded, default_decoded)
check("ON includes video still and both keyframes",
      {"source.mp4", "first.png", "last.png"}.issubset(decoded), True)
check("ON excludes disabled files", "muted.png" in decoded, False)
check("ON sends nonempty pixels", bool(calls[-1]["images"]), True)
check("ON uses original backend sampling choices", calls[-1]["options"],
      {"temperature": 0.1, "seed": 23, "max_tokens": 2048})

for scope, field in (("segment", "summary"), ("segment", "retention_analysis"), ("segment", "prompt"),
                     ("timeline", "prompt"), ("timeline", "soundscape"), ("timeline", "music")):
    for backend in ("local", "remote"):
        assert_off(f"{backend}/{scope}/{field}", request(scope, field, backend=backend, eject=True, reference_images=False))
        for token in ("AUTHORED_FACE_DESCRIPTION", "AUTHORED_FACE_RULE", "AUTHORED_SCENE_DESCRIPTION", "AUTHORED_SCENE_RULE",
                      "AUTHORED_CAST_DESCRIPTION", "AUTHORED_CAST_RULE", "AUTHORED_CAST_NOTE", "@scene"):
            check(f"{scope}/{field} preserves text {token}", token in calls[-1]["message"], True)
        check(f"{backend}/{scope}/{field} keeps selected English", "Write descriptive prose in English" in calls[-1]["system"], True)
        if backend == "remote":
            check("remote eject choice remains intact", calls[-1]["options"].get("eject"), True)

reply = {"body": "@anna walks past @scene.", "sections": {"summary": "@anna walks.", "retention_analysis": "Retain @anna."},
         "what_i_see": "UNREQUESTED_IMAGE_READOUT"}
assert_off("whole segment", request(field="segment", reference_images=False))

reply = {"global_prompt": "Standing style.", "overall_soundscape": "Rain.", "non_diegetic_music": "Piano.",
         "shots": [{"index": i, "body": "@anna moves.",
                    "sections": {"summary": "@anna moves.", "retention_analysis": "Retain @anna."}} for i in range(2)],
         "what_i_see": "UNREQUESTED_IMAGE_READOUT"}
assert_off("Refine all", request("timeline", "all", reference_images=False))

# Empty/clip-only timelines bypass _plan; their reference pool must use the same gate.
for segments in ([], [{"kind": "clip", "duration_s": 2, "clip": {"filename": "clip.mp4", "duration_s": 2}}]):
    data = {**piece(), "segments": segments}
    reply = {"body": "@anna in @scene.", "what_i_see": "UNREQUESTED_IMAGE_READOUT"}
    assert_off("no generated cards, single global", request("timeline", "prompt", data, reference_images=False))
    reply = {"global_prompt": "Standing style.", "overall_soundscape": "Rain.", "non_diegetic_music": "Piano.",
             "shots": [], "what_i_see": "UNREQUESTED_IMAGE_READOUT"}
    assert_off("no generated cards, Refine all", request("timeline", "all", data, reference_images=False))

# Disabling pixels does not change modes, labels, handles, duration, cast or task roles.
fixtures = []
first = piece()
first["assets"], first["subjects"] = [], []
first["segments"] = [{"prompt": "A garden.", "duration_s": 6, "assets": [asset("first", role="first_frame")]}]
fixtures.append(("first frame", first))
last = piece()
last["segments"][0]["assets"] = [asset("last", role="last_frame")]
fixtures.append(("last frame plus references", last))
video = piece()
video["segments"][0]["assets"] = []
fixtures.append(("video editing references", video))
merged = piece()
merged["segments"][1]["merge"] = True
merged["segments"][1]["assets"] = [merged["segments"][0]["assets"].pop()]
fixtures.append(("merged pass", merged))
for label, data in fixtures:
    base = {"kind": "timeline", "data": data}
    on = route._plan(base)
    off = route._plan({**base, "reference_images": False})
    check(label + " representative mode unchanged", off[1], on[1])
    check(label + " single/pass state unchanged", off[5], on[5])
    for enabled, disabled in zip(on[2], off[2]):
        for key in ("mode", "seconds", "continues", "labels", "handles", "refs"):
            check(label + " keeps " + key, disabled[key], enabled[key])
        check(label + " keeps cast text and identity mapping",
              route._field_context([], disabled["cast"], disabled["handles"])["cast"],
              route._field_context([], enabled["cast"], enabled["handles"])["cast"])
        check(label + " keeps all slot roles", [s["what"] for s in disabled["slots"]], [s["what"] for s in enabled["slots"]])

# Legacy creator/segment/timeline requests share the exact same image policy.
reply = {"shots": ["@anna moves."], "summary": "@anna moves.", "what_i_see": "UNREQUESTED_IMAGE_READOUT"}
assert_off("legacy segment", {"kind": "segment", "index": 0, "data": piece(), "reference_images": False})
legacy = {"version": 1, "prompt": "A garden.", "duration_s": 6, "assets": [asset("first", role="first_frame")]}
assert_off("retired creator", {"kind": "creator", "data": legacy, "reference_images": False})
reply = {"shots": ["@anna walks.", "@anna stops."], "piece": "Standing style.", "what_i_see": "UNREQUESTED_IMAGE_READOUT"}
assert_off("legacy timeline", {"kind": "timeline", "data": piece(), "reference_images": False})

# Add and replace skills obey the same policy without being silently switched off.
skill = {"name": "fixture.md", "kind": "prompt", "mode": "add", "text": "USER SKILL"}
route.refine_skill.load = lambda name: skill
route.refine_skill.instructions = lambda item: "USER SKILL"
route.refine_skill.system_prompt = lambda item: "USER SKILL"
for mode in ("add", "replace"):
    reply = {"body": "@anna moves."} if mode == "add" else "@anna moves."
    assert_off("field skill " + mode, request(skill="fixture.md", skill_mode=mode, reference_images=False))
    check("selected field skill remains present", "USER SKILL" in calls[-1]["system"], True)
    reply = {"shots": ["@anna moves."], "summary": "@anna moves."} if mode == "add" else "@anna moves."
    assert_off("legacy skill " + mode, {"kind": "segment", "index": 0, "data": piece(),
               "skill": "fixture.md", "skill_mode": mode, "reference_images": False})
    check("selected legacy skill remains present", "USER SKILL" in calls[-1]["system"], True)

# No artificial unreadable or maximum-image warning merely because OFF was chosen.
crowded = piece()
crowded["assets"] += [asset(f"extra-{i}") for i in range(route.MAX_IMAGES + 4)]
reply = {"body": "@anna moves."}
assert_off("more than image limit", request(data=crowded, reference_images=False))
check("OFF never labels a file unreadable", "file could not be read" in calls[-1]["message"], False)

unreadable = route.compiler.timeline_pool(piece())[0]
slot = route._sighted({"handle": "face", "note": "Original role note"}, unreadable, None)
check("unreadable status preserves authored description", "AUTHORED_FACE_DESCRIPTION" in slot["note"], True)
check("unreadable status preserves authored usage rules", "AUTHORED_FACE_RULE" in slot["note"], True)
check("unreadable status remains explicit", "could not be read" in slot["note"], True)
slot = route._sighted({"handle": "face", "note": "Original role note"}, unreadable, "picture")
dropped, _, _ = route._number([[slot]], ["picture"], 0)
check("capping images preserves authored description", "AUTHORED_FACE_DESCRIPTION" in slot["note"], True)
check("capping images preserves authored usage rules", "AUTHORED_FACE_RULE" in slot["note"], True)
check("capping images still reports omission", dropped, 1)

ltx = {"version": 2, "family": "ltx25", "segments": [{"prompt": "A garden.", "duration_s": 6,
       "assets": [asset("first", role="first_frame")]}]}
assert_off("LTX field keyframe", request(field="prompt", data=ltx, reference_images=False))
check("OFF does not change the selected model family", "LTX25" in calls[-1]["system"], True)

# HTTP local queue and off-queue remote work preserve the boolean unchanged.
route.web.json_response = lambda value, **kwargs: value
submitted = []


async def submit(kind, body, client_id):
    submitted.append((kind, copy.deepcopy(body), client_id))
    return "fixture-job"


class Request:
    def __init__(self, body):
        self.body = body

    async def json(self):
        return self.body


pkg.jobs.submit = submit


remote_work = []


def answer_later(work, client_id=None, expected=()):
    remote_work.append((work, client_id))
    return "fixture-answer"


pkg.jobs.answer_later = answer_later
pkg.jobs.answer_ticket = lambda answer_id: {"answer_id": answer_id, "answer_token": "fixture-receipt"}


def immediate(coroutine):
    # These stubbed async edges never suspend. Do not create an event loop's
    # localhost socket pair merely to test an HTTP body's forwarding contract.
    try:
        coroutine.send(None)
    except StopIteration as done:
        return done.value
    raise AssertionError("unexpected suspension in an isolated route contract")


before_calls = len(calls)
check("running server explicitly advertises image opt-out",
      immediate(route.refine_capabilities(Request({}))), {"reference_images": True})
check("capability check never invokes the model", len(calls), before_calls)

for enabled in (True, False):
    body = request(reference_images=enabled, client_id="fixture-client")
    check("HTTP local queue acknowledgment", immediate(route.refine_prompt(Request(body))), {"prompt_id": "fixture-job"})
    check("HTTP local retains flag and data", submitted[-1], ("refine", body, "fixture-client"))
    clear()
    body = request(reference_images=enabled, backend="remote", client_id="fixture-client")
    before_remote = len(calls)
    response = immediate(route.refine_prompt(Request(body)))
    check("HTTP remote acknowledges before the model runs", response,
          {"answer_id": "fixture-answer", "answer_token": "fixture-receipt"})
    check("HTTP remote does not block on the model", len(calls), before_remote)
    work, client_id = remote_work.pop()
    check("remote result belongs to the requesting tab", client_id, "fixture-client")
    work()
    check("HTTP remote retains image policy", bool(calls[-1]["images"]), enabled)

passed("all visual-input contracts passed (CPU; no actual media/model/queue/GPU)")
