"""Per-card Face pass migration/ownership; pure compilers, no server or GPU."""
import copy
import json

import layout
from harness import check, passed

compiler = layout.load("compile", package="face_card_ownership").compile
legacy = {"version": 2, "face": {"on": True, "canvas": 640, "denoise": .6},
          "neural": {"on": True, "profile": "natural"}, "music": "N/A",
          "segments": [{"prompt": "one", "duration_s": 5, "face": "on",
                        "take": {"filename": "old.mp4 [output]", "stamp": "old"}},
                       {"prompt": "two", "duration_s": 5, "face": "off"},
                       {"kind": "clip", "filename": "source.mp4", "duration_s": 5}]}
before = copy.deepcopy(legacy)
current = compiler.as_piece(legacy)
check("migration does not mutate caller workflow", legacy, before)
check("legacy global and both card overrides become OFF once",
      [s["face"] for s in current["segments"][:2]],
      [{"on": False, "canvas": 640, "denoise": .6}] * 2)
check("explicit schema survives all-OFF", current["face_schema"], 1)
check("global face removed", "face" in current, False)
check("clips unchanged", current["segments"][2], legacy["segments"][2])
check("take, neural and score preserved",
      (current["segments"][0]["take"], current["neural"], current["music"]),
      (legacy["segments"][0]["take"], legacy["neural"], legacy["music"]))
current["segments"][0]["face"]["on"] = True
check("new schema is idempotent and preserves enabled original",
      compiler.as_piece(current) is current, True)
check("sibling OFF remains independent", current["segments"][1]["face"]["on"], False)
check("enabled card alone resolves full settings",
      compiler.face_for(current, current["segments"][0]),
      {"on": True, "canvas": 640, "denoise": .6})
check("OFF sibling and supplied clip resolve none",
      [compiler.face_for(current, s) for s in current["segments"][1:]], [None, None])
v1 = {"version": 1, "prompt": "old shot", "duration_s": 5,
      "face": {"on": True, "canvas": 512, "denoise": .4}}
check("legacy lone Creator also migrates OFF", compiler.as_piece(v1)["segments"][0]["face"]["on"], False)
newv1 = {**v1, "face_schema": 1}
check("new lone Creator retains per-shot ON", compiler.as_piece(newv1)["segments"][0]["face"]["on"], True)
check("boolean marker cannot skip migration", compiler.as_piece({**legacy, "face_schema": True})["segments"][0]["face"]["on"], False)
check("numeric 1.0 marker matches JavaScript", compiler.as_piece({**current, "face_schema": 1.0})["segments"][0]["face"]["on"], True)
check("unsupported family leaves stored choice dormant",
      compiler.face_for({**current, "family": "ltx25"}, current["segments"][0]), None)
unsupported = {"version": 2, "face_schema": 1, "family": "ltx25",
               "segments": [{"prompt": "one", "duration_s": 5,
                             "face": {"on": True, "canvas": 512, "denoise": .4}}]}
unsupported_payload = compiler.timeline_payloads(unsupported)[0]
check("unsupported family never sends dormant Face to generation",
      "face" in unsupported_payload["request"], False)
check("unsupported family still compiles without hidden Face refusal",
      compiler.compile_segment(unsupported_payload, family="ltx25").face, None)
disagree = {"version": 2, "face_schema": 1,
            "segments": [{"prompt": "one", "duration_s": 5,
                          "face": {"on": True, "canvas": 512, "denoise": .4}},
                         {"prompt": "two", "duration_s": 5, "merge": True,
                          "face": {"on": True, "canvas": 640, "denoise": .4}}]}
try:
    compiler.timeline_payloads(disagree)
except compiler.CompileError as error:
    check("merged ON cards disagreeing on knobs are refused, never auto-split",
          "disagree about the face pass" in str(error), True)
else:
    check("merged settings disagreement must be refused", True, False)
check("single-generation final runtime shape still accepts ON",
      compiler.compile_request({"prompt": "one", "duration_s": 5,
                                "face": {"on": True, "canvas": 512, "denoise": .4}}).face.denoise, .4)

# This includes the actual frontend parser/serializer/synchronizer/clone helper,
# through the catalog mirror rather than a reimplementation of their behavior.
layout.skip_without_node()
script = r'''
const {pathToFileURL} = await import('node:url');
const S = await import(pathToFileURL(process.argv[1]));
const original = S.parseTimeline(process.argv[2]);
const first = original.segments[0];
first.face.on = true;
first.face.canvas = 640;
first.face.denoise = .6;
const clone = S.cloneSegment(first);
clone.face.canvas = 512;
const saved = S.serializeTimeline(original);
const restored = S.parseTimeline(saved);
const lone = S.parseState(JSON.stringify({version:1,face_schema:1,prompt:'one',face:first.face}));
const newShot = S.continuingSegment(original);
const before = JSON.stringify(original);
S.syncTimeline(original);
console.log(JSON.stringify({
  original:first.face, clone:clone.face, restored:restored.segments[0].face,
  distinct:first.face !== clone.face, newOff:newShot.face.on === false,
  marker:JSON.parse(saved).face_schema, global:'face' in JSON.parse(saved),
  detector:S.faceAnywhere(original), sibling:S.faceOn(original,original.segments[1]),
  clip:S.faceOn(original,original.segments[2]), syncPreserved:first.face.on,
  lone:S.parseState(S.serializeState(lone)).face,
  unsupported:S.faceAnywhere({...original,family:'ltx25'}),
  clearWritten:S.pieceWritten({...S.emptyTimeline(),segments:[{...S.emptySegment(),face:first.face}]}),
  strayGlobal:S.parseTimeline(JSON.stringify({version:2,face_schema:1,face:{on:true},segments:[{prompt:'missing'}]})).segments[0].face.on,
  invalidMarker:S.parseTimeline(JSON.stringify({version:2,face_schema:true,segments:[{prompt:'old',face:{on:true}}]})).segments[0].face.on,
}));
'''
report = layout.run(script, layout.js("state.js"), json.dumps(legacy))
check("frontend user ON round-trip survives", report["restored"], report["original"])
check("duplicate OFF keeps separate knobs", report["clone"], {"on": False, "canvas": 512, "denoise": .6})
check("original and duplicate settings never alias", report["distinct"], True)
check("new generated card OFF", report["newOff"], True)
check("serialized current marker and no global block", (report["marker"], report["global"]), (1, False))
check("any enabled detector, OFF sibling, clip, unsupported family",
      (report["detector"], report["sibling"], report["clip"], report["unsupported"]), (True, False, False, False))
check("sync never clears per-card choice", report["syncPreserved"], True)
check("direct Creator choice survives serializer", report["lone"], report["original"])
check("enabled shot counts as written for Clear", report["clearWritten"], True)
check("marked missing card never inherits stray global ON", report["strayGlobal"], False)
check("frontend boolean marker cannot skip migration", report["invalidMarker"], False)
passed("per-card Face pass migration and independent persisted ownership")
