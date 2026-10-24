"""H3 task-prefix normalization and concrete Cast retention rules."""

import layout

from harness import check, passed

pkg = layout.load("contextir", "subjects", "compile")
ir, subjects = pkg.contextir, pkg.subjects

check("Korean summaries keep one ordered task prefix",
      ir.normalize_summary("[reference generation] 여자가 걷는다.\n\n"
                           "[audio reference + reference generation] 목소리를 따른다."),
      "[reference generation + audio reference] 여자가 걷는다.\n\n목소리를 따른다.")
check("inline repeated task tags also collapse",
      ir.normalize_summary("[reference generation] 걷는다. [reference generation] 웃는다."),
      "[reference generation] 걷는다. 웃는다.")
literal = ('[Shot 2] <d>[English] [reference generation] Say this.</d>\n'
           '"[video editing]"\n```text\n[audio reuse]\n```')
check("shot, language, dialogue, quotes and code remain literal",
      ir.normalize_summary(literal), literal)
multiline = '<d>[English]\n[reference generation] spoken words\n</d>'
check("multiline dialogue is never promoted into a task", ir.normalize_summary(multiline), multiline)
check("unknown bracket group stays prose", ir.normalize_summary("[custom + reference generation] text"),
      "[custom + reference generation] text")
check("task metadata joins the prefix rather than making another one",
      ir.normalize_summary("[audio reuse] 소리를 쓴다.", ("reference generation", "audio reuse")),
      "[reference generation + audio reuse] 소리를 쓴다.")

generated = "[reference generation] The target video features <Subject 1> and <Subject 2>."
check("manual summary owns the story instead of receiving a second scaffold",
      ir.merge_summary(generated, "[reference generation] 두 사람이 연속해서 걷는다."),
      "[reference generation] 두 사람이 연속해서 걷는다.")
edit = ("[video editing + reference generation] The target video is an edited version of <Video 1>. "
        "The target video features <Subject 1>. <Subject 1> takes the place of the person in <Video 1>.")
merged = ir.merge_summary(edit, "[reference generation] 원본의 움직임으로 걷는다.")
check("edit source stays first", merged.startswith(
      "[video editing + reference generation] The target video is an edited version of <Video 1>."), True)
check("replacement fact survives", "takes the place of the person in <Video 1>" in merged, True)
check("generic feature list is removed", "The target video features" in merged, False)
check("canonical normalization is idempotent", ir.normalize_summary(ir.normalize_summary(merged)), merged)
check("same edit opener is not repeated", ir.merge_summary(edit,
      "[video editing] The target video is an edited version of <Video 1>. 새 동작.").count(
      "The target video is an edited version of <Video 1>."), 1)
check("explicit user shot request stays intact", "하나의 숏으로 유지한다" in ir.merge_summary(
      generated, "[reference generation] 하나의 숏으로 유지한다."), True)

cast = subjects.parse([{"handle": "anna", "from": ["ref-1"]}])
labels = {"ref-1": "<Picture 1>", "vid-1": "<Video 1>"}
summary = ir.summary([], cast, {"anna": "<Subject 1>"}, labels)
check("generated summary does not claim one shot", "one shot" in summary, False)
check("blank summary still names its cast", "features <Subject 1>" in summary, True)
check("new person baseline omits wardrobe",
      [name for name, _ in subjects.ATTRIBUTES["person"][1]], ["face", "hair", "build"])
check("legacy person without feature rows does not regain wardrobe",
      "clothing" in subjects.retention(cast, labels, "<Subject 1> walks."), False)
saved = subjects.parse([{"handle": "anna", "from": ["ref-1"], "seeded": True,
                         "features": [{"attr": "face"}, {"attr": "clothing"}]}])
check("saved explicit wardrobe feature survives",
      "clothing are retained" in subjects.retention(saved, labels, "<Subject 1> walks."), True)
typed = subjects.parse([{"handle": "anna", "from": ["ref-1"],
                         "description": "the woman with a red coat",
                         "usage_rules": "얼굴만 유지하고 의상은 파란 셔츠로 바꾼다."}])
check("identity description remains a definition", "with a red coat" in subjects.definitions(typed, labels), True)
rules = subjects.retention(typed, labels, "<Subject 1> walks.", explicit_rules={"anna": True})
check("explicit rules keep fixed marker", rules.startswith("<Subject 1>: fully_preserved -"), True)
check("explicit rules do not reassert automatic full appearance", "face, hair" in rules, False)
check("no priority-policy boilerplate", "precedence" in rules or "explicit reference usage rules" in rules, False)
scoped = subjects.retention(typed, labels, "<Subject 1> walks.",
    explicit_rules={"anna": [(1, 2)]}, target_scopes={"anna": [(0, 3)]})
check("unaffected windows retain the baseline", "During 0–1 and 2–3 seconds" in scoped, True)
check("explicit window stays bounded", "During 1–2 seconds" in scoped, True)
replacement = subjects.parse([{"handle": "anna", "from": ["ref-1"],
    "replaces": ["vid-1"], "replaces_what": "the person at the counter", "usage_rules": "Keep her face."}])
check("explicit rules still retain the source replacement relationship",
      "they appear in place of the person at the counter in <Video 1>" in subjects.retention(
          replacement, labels, "<Subject 1> walks.", explicit_rules={"anna": True}), True)
moving = subjects.parse([{"handle": "anna", "from": ["ref-1"], "motion": ["vid-1"]}])
moving_rules = subjects.retention(moving, labels, "<Subject 1> walks.",
    target_scopes={"anna": [(0, 3)]}, reference_annotations=[{
        "handle": "vid-1", "usage_rules": "Freeze movement here.", "intervals": [(1, 2)]}])
check("motion baseline stays outside the explicitly changed window",
      "During 0–1 and 2–3 seconds of the target video only, the movement in <Video 1>" in moving_rules, True)
check("motion rule does not add a policy-priority sentence", "superseded" in moving_rules, False)

prompt = ir.compose("REF2VA", "[Shot 1] <Subject 1> walks.", sections={
    "subject_definitions": subjects.definitions(typed, labels),
    "summary": "[reference generation] 걷는다.\n[reference generation] 웃는다.",
    "retention_analysis": rules + "\n\n<Subject 1>:\n" + typed[0].usage_rules})
check("final document has one task token", prompt.count("[reference generation]"), 1)
override = ir.normalize_model_prompt("summary:\n[reference generation] 걷는다.\n\n"
                                    "summary:\n[reference generation] 웃는다.")
check("force-edit formatting also keeps one task prefix", override.count("[reference generation]"), 1)
check("force-edit formatting does not invent source prose", override,
      "summary:\n[reference generation] 걷는다.\n\n웃는다.")
check("user rules actually appear below the fixed marker", "얼굴만 유지하고 의상은 파란 셔츠로 바꾼다." in prompt, True)
check("compiled retention has one subject header", prompt.split("retention_analysis:\n")[1].split(
      "detailed_description:")[0].count("<Subject 1>:"), 1)

compiled = pkg.compile.compile_request({
    "prompt": "@anna 걷는다.", "prompt_sections": {"summary": "[reference generation] @anna 웃는다."},
    "assets": [{"handle": "ref-1", "role": "reference", "kind": "image", "filename": "anna.png"}],
    "subjects": [{"handle": "anna", "from": ["ref-1"], "description": "the woman",
                  "usage_rules": "얼굴만 유지하고 의상은 파란 셔츠로 바꾼다."}]})
check("real compiler keeps one summary section", compiled.prompt.count("summary:"), 1)
check("real compiler keeps one summary task tag", compiled.prompt.count("[reference generation]"), 1)
check("real compiler uses the manual summary without feature scaffold",
      "summary:\n[reference generation] <Subject 1> 웃는다." in compiled.prompt, True)
check("real compiler keeps the identity definition", "<Subject 1> is the person in <Picture 1>, the woman." in compiled.prompt, True)
check("real compiler does not add automatic wardrobe", "clothing" in compiled.prompt, False)
check("real compiler preserves explicit wardrobe rule", "의상은 파란 셔츠로 바꾼다" in compiled.prompt, True)
supplied = pkg.compile.compile_request({
    "prompt": "@anna walks.", "prompt_sections": {"summary": "[reference generation] @anna turns."},
    "refined": {"enabled": True, "body": "@anna walks slowly.",
                "sections": {"summary": "[reference generation] The target video features @anna."}},
    "assets": [{"handle": "ref-1", "role": "reference", "kind": "image", "filename": "anna.png"}],
    "subjects": [{"handle": "anna", "from": ["ref-1"]}]})
check("an explicit supplied feature sentence is not mistaken for compiler scaffolding",
      supplied.prompt.count("The target video features <Subject 1>."), 1)
check("manual summary remains beside the earlier supplied contribution",
      "<Subject 1> turns." in supplied.prompt.split("summary:\n")[1].split("retention_analysis:")[0], True)
check("combined refined/manual summaries still get one task prefix",
      supplied.prompt.count("[reference generation]"), 1)
edited = pkg.compile.compile_request({
    "prompt": "@anna takes the place of the person in @vid-1.",
    "assets": [{"handle": "ref-1", "role": "reference", "kind": "image", "filename": "anna.png"},
               {"handle": "vid-1", "role": "reference", "kind": "video", "filename": "source.mp4",
                "takes": "edit", "track": "picture", "usage_rules": "Use a static camera."}],
    "subjects": [{"handle": "anna", "from": ["ref-1"], "replaces": ["vid-1"],
                  "replaces_what": "the person at the counter", "usage_rules": "Keep her face."}]})
check("source rules do not claim the old camera remains fixed",
      "the framing, camera work, timing, environment and everyone else are kept" in edited.prompt, False)
check("source swap remains concrete", "the person at the counter is replaced by <Subject 1>" in edited.prompt, True)
check("source rules remain literal", "Use a static camera." in edited.prompt, True)
check("source reference never emits a priority-policy sentence",
      "explicit reference usage rules" in edited.prompt or "superseded" in edited.prompt, False)
refined_edit = pkg.compile.compile_request({
    "prompt": "@anna replaces the person in @vid-1.",
    "refined": {"enabled": True, "body": "@anna walks through the scene in @vid-1.",
                "sections": {"summary": "[reference generation] @anna walks."}},
    "assets": [{"handle": "ref-1", "role": "reference", "kind": "image", "filename": "anna.png"},
               {"handle": "vid-1", "role": "reference", "kind": "video", "filename": "source.mp4",
                "takes": "edit", "track": "picture"}],
    "subjects": [{"handle": "anna", "from": ["ref-1"], "replaces": ["vid-1"],
                  "replaces_what": "the person at the counter"}]})
edit_summary = refined_edit.prompt.split("summary:\n")[1].split("retention_analysis:")[0]
check("refined-only summary retains the required edit-source opener",
      edit_summary.startswith("[video editing + reference generation] The target video is an edited version of <Video 1>."), True)
check("refined-only summary retains replacement facts",
      "takes the place of the person at the counter in <Video 1>" in edit_summary, True)
check("refined-only summary retains its supplied story", "<Subject 1> walks." in edit_summary, True)

passed("all H3 prompt-section regression tests passed")
