"""Field rewrites replace their own originals through the real H3 compiler.

No media is opened and no model, queue or GPU is used.
"""
import copy

import layout
from harness import check, passed

compiler = layout.load("compile", package="fieldrefinecompile").compile


def shot(number, fields=None, enabled=True):
    raw = {"prompt": (
        f"subject_definitions:\n@anna is the EXPLICIT_DEFINITION_{number}.\n\n"
        f"summary:\n원문레거시요약_{number}\n\n"
        f"retention_analysis:\n원문레거시규칙_{number}\n\n"
        f"detailed_description:\n@anna walks. ORIGINAL_BODY_{number}"),
        "prompt_sections": {"summary": f"원문요약_{number}"},
        "retention_blocks": [{"type": "text", "text": f"원문보존규칙_{number}"},
                             {"type": "subject", "handle": "anna"},
                             {"type": "text", "text": f"추가원문규칙_{number}"}],
        "duration_s": 6, "assets": []}
    if fields is not None:
        raw["refined"] = {"body": f"@anna turns. REFINED_BODY_{number}",
                          "scope": "shot", "enabled": enabled, "fields": list(fields),
                          "sections": {key: f"REFINED_{key}_{number}" for key in fields if key != "prompt"}}
        if "prompt" not in fields:
            raw["refined"]["body"] = f"@anna walks. ORIGINAL_BODY_{number}"
    return raw


def piece(segments, **extra):
    return {"version": 2, "family": "h3", "render": "chained", "aspect": "16:9", "short_edge": 768,
            "prompt": "GLOBAL_PROSE", "prompt_sections": {"summary": "GLOBAL_SUMMARY"},
            "retention_blocks": [{"type": "text", "text": "GLOBAL_RULE"}],
            "soundscape": "GLOBAL_SOUND", "music": "GLOBAL_SCORE",
            "assets": [{"handle": "ref-1", "kind": "image", "role": "reference", "filename": "unused.png"}],
            "subjects": [{"handle": "anna", "from": ["ref-1"],
                          "description": "CAST_IDENTITY", "usage_rules": "CAST_FACE_RULE"}],
            "segments": segments, **extra}


def prompts(data):
    return [compiler.compile_segment(payload).prompt for payload in compiler.timeline_payloads(data)]


all_fields = ["summary", "retention_analysis", "prompt"]
original = shot(1)
rewritten = shot(1, all_fields)
before = copy.deepcopy(rewritten)
applied = compiler.apply_field_refinement(rewritten)
check("field overlay helper leaves all raw source bytes unchanged", rewritten, before)
check("overlay consumes its metadata exactly once", "fields" in applied["refined"], False)
check("overlay retains user-owned subject block placement",
      [block for block in applied["retention_blocks"] if block["type"] == "subject"],
      [{"type": "subject", "handle": "anna"}])
check("overlay replaces manual text blocks instead of joining originals",
      [block["text"] for block in applied["retention_blocks"] if block["type"] == "text"],
      ["REFINED_retention_analysis_1"])
check("overlay preserves explicit subject definitions", "EXPLICIT_DEFINITION_1" in applied["prompt"], True)
check("overlay removes only replaced legacy summary", "원문레거시요약_1" in applied["prompt"], False)
check("overlay removes only replaced legacy rules", "원문레거시규칙_1" in applied["prompt"], False)
check("overlay is idempotent after consuming field ownership", compiler.apply_field_refinement(applied), applied)

normal_piece = piece([original])
normal = prompts(normal_piece)[0]
for marker in ("원문요약_1", "원문레거시요약_1", "원문보존규칙_1", "원문레거시규칙_1", "ORIGINAL_BODY_1"):
    check("normal generation retains original " + marker, marker in normal, True)

refined_piece = piece([rewritten])
before = copy.deepcopy(refined_piece)
text = prompts(refined_piece)[0]
check("complete compile does not mutate the source piece", refined_piece, before)
for marker in ("원문요약_1", "원문레거시요약_1", "원문보존규칙_1", "추가원문규칙_1", "원문레거시규칙_1", "ORIGINAL_BODY_1"):
    check("whole-card compile replaces original " + marker, marker in text, False)
for marker in ("REFINED_summary_1", "REFINED_retention_analysis_1", "REFINED_BODY_1",
               "GLOBAL_SUMMARY", "GLOBAL_RULE", "GLOBAL_PROSE", "GLOBAL_SOUND", "GLOBAL_SCORE",
               "CAST_IDENTITY", "CAST_FACE_RULE", "EXPLICIT_DEFINITION_1"):
    check("whole-card compile includes requested or inherited " + marker + " exactly once", text.count(marker), 1)

# Direct compile is another supported route; it cannot join originals back in.
direct = {**rewritten, "assets": refined_piece["assets"], "subjects": refined_piece["subjects"]}
direct_before = copy.deepcopy(direct)
direct_text = compiler.compile_request(direct).prompt
check("direct compile also replaces original summary", "원문요약_1" in direct_text, False)
check("direct compile also replaces original rules", "원문보존규칙_1" in direct_text, False)
check("direct compile leaves its source unchanged", direct, direct_before)

for field in all_fields:
    single = piece([shot(1, [field])])
    text = prompts(single)[0]
    check(field + " preserves Cast rules", "CAST_FACE_RULE" in text, True)
    check(field + " preserves global rules", "GLOBAL_RULE" in text, True)
    check(field + " preserves definitions", "EXPLICIT_DEFINITION_1" in text, True)
    check(field + " replaces only own summary", "원문요약_1" in text, field != "summary")
    check(field + " replaces only own retention", "원문보존규칙_1" in text, field != "retention_analysis")
    check(field + " replaces only own body", "ORIGINAL_BODY_1" in text, field != "prompt")

# Older field-only saves copied the unrefined description into refined.body.
# Subsequent edits to the actual description must remain live, including when
# that old save is reopened and compiled without any frontend migration.
for field in ("summary", "retention_analysis"):
    stale = shot(1, [field])
    stale["prompt"] = stale["prompt"].replace("ORIGINAL_BODY_1", "LATEST_TYPED_BODY")
    stale["refined"]["sections"]["summary" if field == "retention_analysis" else "retention_analysis"] = "UNOWNED_DRAFT"
    check(field + " never owns its copied description", compiler.refined_body(stale), None)
    check(field + " has no description scope", compiler.refined_scope(stale), None)
    effective = compiler.apply_field_refinement(stale)
    check(field + " removes stale copied body on the disposable overlay", "body" in effective["refined"], False)
    text = prompts(piece([stale]))[0]
    check(field + " keeps later edits to detailed_description live", "LATEST_TYPED_BODY" in text, True)
    check(field + " discards only the stale copied description", "ORIGINAL_BODY_1" in text, False)
    check(field + " cannot activate an unowned sibling section", "UNOWNED_DRAFT" in text, False)
    check(field + " keeps its actual rewrite", f"REFINED_{field}_1" in text, True)

legacy = shot(1)
legacy["refined"] = {"body": "LEGACY_FULL_REWRITE", "scope": "shot", "sections": {"summary": "LEGACY_SUMMARY"}}
check("legacy full rewrites still own their description", compiler.refined_body(legacy), "LEGACY_FULL_REWRITE")
check("legacy full rewrites retain their scope", compiler.refined_scope(legacy), "shot")
legacy_text = prompts(piece([legacy]))[0]
check("legacy full rewrite still reaches generation", "LEGACY_FULL_REWRITE" in legacy_text, True)

for mode in ("separate", "merged"):
    first, second = shot(1, all_fields), shot(2, all_fields)
    if mode == "merged":
        second["merge"] = True
    data = piece([first, second])
    saved = copy.deepcopy(data)
    texts = prompts(data)
    check(mode + " makes the expected number of passes", len(texts), 1 if mode == "merged" else 2)
    for number in (1, 2):
        whole_text = "\n".join(texts)
        for marker in (f"원문요약_{number}", f"원문보존규칙_{number}", f"원문레거시규칙_{number}",
                       f"추가원문규칙_{number}", f"원문레거시요약_{number}", f"ORIGINAL_BODY_{number}"):
            check(mode + " has no old-card prose " + marker, marker in whole_text, False)
        for marker in (f"REFINED_summary_{number}", f"REFINED_retention_analysis_{number}", f"REFINED_BODY_{number}"):
            check(mode + " includes exactly one rewritten card value " + marker, whole_text.count(marker), 1)
    for text in texts:
        for marker in ("GLOBAL_SUMMARY", "GLOBAL_RULE", "GLOBAL_PROSE", "CAST_FACE_RULE"):
            check(mode + " preserves shared material once per pass " + marker, text.count(marker), 1)
    check(mode + " leaves original raw source state unchanged", data, saved)

unblocked = shot(1, all_fields)
del unblocked["retention_blocks"]
unblocked["prompt_sections"]["retention_analysis"] = "원문필드규칙_1"
unblocked_text = prompts(piece([unblocked]))[0]
check("unblocked retention field is replaced", "원문필드규칙_1" in unblocked_text, False)
check("unblocked legacy retention is also replaced", "원문레거시규칙_1" in unblocked_text, False)
check("unblocked replacement appears once", unblocked_text.count("REFINED_retention_analysis_1"), 1)

off = piece([shot(1, all_fields, enabled=False)])
off_text = prompts(off)[0]
for marker in ("원문요약_1", "원문보존규칙_1", "ORIGINAL_BODY_1"):
    check("disabled rewrite restores original " + marker, marker in off_text, True)
check("disabled rewrite never leaks overlay values", "REFINED_" in off_text, False)

passed("all field-refine compile contracts passed (direct, separate and merged; no model or GPU)")
