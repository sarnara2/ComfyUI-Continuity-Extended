"""Standing routes agree across LoRA UI, the real preview handler and emit.

Runs without ComfyUI, HTTP, model loading, user settings or GPU work. Only the
unrelated route dependencies and aiohttp's in-memory response are stubbed; the
handler, guard, compiler, Weights routing and frontend state module are real.
"""

from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest

import layout


def load_routes():
    web = types.ModuleType("aiohttp.web")
    web.json_response = lambda value, status=200, **extra: types.SimpleNamespace(
        status=status, text=json.dumps(value), headers=extra.get("headers", {}))
    aiohttp = types.ModuleType("aiohttp")
    aiohttp.web = web
    sys.modules["aiohttp"] = aiohttp
    sys.modules["aiohttp.web"] = web
    sys.modules.setdefault("folder_paths", types.ModuleType("folder_paths"))
    layout.stub_server()
    name = "routing_preview_test"
    pkg = layout.load("compile", "models", "guard", package=name)
    for sibling in ("assets", "crop", "latents", "lift", "lorameta", "media",
                    "refmod", "preview", "settings", "vdn"):
        stub = types.ModuleType(f"{name}.{sibling}")
        sys.modules[stub.__name__] = stub
        setattr(pkg, sibling, stub)
    pkg.media.image_size = lambda *args: (1024, 768)
    pkg.settings.screen_tracker = lambda: {}
    spec = importlib.util.spec_from_file_location(f"{name}.server_routes", layout.py("server_routes"))
    route = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = route
    spec.loader.exec_module(route)
    return route, pkg.compile, pkg.models


routes, compiler, models = load_routes()


def card(identity, reference=False, **extra):
    return {"card_id": identity, "duration_s": 3, "prompt": "a person walks",
            "assets": ([{"handle": "img-1", "kind": "image", "role": "reference",
                         "filename": "reference.png"}] if reference else []),
            "loras": [], **extra}


def piece(cards, route="auto", family="h3"):
    return {"version": 2, "face_schema": 1, "family": family, "render": "chained",
            "aspect": "16:9", "prompt": "", "models": {"route": route},
            "loras": [{"name": "refonly.safetensors", "strength": 1,
                       "modes": ["ref2va"], "triggers": ["REFTOKEN"]},
                      {"name": "plainonly.safetensors", "strength": 1,
                       "modes": ["fl2va"], "triggers": ["PLAINTOKEN"]}],
            "segments": cards}


class Request:
    def __init__(self, body, headers=None):
        self.body = body
        self.headers = {"Content-Type": "application/json", "Host": "127.0.0.1:8188",
                        **(headers or {})}

    async def json(self):
        return self.body


def handler(body, headers=None):
    # These coroutines have no actual I/O. Driving them directly avoids even
    # opening the event loop's socketpair in a restricted test environment.
    pending = routes.compiled_prompt(Request(body, headers))
    try:
        pending.send(None)
    except StopIteration as done:
        return done.value.status, json.loads(done.value.text)
    finally:
        pending.close()
    raise AssertionError("the dry-run handler unexpectedly attempted async I/O")


def rendered(data):
    family = compiler.piece_family(data)
    weights = models.Weights.from_blob(data, {}, routes=compiler.registry.ROUTED.get(family, ()))
    return [weights.routed(payload) for payload in compiler.timeline_payloads(data)]


class RoutingPreview(unittest.TestCase):
    def assert_preview_matches_render(self, data):
        before = deepcopy(data)
        status, preview = handler({"creator_data": data})
        self.assertEqual(status, 200)
        self.assertNotIn("problem", preview)
        actual = rendered(data)
        self.assertEqual(len(preview["passes"]), len(actual))
        for item, payload in zip(preview["passes"], actual):
            if payload.get("clip"):
                self.assertTrue(item["clip"])
                self.assertEqual(item["checkpoint"], "")
                continue
            compiled = compiler.compile_segment(payload, lambda *args: (1024, 768),
                                                 family=compiler.piece_family(data))
            self.assertEqual(item["checkpoint"], compiled.checkpoint)
            self.assertEqual(item["base_prompt"], compiled.prompt)
            self.assertEqual(item["prompt_binding"], compiler.prompt_binding(compiled))
            self.assertEqual(item["loras"], compiler.active_loras(
                payload["request"].get("loras"), compiled.checkpoint, compiler.piece_family(data)))
        self.assertEqual(data, before, "preview must not mutate source prompts or routing")
        return preview

    def test_route_matrix_matches_real_emit_policy(self):
        for route in ("auto", "ref2va", "fl2va"):
            for reference in (False, True):
                for merged in (False, True):
                    with self.subTest(route=route, reference=reference, merged=merged):
                        cards = [card("one"), card("two", reference=reference, merge=merged)]
                        self.assert_preview_matches_render(piece(cards, route))

    def test_forced_ref2va_reads_ref_lora_and_trigger(self):
        preview = self.assert_preview_matches_render(piece([card("one")], "ref2va"))["passes"][0]
        self.assertEqual(preview["mode"], "T2VA")
        self.assertEqual(preview["checkpoint"], "ref2va")
        self.assertEqual([entry["name"] for entry in preview["loras"]], ["refonly.safetensors"])
        self.assertIn("REFTOKEN", preview["prompt"])
        self.assertNotIn("PLAINTOKEN", preview["prompt"])

    def test_clip_and_mixed_card_mapping_stay_intact(self):
        clip = {"kind": "clip", "card_id": "clip", "filename": "kept.mp4", "duration_s": 3}
        for cards in ([clip], [card("one"), clip, card("two")]):
            for route in ("auto", "ref2va", "fl2va"):
                with self.subTest(cards=len(cards), route=route):
                    preview = self.assert_preview_matches_render(piece(cards, route))
                    self.assertEqual(preview["cards"], {str(index): index for index in range(len(cards))})

    def test_nonrouting_family_ignores_stale_h3_route(self):
        for route in ("auto", "ref2va", "fl2va"):
            with self.subTest(route=route):
                preview = self.assert_preview_matches_render(piece([card("one")], route, "ltx25"))
                self.assertEqual(preview["passes"][0]["checkpoint"], "")

    def test_forced_draft_binding_matches_generation_and_retains_tags(self):
        for route in ("ref2va", "fl2va"):
            for merged in (False, True):
                with self.subTest(route=route, merged=merged):
                    cards = [card("one", reference=True), card("two", merge=merged)]
                    data = piece(cards, route)
                    base = self.assert_preview_matches_render(data)
                    members = ["one", "two"] if merged else ["one"]
                    data["prompt_overrides"] = [{"cards": members, "text": base["passes"][0]["prompt"] + "\nTemporary edit.",
                                                 "binding": base["passes"][0]["prompt_binding"]}]
                    preview = self.assert_preview_matches_render(data)
                    self.assertTrue(preview["passes"][0]["overridden"])
                    self.assertIn("Temporary edit.", preview["passes"][0]["prompt"])
                    self.assertEqual(preview["passes"][0]["tags"], base["passes"][0]["tags"])
                    changed = deepcopy(data)
                    changed["models"]["route"] = "fl2va" if route == "ref2va" else "ref2va"
                    status, refused = handler({"creator_data": changed})
                    self.assertEqual(status, 200)
                    self.assertIn("final-prompt draft references changed", refused["problem"])

    def test_real_guard_and_request_validation_stay_active(self):
        self.assertTrue(hasattr(routes.compiled_prompt, "__wrapped__"))
        self.assertEqual(handler({"creator_data": {}}, {"Origin": "https://elsewhere.invalid"})[0], 403)
        self.assertEqual(handler({"creator_data": None})[0], 400)

    def test_frontend_effective_targets_match_rendered_checkpoints(self):
        cases = [piece([card("one"), card("two", reference=True, merge=merged)], route)
                 for route in ("auto", "ref2va", "fl2va") for merged in (False, True)]
        cases += [piece([{"kind": "clip", "card_id": "clip", "filename": "kept.mp4", "duration_s": 3}], "ref2va"),
                  piece([{"kind": "clip", "card_id": "clip", "filename": "kept.mp4", "duration_s": 3}], "ref2va", "ltx25"),
                  piece([card("one")], "ref2va", "ltx25")]
        script = """
const S = await import(process.argv[1]);
const cases = JSON.parse(process.argv[2]);
console.log(JSON.stringify(cases.map(raw => {
  const piece = S.parseTimeline(JSON.stringify(raw));
  const family = S.pieceFamily(piece);
  return {targets: S.timelineCheckpoints(piece),
    global: S.activeGlobalLoras(piece).map(entry => entry.name),
    cards: piece.segments.map(state => {
      const targets = S.effectiveCheckpoints(state, piece);
      const local = {...state, loras: piece.loras};
      return {targets, active: S.activeLoras(local, family, targets).map(entry => entry.name),
        triggers: S.promptTriggers(local, family, targets)};
    })};
})));
"""
        actual = layout.run(script, Path(layout.js("state.js")).as_uri(), cases)
        for data, frontend in zip(cases, actual):
            preview = self.assert_preview_matches_render(data)
            checkpoints = sorted({item["checkpoint"] for item in preview["passes"] if item["checkpoint"]})
            self.assertEqual(sorted(frontend["targets"]), checkpoints)
            for index, ui in enumerate(frontend["cards"]):
                item = preview["passes"][preview["cards"][str(index)]]
                self.assertEqual(ui["targets"], [item["checkpoint"]] if item["checkpoint"] else [])
                expected = [entry["name"] for entry in item.get("loras", [])]
                self.assertEqual(ui["active"], expected if not item["clip"] else [])
                self.assertEqual(ui["triggers"], [word for entry in item.get("loras", []) for word in entry["triggers"]])
                for trigger in ui["triggers"]:
                    self.assertIn(trigger, item["prompt"])
            expected_global = sorted({entry["name"] for item in preview["passes"] for entry in item.get("loras", [])})
            self.assertEqual(sorted(frontend["global"]), expected_global)

    def test_lone_or_prestage_request_uses_its_own_standing_route(self):
        script = """
const S = await import(process.argv[1]);
console.log(JSON.stringify(['auto', 'ref2va', 'fl2va'].map(route => {
  const request = S.parseState(JSON.stringify({prompt:'a portrait', models:{route}}));
  return S.effectiveCheckpoints(request);
})));
"""
        self.assertEqual(layout.run(script, Path(layout.js("state.js")).as_uri()),
                         [["fl2va"], ["ref2va"], ["fl2va"]])


if __name__ == "__main__":
    unittest.main(verbosity=2)
