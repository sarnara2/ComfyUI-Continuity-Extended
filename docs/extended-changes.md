# Extended change record

This records the personal fork's differences so later upstream updates can be
integrated without losing local behavior or implementing the same feature twice.
It is an integration aid, not a claim that future merges will be conflict-free.
The README has the short user-facing summary; this file owns the implementation
and compatibility notes. Existing upstream licenses and credits remain in place.

## Baselines and history

- Upstream code baseline for these entries:
  [`00a9a8fe699232704b65d835ebaf80111c27fb99`](https://github.com/roadmaus/ComfyUI-Continuity/commit/00a9a8fe699232704b65d835ebaf80111c27fb99).
- Initial Extended revision:
  [`e0b5bbd74ace9049bdc9b6b71606cbba3272643b`](https://github.com/sarnara2/ComfyUI-Continuity-Extended/commit/e0b5bbd74ace9049bdc9b6b71606cbba3272643b),
  dated 2026-10-08. Adds EXT-01 and the fork branding/installation identity.
- 2026-10-08 usability revision: retains EXT-01 and adds EXT-02 through EXT-08,
  including the subsequent folder-dialog and persistent-folder-pill fixes.
  Its exact commit is the Git commit that adds this record; use
  `git log --follow -- docs/extended-changes.md` to locate it. No new upstream
  revision is absorbed in this update.

All entries below are **local fork implementations** against that baseline.
They are not statements about whether newer upstream code implements equivalents.

## Feature map

Paths below are relative to the repository root; brace notation groups files in
the same directory. IDs remain stable even if files move or upstream later
replaces an implementation.

| ID | Behavior | Primary implementation owners | Regression checks |
| --- | --- | --- | --- |
| EXT-01 | Single/exact-all prompt-tag replacement | `web/creator/{prompt,editor}.js`, `web/creator/styles/editor.js` | `tests/{test_handle_replacement,test_js_bodies}.py` |
| EXT-02 | Remember five timeline sections | `web/creator.js`, `web/creator/{disclosure,timeline,cast}.js` | `tests/browser/test-timeline-sections-seams.cjs` |
| EXT-03 | Batch-wide elapsed time and per-result render span | `web/creator/{queue,timing,stage,timeline}.js` | `tests/{test_stage_queue_timing,test_stage_timing,test_stage_footer}.py` |
| EXT-04 | Context-aware per-file/bulk import options | `web/creator/{picker,state}.js`; callers listed below | `tests/browser/{test-reference-import-options,test-reference-import-contexts}.cjs` |
| EXT-05 | Piece-reference preview and file reselection | `web/creator/{timeline,editor}.js` | `tests/browser/{test-pool-reference-actions,test-reference-preview}.cjs` |
| EXT-06 | Soundscape/music `N/A` buttons | `web/creator/{timeline,disclosure}.js`, `web/creator/styles/timeline.js` | `tests/browser/test-timeline-sections-seams.cjs` |
| EXT-07 | Per-sound-clip boundary magnet | `web/creator/{soundlane,timeline}.js`, `web/creator/styles/timeline.js` | `tests/browser/test-sound-clip-snap.cjs`, `tests/test_sound_persist.py` |
| EXT-08 | External folder shortcuts and Windows folder chooser | `creator/{folders.py,folder_dialog.ps1}`, `creator/routes/folders.py`, `__init__.py`, `web/creator/{api,picker}.js`, `web/creator/styles/picker.js` | `tests/{test_picker_external_folders,test_picker_folder_routes}.py`, `tests/browser/{test-external-picker-folders,test-external-folder-api}.cjs` |

UI text for these features also lives in `web/creator/locales/{ja,ko,zh}.js`.
English uses the source strings. This does not finish translation of all other
content, such as the separate technique library.

## Contracts to retain when integrating upstream

### EXT-01 — prompt tags

- Click a recognized tag to open the existing-style picker: project cast,
  references and screens, with manual name/number input and a visual `@` prefix.
- Default replacement changes the clicked occurrence only. Bulk replacement
  matches that exact handle only in the current segment, not every handle of the
  same category. `@ref-1` must not match `@ref-11`.
- Other segments and the global prompt remain unchanged. Existing `:scope`
  suffixes and reference-reactivation rules are preserved.
- Keep the cast-editor shortcut. Do not confuse replacing prompt text with
  EXT-05, which changes a reference's attached file while preserving its handle.

### EXT-02 — timeline sections

- State is saved in node properties under `mmc_timeline_sections`, not in the
  generation payload `creator_data`.
- Section keys are `global_prompt`, `overall_soundscape`, `non_diegetic_music`,
  `references` and `cast`. Only boolean `false` means collapsed; missing values
  default to open. Read properties when opening the view, not only at node creation.
- Folding hides the mounted editor/list rather than rebuilding it. Header action
  clicks must not toggle the section; focus and owned popovers are handled on close.
- If upstream gains disclosure persistence, compare its saved-state schema and
  reopening behavior before replacing this adapter. Keep old saved workflows valid.

### EXT-03 — render clocks

- A batch begins with an accepted prompt and includes additional accepted queued
  prompts owned by that stage until the batch becomes terminal. Whole-run time
  includes waiting; this is not a clock for every ComfyUI workflow's global queue.
- Each result retains its own render span. Queue-wide elapsed time is not the
  duration of the currently selected result. Normal/fullscreen share the stage.
- Queue removal, failure, interruption and history recovery must stop/update the
  correct prompt. Never subtract browser timestamps from server timestamps, or
  count reconnect downtime as a made-up render duration.
- History without accepted-queue timing can only report known execution time;
  unknown endpoints remain unknown. The first empty idle stage is not turned into
  a new pre-sampling preview by this change. Timing lives in browser memory, not
  saved workflow properties, so history cannot reconstruct unobserved queue waits.

### EXT-04 — pre-import options

- Use existing `takes`/`ref_size` fields on assets and panels rather than a parallel
  generation schema. Per-file overrides and bulk defaults travel with the chosen
  file; untouched options omit fields so the existing defaults still apply.
- Visual references expose only roles/sizes supported by the current context;
  audio/RefMods and fixed-purpose inputs must not offer meaningless MAX/MATCH or
  visual-role controls. Cast voice remains a single-voice slot.
- Preserve settings through cropping, trimming, picture/sound selection and
  preset flows. Enabled picker call sites are in `editor.js`, `timeline.js` and
  `presetlib.js` under `web/creator/`. Shared binding/persistence adapters also
  touch `cast.js`, `prestage.js` and `presets.js`; those are not a promise that
  every fixed-purpose picker exposes role/size controls.
- When upstream changes picker returns or attachment rules, review every caller,
  not just piece references. Existing post-import controls remain available.

### EXT-05 — reference chips

- In the piece-reference pool, double-click the thumbnail for read-only preview;
  click the handle to reselect the appropriate file kind. Tooltips describe these
  separate actions. Segment chips retain their existing handle settings popover
  and single-thumbnail-click replacement, plus double-click preview.
- Keep the same handle, prompt citations and cast/reference binding. Cancellation
  is inert; a stale callback must not resurrect an attachment removed meanwhile.
- Existing crop/trim/modification settings are retained when applicable; changed
  files must not blindly inherit incompatible settings.

### EXT-06 — quick `N/A`

- Each small header pill clears only its own field and writes the literal `N/A`,
  with one commit. Font size stays unchanged and the pill fits inside the heading.
- Action clicks must not fold the heading. This edits prompt input, not audio
  samples, and does not guarantee that a model will produce perfect silence.

### EXT-07 — sound magnet

- The magnet is per clip, off by default. Its enabled state is a timeline-view
  preference shared across that view's reopen, not persisted in workflow data.
- Within a seven-pixel drag radius, snap either edge to delivered segment
  boundaries, internal merged-shot boundaries or other sound-clip edges. Account
  for continuation trims using existing frame/timeline calculations.
- Drag/trim operations still use the existing sound-placement commit path. This
  does not change denoising, audio blending or source-soundtrack preservation.

### EXT-08 — folders

- Registrations are per user in `continuity.folders.json`; external files use
  opaque `external:` tokens tied to an explicitly granted folder, not arbitrary
  browser-supplied filesystem paths. Native selection is loopback-only.
- The last selected folder ID is a separate picker preference in
  `continuity.picker.json.externalFolder`, with a `continuity-picker-prefs`
  localStorage fallback. That preference is not a new folder grant.
- Image/video/audio tabs list their matching type; Render accepts image/video
  media, and RefMod accepts valid RefMods. Traversal is bounded and cannot escape
  the granted root through path tricks or links.
- Clicking/reclicking a shortcut, changing tab or reopening refreshes only the
  selected external folder, not all registered folders. The pills scroll
  horizontally; cached built-in folder pills stay visible during external browsing
  and remain directly selectable.
- Removing `×` deletes only the registration. Originals and already imported
  managed copies/attachments stay intact. Selected/touched external files are
  materialized under `input/continuity/imports/` or
  `models/refmods/continuity/imports/` before execution; never overwrite an existing
  user file. No global arbitrary-path resolver is added.
- Windows uses its Explorer-style `IFileDialog` in folder-only mode. Only the
  helper's actual visible dialog is raised/centered/enlarged; no global focus or
  security setting is changed. The helper console is hidden, cancellation is inert,
  and helper errors are not silently treated as cancellation.
- Folder-only mode may hide individual files: do not promise thumbnail previews
  inside the operating-system dialog. Restart is required for changed Python
  routes/chooser code; refresh the browser for frontend code.

## Branding and deliberately excluded work

Keep `- Extended` on the main node, legacy timeline title and fullscreen wordmark.
The owners include `creator/creator_node.py`, `web/creator/fullscreen.js`,
`locales/{ja,ko,zh}/nodeDefs.json` and `pyproject.toml`. Internal node IDs stay
unchanged: install this fork **instead of**, not alongside, the upstream pack.
Preserve the personal-fork disclaimer, repository URLs, licenses and credits.

This update does **not** add the cancelled workflow-tab preview-preservation
feature, automatic exact source-audio copying/remuxing, new generation logic,
or completed technique-library translations. Discussion alone is not implementation.

## Verification boundary

The implementation has source/DOM, isolated Playwright, temporary-filesystem and
API-handler regression coverage. Windows COM interfaces/options/event wiring were
also exercised without opening the chooser. See
[browser test instructions](../tests/browser/README.md) for harness limits.
The 2026-10-08 publishing checkout passed nine related Python suites (including
21 real-filesystem folder checks and eight route-handler checks), five isolated
browser suites with 99 checks and zero network requests, 21 import-context checks,
and the folder API-transport contract checks. Changed JavaScript syntax, Python
ASTs and `git diff --check` passed; existing branding and prompt-tag code were
preserved. The browser suites were timeline sections (28), reference actions (12),
import options (20), sound snapping (17) and external folders (22).

The newest native chooser's actual frontmost appearance still needs a live desktop
check after ComfyUI restart. These checks do not establish live ComfyUI end-to-end
behavior, new GPU rendering or exact source-audio preservation. Do not describe
selected passing checks as proof that the entire upstream test suite passes.

## Keeping the record current

For every future fork update, update the README's concise summary and append a
dated entry here (and a short changelog entry). Record the upstream baseline before
and after integration, feature IDs, behavior changes, owner files, state/schema
changes, tests run and limitations. Use Git history for exact update commit IDs;
do not invent a future SHA or silently rewrite prior verification claims.

Before absorbing an upstream update, compare each active feature's behavior and
contracts with the new upstream implementation. Reuse a verified equivalent rather
than stacking duplicate listeners, controls or state. Preserve compatible saved
data or explicitly document/migrate it. Mark an entry **upstream-equivalent**,
**adapted** or **retired** only after comparison and regression checks, linking the
upstream commit and recording any remaining local differences. Keep retired entries
as history; do not overwrite whole upstream files to recover a small fork feature.
