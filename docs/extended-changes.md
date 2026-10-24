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

- The 2026-10-24 integration combines the accumulated local Extended source
  with the existing fork `main` at
  [`6d23b6e`](https://github.com/sarnara2/ComfyUI-Continuity-Extended/commit/6d23b6e851cfb210ea8080b2ba0f10ba7343a078)
  and upstream's remote-answer timeout repair at
  [`3146741`](https://github.com/roadmaus/ComfyUI-Continuity/commit/3146741a2b19768754bf68f8450fb3a4ad6455f1).

The earlier entries are dated implementation records against their stated
baselines. Their historical local-only or held-work status is retained as a
record of that milestone; the current integration notes below supersede it.

## Integrated Extended update — 2026-10-24

Preserve the current local controls and feature ownership while retaining the
fork's history, `- Extended` display names, package links, licenses and credits.
Internal node IDs and serialized widget field names are unchanged. Existing
fork-only regression files remain part of the integration rather than being
discarded merely because newer local fixtures cover related areas.

- **Scoped refinement:** Timeline global prompt, soundscape and music stay
  independent. Segment scope supports `prompt` (detailed description),
  `summary`, `retention_analysis` and the combined `segment` rewrite. Refine all
  remains the explicit broad operation. Owner locks, two-press confirmation,
  source-edit guards, reference-image policy and optional Faithful Beta remain.
- **Retained modal work:** closing the segment modal hides its editor instead
  of discarding an in-flight refinement. Reopening restores busy/progress state
  and any completed result. Source replacement, actual owner destruction and
  stale source edits still invalidate the old result; unrelated edits survive.
- **Workflow runtime ownership:** transient progress and the latest preview
  belong to the originating workflow and node. Switching away and returning
  restores that owner rather than copying another workflow's state. Runtime
  snapshots are not generation settings or saved prompt fields.
- **Remote timeout and reconnect repair:** remote refine/chat requests return
  an `answer_id` immediately. The result or original error is delivered through
  `mmc_answer`; a receipt token also permits recovery of a missed socket answer
  through `POST /continuity/answers`, without repeating the model call. Local
  GPU jobs retain their existing queued `prompt_id` path, and old inline results
  remain accepted by the frontend.
- **Receipt lifetime:** results stay in server RAM and require the original
  receipt. Completed answers are retrievable for one hour or until acknowledged;
  there are 128 slots, pending work is not evicted and capacity refusal occurs
  before work starts. The frontend releases per-call listeners, timers and
  in-flight lookups on settlement, and ignores duplicate or foreign replies.
  If the initial HTTP receipt was never received, the existing error path is
  used without automatic resubmission. Full page reload and process restart
  recovery are outside this contract.
- **Other accumulated tools:** hierarchical picker/view memory, per-card Face
  pass ownership and dialogue editing retain their existing local owners and
  contracts. Faithful Beta stays a separate optional skill choice. The optional
  sheet tool checks its compatible builder's availability and retains panel
  selection and export controls; this integration does not force availability
  or replace the original prompt-skill default.

Runtime owners for the remote transport are `creator/jobs.py`,
`creator/refine_routes.py`, `creator/routes/{chat,answers}.py`, `__init__.py` and
`web/creator/queue.js`. The editor/runtime owners remain
`web/creator/{editor,refine,prompt-sections,timeline,stage}.js` and
`web/creator.js`.
The optional tool owners include `creator/skills/minimax-h3-faithful-beta/`,
`creator/{sheet.py,routes/sheet.py}` and `web/creator/sheet-studio.js`.

The latest installed-source verification covered 54 mounted-UI lifecycle cases,
27 backend receipt cases, 27 frontend recovery cases and 98 existing browser
checks. The lifecycle set retained the earlier 38 modal/workflow cases and added
16 remote recovery/chat cases. These use isolated fake server/model/queue/media
edges; they do not prove a live provider call, real GPU generation, full upstream
suite success or output fidelity. Backend routes and frontend code must be loaded
together after saving work and safely restarting ComfyUI and refreshing its browser.

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

### EXT-62 — per-generated-card Face pass ownership

Remove both outer/global Face pass controls, not other sampler/neural controls.
Every supported generated card owns its full ON/OFF/canvas/denoise block in the
stable Face pass pill; OFF matches the outlined motion-fix pill. Newly added and
duplicated cards are OFF with independent objects. Saved enabled new-format
originals retain ON/options; cloning never changes the original. `face_schema:1`
marks the one-time legacy migration: old global/string overrides become OFF as
explicitly chosen, but a new-format reopening must never reset an enabled card.
Frontend/backend migration is non-mutating at the saved-blob boundary. Final
resolved render requests keep their original Face block shape. Merged/single
physical generations still refuse disagreement rather than silently selecting a
member's settings. Popovers cannot write a removed/replaced owner. Source takes,
audio, DLSS/neural emitter/runtime and field-only versus Refine all stay intact.

### EXT-63–65 — hierarchical picker views and explicit pending-check memory

- Explicit `directory:""` requests immediate child folders/files from a
  registered grant; omit directory for the exact legacy recursive contract.
  Root/parent/breadcrumb paths are relative, validated and realpath-contained.
  Empty and nonmatching-media child folders remain navigable and never become
  selectable media. Original grants, per-user/origin checks, file resolve/view/
  import/copy/probe behavior and source files remain unchanged.
- Large thumbnails, small thumbnails and Details retain the actual media cells,
  reference/trim/crop/star/sheet actions, selection order and lazy/page limits.
  Details reads listing facts only, never eagerly decodes or probes all files.
  Display preferences remember kind/query/sort/view/grant/directory in the
  existing bounded UI-only store; fresh authoritative grants validate reopening.
- Pending checks use a separate bounded paths-only store, scoped by explicit
  `selectionPurpose`, tab, only-kind and single/multiple choice. Caller callbacks
  and capacities stay original. Reopening/reload never imports, attaches, builds
  a sheet or resolves the picker; Add/Done remains an explicit operation.
  Restore uses fresh known built-in rows and bounded read-only registered-token
  metadata for selections from other directories. Missing/revoked/wrong-kind/
  out-of-capacity files are not selected. Current settings/defaults apply, not
  stored trim/crop/track/cut/ref-size recipes. Seeded attached sheet panels take
  priority and opt out of generic pending memory. View-only/organize states are
  not attachment memory. Async revisions/owner/tab guards let user input win;
  explicit imports retain original-token aliases for later check restoration.

### EXT-66–68 — separated summary and individual versus whole frame facts

The approved summary has three separate pills: Full video / New video / Cards,
with subtle pointer-inert vertical dividers only between groups. Full video keeps
human minutes/seconds, bold total-seconds parentheses and parenthesized whole
Timeline FPS/frames together, for example `전체 영상 3분 54초 (총 234초)
(24fps 기준 5,616프레임)`. New video contains only the existing total duration of
all current generated targets, not wall-clock waiting time or only a last card.
Round human/total seconds once to avoid inconsistent minute carry; retain honest
auto-duration estimate marks. Use existing delivered Timeline frame math,
including seam/clip/merged behavior. Remove only the ambiguous old cost/queue
count display, not its calculations, warnings or refine/render operations.

Generated-card facts are separate: references | THAT card's actual-family FPS
and frame count | original duration/control, for example `레퍼런스 3개 │ 24fps
기준 345프레임 │ 14.38s`. Never substitute whole Timeline or current-run frames.
Shared-pass subranges remain honestly estimated where independent snapped final
counts are unavailable. Preserve duration actions and supplied-clip filenames/
facts. Locale/font/preview aspect and lock states cannot overlap the fact groups
or move the stable right-aligned footer controls.

### EXT-69 — cast-member count before supporting files

Prepend one same-style inert Cast {count} pill to the shared CastShelf count
group before supporting-image/file counts. Count registered people, including
members with no attached file, not media or active prompt citations; add/remove
updates immediately. Retain the original action/count divider and all file-kind
counts, fold/action/keyboard behavior and asset/cast data.

### EXT-70–71 — collapsible Sound and cursor-anchored visual zoom

Sound uses the same disclosure/header font and modest contrast as the other
Timeline fields. Remove its explanatory prose, retain Add track separately and
persist folding in the existing per-node section view properties. Content stays
mounted, ARIA state/focus safeguards remain, and visual observers/captures cancel
on folding or destruction. Both requested gestures are supported: Ctrl+wheel at
the cursor, and left/right scrubby drag while the Zoom tool is ON. OFF retains
the original audio clip slide/trim operations. Fit and keyboard +/- are view-only.
The enlarged reel, lane and ruler share an independently scrollable native thin
grey horizontal rail. Bound zoom/pixels and preserve original audio frame/time,
snap, sample and generation arithmetic; visual zoom never edits saved tracks.

### EXT-72–74 — caption alignment, quiet hover help and full-work-area Timeline

Storyboard captions align right with the generated card's other facts, without
moving its footer as captions/locks/Face choices/previews change. Inline ready
video stages omit only their native hover-help title; keep accessible aria-label,
default silence, deliberate volume control, hover lifecycle, seek and double-
click large viewing. Non-hover large-stage and transport titles stay unchanged.

Timeline alone opts into edge-to-edge viewport bounds, removing outer padding,
window border/radius/shadow from both normal and existing fullscreen entry points.
Do not change other modals, browser Fullscreen API or OS windows. Existing native
body/card scrolling, Close/Escape and nested transient-layer ownership remain.
Preserve the baseline mountOverlay focus behavior; this does not add automatic
opener-focus restoration, which the baseline did not provide.

### EXT-75 — prompt-only two-press Clear before Refine

The global prompt header alone has Clear before Refine. First press is a red
Confirm clearing content label; second press clears only `timeline.prompt` and
the actual rich-text box using the existing prompt-only save hook. Confirmation
is transient and value/version/owner/widget guarded. Blur/header leave/close
cancel it; held Enter/Space cannot supply the second press. A running field,
segment or whole-piece refiner's shared owner lock refuses clearing, preventing
a late broad reply from silently replacing the cleared text. No API/model job,
other field, card, take, asset, sampler or whole-refine snapshot is changed.

### EXT-76–77 — cast target layout and rightmost existing Edit

The cast description/replacement inputs share a closer, equal left edge using
the same pixel-based label width at each type scale (38px + 104px times scale),
rather than mismatched em columns. Target-kind and Pick clip pills sit below the
Replacement target label inside that column, not at the far right of the input.
Retain exact original option/clip-selection callbacks and cast/file ownership;
localized narrow layouts wrap without overlap.

Reorder only existing generated footer elements to Trim / Crop / Edit. Edit is
rightmost, including the one-action no-take/shared cases. Actual clip cards have
Trim / Replace / Crop, not a generic Edit action; preserve those actions rather
than inventing a new editor. All original callbacks remain unchanged.

All EXT-62–69 changes remain local and unpublished. Exact prior originals and
isolated validation/hash receipts stay outside product source. These checks are
not live ComfyUI/GPU or codec/audio-fidelity proof. The new backend route requires
the user's next normal ComfyUI restart; this update does not restart it.

### EXT-53 — separate loaded/library/stack LoRA tabs and selection toggle

- The Timeline unified manager has LoRA (loaded only), LoRA library, Stacks.
  This supersedes the earlier combined pane and proposed accordion alternatives.
  Show one full-height pane at a time; loaded cards scroll through a visible
  native thin rounded rail. Preserve each pane's DOM and scroll position, lazy
  library chunks, search/folder and compatible tab preferences. Non-unified and
  swap managers retain their existing tab sets and normalize incompatible memory.
- A selected exact library file can be toggled off, synchronized with loaded X
  removal and its blue check. Single clicks wait briefly so double-click details
  do not add/remove files; keyboard actions remain immediate. Pending actions
  validate held-entry identity so replacement, X removal or stack loading cannot
  accidentally toggle a newer selection. Preserve exact version identity,
  strengths, modes, triggers, audio, Turbo, existing memory and commit callbacks.
- Pinned entries require explicit unpin before removal. A protected library
  attempt changes no data and shows a transient localized notice; Korean is
  exactly `핀을 먼저 해제해주세요`. Pin changes also refresh library presentation.
- Owners: `web/creator/{loras,viewprefs}.js`, `styles/loras.js`, and the three
  locale catalogs. Fixtures: `tests/browser/test-lora-tabs.cjs`, intentional
  superseded-view updates to `test-lora-unified.cjs`, original preference and
  Python LoRA state/memory/pin/version regressions.

### EXT-54 — stable right-aligned card editing and transport rows

- The user's final RIGHT-alignment correction supersedes the interim left request.
  Generated and supplied-clip cards reserve transport icons first and one editing
  pill second. Generated Edit/Trim/Crop and clip Trim/Replace/Crop share border,
  roundness, Card-label typography and wider horizontal padding. At large type,
  labels may wrap within their own pill segment, without overflowing the card.
  Lock/take/action availability never exchanges the two rows or their right anchor.
  Face-pass and motion badges must not alter editing-pill alignment, padding or
  row placement, including ready cards followed by an unready Edit-only card.
  Reserve translated status labels plus fixed card insets, including small type
  and missing-take labels; do not let a nowrap badge row overflow its card.
- Centre the clip soundtrack glyph inside the same square icon hitbox as its
  neighbours; show the existing enabled sound state in the error/red tone and
  expose its pressed state. The original click still changes only clip sound.
- Preview media aspect ratio changes only the media area. Card prompts must not
  absorb shared-strip spare height and shift facts, seed or footers when previews
  open, close or load portrait/landscape/ultrawide metadata. Card width still comes
  from the original duration calculation, never media dimensions.
- Owners: Timeline card DOM presentation and scoped CSS only. Preserve callback
  closures, state calculations, trim/crop/replace/move/clone/hold/delete logic,
  confirmation and read-only previews. Actual-source browser fixture:
  `tests/browser/test-card-footer-layout.cjs`.

### EXT-55 — default-silent preview with an explicit vertical volume slider

- Ready previews start at 0%, silent even on hover. The icon to the right of the
  seek bar opens/closes a bounded vertical 0–100% slider; it never toggles mute,
  writes volume, starts playback or unlocks audio by itself. Only explicit range
  input sets volume. Use a body portal so a card/strip cannot clip the slider.
- Keep volume in RAM only, by stable card key and filename. Inline and larger
  viewers of the same file share the explicitly chosen volume. A fresh session,
  new card, replacement clip or new take starts silent, including when the card
  key is reused. Never write workflow, source, render or export sound settings.
- Retain hover-only inline playback and explicit large-viewer playback. Popup
  and its small anchor gap count as the same hover area; leaving it pauses and
  silences immediately. Outside/Escape/second-icon close, owner suspend/hidden/
  offscreen/destroy, viewport resize or anchor scrolling removes the portal and
  temporary handlers. Native vertical range keys are not graph shortcuts.
  Media errors disable controls; stale play promises cannot revive an unusable
  owner, and only one preview plays at a time. A rejected audible attempt falls
  back to muted playback until another deliberate slider gesture.
- Owners: `web/creator/card-preview.js`, scoped Timeline CSS and three locale
  keys. Preserve file/range/crop resolution and the default reference viewer.
  Fixtures: updated `test-card-individual-preview.cjs` and the explicit
  `test-card-preview-volume.cjs`. This supersedes EXT-46's hover-audible/mute-toggle
  interaction only; EXT-61 separately supersedes its fresh-window display-OFF
  default. Continuous preview and selected export remain excluded.

### EXT-56 — navigation pill matches whole-strip lock controls

- Match Go to segment's height, typeface/size, padding, gap, surface and rounded
  outline to neighbouring lock pills. Compact widths preserve wrapping and
  keyboard/hit-target access. Menu values, labels, scroll/highlight and lock
  callbacks remain unchanged; owner is scoped Timeline CSS. Covered by the
  actual-source footer/navigation fixture.

### EXT-57 — One pass does not sink when ready cards grow

- Keep One pass in the seam's ordinary fixed-gap control flow. Do not use an
  auto top margin that absorbs the growing card/strip height. Preview expansion
  or aspect-ratio metadata must not shift it away from the join/sound/blend
  controls above. Retain its existing separator, merge callback and disabled
  semantics; scoped Timeline CSS only, covered by the footer/seam fixture.

### EXT-58 — one raw-input character count instead of segment prompt excerpts

- Remove the generated segment card's entire prompt-caption preview, including
  its rewrite/empty fallback, and replace it with one read-only count line.
  Count Unicode code points of `segment.prompt` without trimming, so leading/
  trailing spaces, tabs and newlines are included. Supplementary characters
  are not split into UTF-16 halves; this is not a token or compiled-prompt count.
  Do not count the separate refiner output or expose the raw text as a tooltip.
  Empty input shows 0. Thousands separators preserve an exact value rather than
  approximate compact notation, for example Korean `공백 포함 33,459자`.
- Keep the supplied-clip filename caption exactly as before. Existing input,
  rewrite, refined-status metadata, prompts, generation calculations, card
  handlers and persistence remain unchanged; rerender reads the current input.
  Owners: generated card caption, scoped CSS and one key per locale. Fixture:
  `tests/browser/test-segment-prompt-count.cjs`.

### EXT-59 — visible warning-red card-remove X only

- Colour only the normal remove X glyph on generated and supplied-clip cards
  with the same warning/red token as the modified-take badge. Do not add a pill
  background, alter its hitbox or replace the original two-press delete gate.
  Armed confirmation, cancellation, disabled reasons and deletion callbacks are
  untouched. Scoped Timeline CSS only; covered by the footer fixture.

### EXT-60 — modest fill lift on Timeline disclosure headers only

- Move only the five Timeline disclosure headers from their transparent fill to
  the existing surface-2 token, one small step above the field/body surface.
  This is slightly brighter on dark themes, with equivalent separation on light
  themes. Global prompt, soundscape, music, piece-reference and cast heads share
  this treatment in folded and expanded states. Leave main background, cards,
  text areas and all action-button fills, geometry and callbacks unchanged.
  Scope the rule to Timeline; node-face/editor/library headers retain their
  original appearance. Fixture: `test-timeline-field-contrast.cjs`.
### EXT-61 — default-on ready-preview display and last-toggle memory

- Ready preview displays by default if no saved preference exists. An explicit
  button toggle saves only `preview: on/off` in the validated display-only
  `timeline:preview` context. Stored OFF is distinct from missing. Closing the
  window, reloading the same browser or restarting ComfyUI restores that choice.
  This supersedes EXT-46's initial display-OFF behavior, not its file/source rules.
- Keep the existing bounded/versioned storage and denied-storage session fallback.
  Opening the Timeline only reads this preference; it never writes workflow data,
  renders, attaches media or changes saved source/audio settings. Preview volume
  remains a separate RAM-only setting and starts at 0% in a fresh session even
  when preview display restores ON. Ordinary ready clips and saved adopted takes
  remain usable without another generation.
- Owners: `web/creator/{timeline,viewprefs}.js`. Actual-source fixture:
  `tests/browser/test-card-preview-preference.cjs`; original header/preview
  regressions explicitly accommodate the new display default.
- Recoverable originals and isolated candidate/installed evidence for EXT-53–61
  remain outside product in `local LoRA/preview verification archive`. Browser
  refresh loads these frontend-only changes; no backend/server restart, real
  API/model/GPU execution, user workflow/media edits or Git publication is done.

### EXT-52 — visible right-edge whole-Timeline scrollbar

- Reveal the native scrollbar of the existing direct-child Timeline body;
  do not create another scroll container or synchronize scroll positions.
  Match the media picker/popover's thin grey thumb, rounded corners and
  transparent track. Reserve the right gutter to avoid layout shifts when
  disclosures or ready previews increase the body's content height.
- Keep the title/settings header outside this body. Its whole vertical range
  includes prompt/audio/reference/cast controls, card previews and the bottom
  sound lanes. Preserve the card strip's independent horizontal scrollbar and
  all nested editor/picker scroll behavior. Short content needs no active thumb.
- Production owner: `web/creator/styles/timeline.js` only. No JS/Python/API,
  callbacks, prompts, workflow persistence, playback or locale catalog changes.
  All cumulative EXT-01–51 behavior remains intact. Regression fixture:
  `tests/browser/test-timeline-body-scrollbar.cjs`.
- Local baseline/candidate/installed evidence and recoverable originals stay
  outside product in `local scrollbar verification archive`.
  Browser refresh suffices for this CSS-only update; no server restart or
  repository publication is performed by this patch.

### EXT-51 — separate header actions from file-count pills

- Scope only the Timeline leading-action reference/cast headers that contain
  both an action group and read-only media-count pills. Add one pointer-inert,
  non-focusable decorative rule between them, matching the title divider's
  existing gradient/opacity. No new semantic control or separator text is added.
- Keep count wrapping and separate-row compact layouts. At the existing 640px
  breakpoint the count row remains indented and the vertical rule disappears;
  an empty action group and unrelated field/library/node-face headers get none.
- Owner: `web/creator/styles/timeline.js` only. Labels, count calculations,
  actions/click/keyboard behavior, folding, persistence, refiner paths, Python,
  workflows/media and all earlier EXT-01–50 features remain untouched.
- Exact local baseline/candidate/installed evidence is retained outside product
  source in `local header-divider verification archive`. This frontend-only
  addition needs a safe browser refresh; EXT-50's backend restart requirement
  still applies until its new API has been loaded.

### EXT-50 — field-only Refine, distinct from Refine all

- Every plain Refine changes only its selected input. Simple Creator/node
  editors apply a prompt-only rewrite; structured segment editors use the
  selected-section or combined-segment contract above. Timeline global prompt,
  soundscape and music have separate compact header pills. No sibling prompt, global/audio
  field, model/sampling setting or whole-piece rewrite metadata is applied by
  those controls. Prompt-only Revert does not restore whole-piece audio/global
  content. Existing manual audio controls retain their availability.
- The new `kind: field` API validates scope/field/index before model work and
  returns one body, never a piece/shot array to apply. Context/reference/cast and
  language/backend/model/template/custom-skill settings are read-only guidance;
  they do not grant permission to rewrite other fields. The original prompt-only
  segment scope was expanded by the 2026-10-24 integration: summary, retention
  analysis and combined segment sections are also supported. Empty/clip-only
  timelines can refine their own fields.
- Keep the original whole-piece route, Refine all application and Revert all
  behavior. Its button remains explicitly labeled Refine all even after a
  rewrite. The shared EXT-49 transient, two-press red Confirm gate protects both
  operations. A plain Refine must never silently fall back to the broad route.
  A transient owner-keyed lock prevents overlapping whole/field requests for
  the same piece; it releases after success, stale rejection or failure and is
  never serialized. Different pieces remain independent.
- Reject stale replies after the selected input changes (including edit-and-
  restore) or owner/input replacement. The earlier view-closure rejection is
  superseded by the retained-modal contract above: merely hiding the same live
  editor keeps its pending reply. Unrelated edits survive.
  Remove collapsed global/audio prose hints, not their underlying field values;
  retain the existing reference/cast file-count pills, N/A confirmation and Undo.
- Primary owners: `creator/refine_routes.py`, `web/creator/{refine,editor,timeline}.js`,
  `web/creator/styles/timeline.js` and the three locale dictionaries. New tests:
  `tests/test_refine_fields.py` and `tests/browser/test-field-refine.cjs`; update
  only earlier fixture expectations explicitly superseded by this contract.
- This is the first backend change after EXT-49. Save the workflow, restart
  ComfyUI and refresh its browser to load it. An older running backend rejects
  the field-only request before model work; the frontend reports that no fields
  were changed. Installation does not restart processes or edit workflows/media.
- Verification is isolated browser/API/model-stub evidence, not live LLM output,
  GPU rendering, server restart or user workflow testing. Exact hashes and
  validation evidence are retained outside product source in
  `local field-refine verification archive`.

### EXT-49 — two-press prompt-refine confirmation

- The shared `refineButton` gates every prompt rewrite: the Creator node face,
  segment/nested editors and timeline Refine all/again. Its first press only
  shows a red localized Confirm label; only the second press on the same live
  control calls the original execution callback with its progress options.
- Confirmation is transient UI state, never a workflow property, refiner setting,
  saved preference, generation field or network request. Pointer leave, Escape,
  focus/outside changes, settings access and owner replacement cancel it.
  Keyboard auto-repeat and stale detached controls must not bypass confirmation.
- Refiner settings, DLSS enhancement controls, chat sends, existing rewrite
  enable/disable and Revert actions are not prompt-refine execution buttons.
  Their behavior and all backend rewrite/application logic remain unchanged.
- Owners: `web/creator/refine.js`, `web/creator/styles/refine.js` and the three
  locale dictionaries. Regression: `tests/browser/test-refine-confirmation.cjs`,
  plus the existing timeline-header callback test adjusted to two presses.
- Verification uses real frontend code with isolated callbacks/API stubs, not
  live model calls, GPU rendering or edits to user prompts/workflows.

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

The earlier exclusion of workflow-tab preview preservation is superseded by the
2026-10-24 integration's owner-scoped runtime snapshots. Automatic exact
source-audio copying/remuxing and completed technique-library translations
remain outside this record's delivery claims. Discussion alone is not implementation.

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

## 2026-10-09 — local-only UI usability revision

Status: staged and tested locally, not published to GitHub. No upstream revision
is absorbed. This revision starts from an untouched snapshot of the user's
installed node, not by replacing it with the 2026-10-08 publishing checkout.
The earlier entries and their historical verification claims above were copied
from that publishing checkout as integration history; they are not claims that
all of its files or tests exist in this installation. Existing installed branding
is retained, not repaired as part of this UI task.

### Feature map additions

| ID | Behavior | Primary owners | Focused browser checks |
| --- | --- | --- | --- |
| EXT-09 | Collapsed prompt/audio one-line summaries | `web/creator/{disclosure,timeline}.js`, `web/creator/styles/timeline.js` | `test-timeline-usability.cjs` |
| EXT-10 | Go to numbered segment without opening its editor | `web/creator/timeline.js`, `web/creator/styles/timeline.js` | `test-timeline-usability.cjs` |
| EXT-11 | Display sorting and Shift-range import selection | `web/creator/picker.js`, `web/creator/styles/picker.js` | `test-picker-usability.cjs` |
| EXT-12 | Hover/focus existing file metadata | `web/creator/picker.js`, `web/creator/styles/picker.js` | `test-picker-usability.cjs` |
| EXT-13 | Distinct hover/focus/selected states and scoped scrollbars | `web/creator/styles/picker.js` | `test-picker-usability.cjs`, CSS ownership contract |
| EXT-14 | Field-specific N/A Undo | `web/creator/timeline.js`, `web/creator/styles/timeline.js` | `test-timeline-usability.cjs` |
| EXT-15 | Read-only reference and model-valid match durations | `web/creator/editor.js`, `web/creator/styles/editor.js` | `test-duration-match-usability.cjs` |
| EXT-07 amendment | Labels for existing snap targets | `web/creator/soundlane.js`, `web/creator/styles/timeline.js` | `test-sound-snap-labels.cjs` |

Test names in the last column are under `tests/browser/`. New source strings
have Korean, Japanese and Chinese translations in
`web/creator/locales/{ko,ja,zh}.js`; English uses source fallback.

### Contracts and merge notes

- **EXT-09:** only collapsed global prompt, soundscape and music gain summaries.
  Render plain text, normalize whitespace, limit to 84 Unicode code points and
  ellipsize visually. Empty and literal `N/A` are distinct. Refresh after direct
  editing, refinements/reverts and reopen. Do not store a second copy of prompt
  text or alter EXT-02 disclosure persistence.
- **EXT-10:** selecting a number scrolls the existing card into view and briefly
  outlines it. Generated and clip cards both have a view-only index attribute.
  Repeat selection works. Fewer than two cards omit the control. Do not open an
  editor, seek playback, change locks/solo, commit or alter generation data.
  Respect reduced-motion preference.
- **EXT-11:** recent-modified and natural-filename sorting affect the displayed
  rows only. Existing attachments and selected return order are not reordered.
  Shift selection extends from the last normal selection only in supported
  multi-import contexts, respecting capacity, track buckets and existing options.
  Preserve single/view-only/organize behavior and per-file/bulk choices.
- **EXT-12:** info panels use metadata already received for the row. Missing
  dimensions, size or duration remain omitted. No file probing or additional
  requests for hover. Preserve established single/double-click preview behavior.
- **EXT-13:** style selectors are owner/context-qualified. Keep keyboard focus
  distinct from selected state, normal fonts and ordinary control geometry.
  Do not add CSS ownership exceptions to hide selector collisions.
- **EXT-14:** Undo restores only the most recently N/A-cleared field's exact
  prior text/property absence. It expires after eight seconds, delayed while
  focused. Any later edit/refine/import/revert of that field invalidates it.
  Never overwrite later text or revert the rest of the timeline. This is not a
  general history feature, a silence guarantee or an audio waveform operation.
- **EXT-15:** rename the existing action to Match length and show the reference
  duration separately from its model-valid target. Keep `S.lengthMatch`,
  matched/automatic states and the existing duration action unchanged. Reference
  duration may reflect trim, so do not call it an unconditional full source
  duration. This does not implement exact audio synchronization.
- **EXT-07 amendment:** keep the existing left magnet, off-by-default choice,
  seven-pixel radius, either-edge matching, `snapPoints`, `snapMove`, drag/trim
  and commit implementation. Add read-only target labels and precise time/frame
  to the existing hairline. Shared boundaries show both segment identities,
  including merged cuts and continuation trim via delivered windows and
  sampled offsets. An end boundary is the instant the final frame finishes,
  not an extra target one frame earlier. Clamp the label only, not the target.

No new saved workflow keys, routes, dependencies, generator/model/audio logic,
source-audio copying, duration policy, cancelled tab-preview feature or Git
changes are introduced. This is a frontend-only update: save the workflow and
refresh the browser when safe; a backend restart is not required for this revision.

### Local verification boundary

The four new isolated browser suites cover 49 checks (13 timeline, 17 picker,
8 duration, 11 sound labels), with zero network requests. They use actual source
methods/CSS with explicit local API/model fixtures. Existing reference-preview,
style-scroll and timeline sections suites cover a further 46 checks.
Responsive Korean layouts, large UI text and reduced motion are covered.
These are not live ComfyUI, native folder-chooser or GPU-render tests.

Eight selected frontend Python contracts are rerun. The untouched baseline's
`test_sound_persist.py` has five failing assertions because its old fixture
expects snapping without enabling the opt-in magnet; candidate repeats those
same failures. Preserve this limitation explicitly; do not infer changed timing
or claim the entire upstream suite passes. A separate sound-mirror check covers
two model families and 48 lanes using a Windows file-URL runtime adapter only.

The old timeline extraction fixture omitted methods its production mount calls.
This revision repairs that harness without substituting product implementations;
`CONTINUITY_SOURCE_ROOT` and explicit `CONTINUITY_BASELINE_FIXTURE=1` allow the
same 18 checks against the untouched baseline. Hidden summary text is not treated
as the header name. Keep this separation when refactoring future fixtures.

Deployment is limited to the listed UI/test/documentation owners. Targeted files
must match the installation snapshot before copying; verify deployed hashes
afterward. Backup, manifest and detailed validation evidence are kept outside the
node under `local UI verification archive`. Do not infer delivery merely from
the existence of this record.

## 2026-10-09 — local unified LoRA manager revision (EXT-16)

Status: local implementation, not published to GitHub. The baseline is the
installed node after the preceding 2026-10-09 UI revision; no newer upstream
commit is absorbed. A separate untouched snapshot and staging tree are kept in
`local LoRA/card verification archive`.

### Scope and owners

- `web/creator/timeline.js`: keep pin initialization, hide the inline global
  LoRA rail, and enable the unified manager only from the timeline's normal
  LoRA entry point. The main-face and segment/prestage/swap managers retain
  their existing default mode.
- `web/creator/loras.js`, `web/creator/styles/loras.js`: the same LoRAs tab shows
  a bounded attached list above a browse/add-only library. No extra management
  tab is added. The existing saved Stacks tab remains available.
- `web/creator/locales/{ko,ja,zh}.js`: localized new section/action labels;
  English keeps source fallback.
- `tests/browser/test-lora-unified.cjs`: optional isolated actual-source
  controller/state-helper/CSS regressions. Existing test_js_bodies.py now
  asserts the explicitly requested hidden timeline rail, rather than clicking
  controls that were intentionally moved. Its shot-face checks are unchanged.

### Contracts to preserve

- The top list follows the existing attached order, including muted, inactive,
  missing-file and alternate-version entries. Searching another folder below
  cannot hide or remove the current configuration. Missing metadata is a view
  status, not an instruction to discard saved settings.
- Reuse existing strength, checkpoint claim, audio/unconditional, trigger,
  mute, remove, family pin and file-replacement operations. Controls exist only
  above, not twice in the lower library. Preserve active control focus/caret
  while metadata arrives or an ordinary value is edited.
- The lower library adds files and previews/details. Already-added cards cannot
  toggle removal. Browsing a version must not silently replace an attached
  version. Double-click preview must preserve selection.
- Only attached names receive bounded metadata hydration beyond the existing
  folder listing. Do not rescan every library folder to populate the top list;
  stale/closed responses may update no UI or canonical state.
- Keep preset Stacks loading, applying, saving and deleting. Applying a stack
  refreshes the attached list. Preserve family-pin preferences and shared-memory
  updates when the manager records ordinary LoRA settings.
- Hiding the timeline rail must still initialize/settle its family pins and keep
  the original LoRA pill's active/idle counts. Do not change any LoRA weights,
  routing, order or saved creator_data merely to change presentation.

No backend, schema, dependency, generator/audio processing or upstream update
is included. At this milestone the sound-magnet position, delete-confirmation
hit area and display-only number badge were held. The user later explicitly
authorized all three on 2026-10-10; EXT-27–29 below supersede that hold. Their
local-only registry is named `pending-changes.json`.

Selected frontend and isolated-browser verification is recorded outside the node
in the task directory. It is not a live ComfyUI/GPU render. Guard the deployed
files against this revision's snapshot and verify their final hashes. This record
alone is not proof of deployment.

## 2026-10-09 — local main-node toolbar revision (EXT-17)

Status: local implementation, not published. This follows EXT-16 in the same
snapshot/staging directory and does not absorb an upstream update.

### Scope and owners

- `web/creator/timeline.js`, `TimelineBody` only: move the former Fullscreen
  and Pre-stage panel actions into the top tool rail after Clear, preserving
  callbacks, availability and Pre-stage active state. Remove only this body's
  bottom Edit timeline control; existing prompt/strip actions still open the
  editor. Add an optional Tools callback with the same rail tile styling.
- `web/creator.js`: supply a deferred Tools callback to the strip body only.
- `web/creator/fullscreen.js`: `openFullscreenTools(node)` opens/reuses the
  existing fullscreen shell and calls its existing dashboard. It does not
  clone destinations or execute a tool merely by opening the dashboard.
- `web/creator/styles/timeline.js`: scope the active Pre-stage tile styling
  to the main node rail. Preserve existing fullscreen/simple-view hiding rules.
- `tests/browser/test-node-toolbar.cjs`: isolated actual-source rail, panel,
  callback, CSS and dashboard-adapter coverage. The strip-fullscreen JS-body
  fixture now looks for the moved top tile rather than the removed bottom pill.

### Contracts to preserve

Keep the single-shot, segment and Pre-stage editor rails unchanged. Keep
render/model parameters, references, timeline access, node IDs and saved data
unchanged. Each rail action invokes its original callback once. Tools opens the
existing dashboard containing Presets, ControlNet, Blockout, Chat, Upscale and
Image-to-3D; navigation remains inert until a destination is chosen. No model,
queue or render request is introduced by this adapter.

The optional browser fixture covers all eight callback-availability combinations,
reference-disabled families, active Pre-stage accessibility, existing fullscreen
gates and a narrow Korean large-text rail. Detailed results and deployment proof
remain outside the node. These are isolated frontend tests, not a live ComfyUI
or GPU-render test. No backend, schema, dependency or Git publication is included.

## 2026-10-09 — local timeline presentation revisions (EXT-18–20)

Status: local implementation, not published. These build on EXT-16/17 in the
same staging/snapshot directory. No new upstream revision is absorbed.

| ID | Behavior | Implementation owners | Checks |
| --- | --- | --- | --- |
| EXT-18 | One rounded bubble per foldable timeline area, subtle thematic dividers | `web/creator/styles/timeline.js` | `tests/browser/test-timeline-disclosure-look.cjs` |
| EXT-19 | Align segment control pills, leave length facts below | `web/creator/styles/editor.js` | `tests/browser/test-duration-match-usability.cjs` |
| EXT-20 | Dedicated Go-to-segment row above cards, divider above | `web/creator/timeline.js`, `web/creator/styles/timeline.js` | `tests/browser/{test-timeline-usability,test-timeline-disclosure-look}.cjs` |

### Contracts to preserve

- **EXT-18:** scope to the timeline modal. The five existing disclosures use a
  single 20px outer border with borderless inner header/editor frames, so an
  expanded area is not two independent boxes. Preserve mounted editors and
  lists, `mmc_timeline_sections`, text, citations, independent header actions,
  warnings and all listeners. Leave overflow visible so popovers are not clipped;
  keep keyboard focus visible. Dividers are translucent and non-interactive.
  Ordinary node-face, segment, card and chip geometry stays unchanged.
- **EXT-19:** only pill rows containing an immediate duration/readout wrapper
  use top alignment. Their actual pills share the same top line; the existing
  reference/model-valid target readout stays below its own control. Rows without
  the wrapper retain centered alignment. `editor.js`, `S.lengthMatch`, duration
  actions and continuation logic remain unchanged; no source audio or timing
  policy is introduced.
- **EXT-20:** mount a dedicated navigation host between the hidden LoRA rail and
  card strip, not inside the settings bar. `renderNavigation()` draws the existing
  selector and hides the row when fewer than two segments exist. Preserve the
  existing exact indices, view-only scroll/highlight, repeat selection, live
  status and reduced-motion behavior. Do not change locks/solo, playback, render
  settings or saved timeline data. Its visual separator remains above the row.

Actual-source isolated browser checks cover expanded/collapsed boundaries,
actions/focus/menu overflow, warning/ordinary-control isolation, localized
large-text layouts, matched/unmatched duration rows and the navigation row.
Detailed counts, known baseline harness limitations and deployed SHA verification
are kept in the task directory, separate from the node. These are not live
ComfyUI or GPU/render tests. The three held requests were untouched at this
milestone; the later explicit authorization and EXT-27–29 supersede that hold.

## 2026-10-10 — local generated-card action grouping (EXT-21)

Status: local implementation, not published. This continues the 2026-10-09 work
in `local LoRA/card verification archive`; it does not update upstream code.

- `web/creator/timeline.js`, generated `renderCard()` footer only: wrap its
  existing Edit and optional `takeTools()` actions in one card-specific group.
  Their order is Edit, Trim, Crop (Korean: 편집, 구간 자르기, 자르기). No action
  is invented when a take is missing or shared-pass rules omit Trim/Crop.
- `web/creator/styles/timeline.js`: one rounded outside border and internal
  separators for that group; motion-fix status gets a pill-shaped outline.
  Preserve active-state distinction and visible keyboard focus. Do not apply
  this generated-card group to clip cards or ordinary editor buttons.
- `tests/browser/test-segment-card-pills.cjs`: actual-source isolated callbacks,
  availability, motion toggle, card controls and localized layout coverage.

Keep Edit/Trim/Crop and motion-fix callbacks, state, labels and tooltips unchanged.
Keep right-side Move earlier/later, clone and delete behavior. The motion status
is an existing toggle, not a new motion-processing feature. The separately held
delete-confirmation hit area, temporary sibling hiding, display-only yellow number
badge and sound-magnet relocation were excluded at this milestone. The user's
later authorization is implemented separately as EXT-27–29 below.
No backend, generation, audio, schema, dependency or Git publishing is included.

## 2026-10-10 — local view convenience revisions (EXT-22–26)

Status: local implementation, not published. These continue in the existing
`local LoRA/card verification archive` snapshot/staging tree.

| ID | Behavior | Implementation owners | Checks |
| --- | --- | --- | --- |
| EXT-22 | Larger handle replacement picker and read-only thumbnail previews | `web/creator/{prompt,reference-preview}.js`, `web/creator/styles/{editor,overlays}.js` | `tests/browser/test-handle-replacement-preview.cjs`, existing handle/reference preview suites |
| EXT-23 | Rounded, keyboard-accessible segment navigation menu | `web/creator/timeline.js`, `web/creator/styles/timeline.js` | `tests/browser/test-timeline-usability.cjs` |
| EXT-24 | Compatible last library tab/folder/sort/filter memory, display only | `web/creator/{viewprefs,picker,loras,presetlib,wears}.js` | View-preference store/modal checks and existing picker/LoRA/preset contracts |
| EXT-25 | Stable take/motion/face status row | `web/creator/timeline.js`, `web/creator/styles/timeline.js` | `tests/browser/test-segment-card-pills.cjs` |
| EXT-26 | Explicit Edit-only generated-card entry | `web/creator/timeline.js` | `tests/browser/test-segment-card-pills.cjs` |

### Contracts to preserve

- **EXT-22:** enlarge only replacement mode to 540px width and an 840px preferred
  overall height, both clamped to the viewport. Inputs, scope and actions stay
  visible; the flexible list fills the remaining space and scrolls. Ordinary
  autocomplete is unchanged.
  A thumbnail double-click previews a currently available source without selecting
  or applying another handle. Single click still chooses. Resolve current media
  before opening, keep the parent picker state while the viewer is open and clean
  media/listeners on close. The shared viewer's optional `includeAudio` defaults
  to false, preserving previous visual-only callers; opt-in audio uses native
  controls, no autoplay. No source crop/trim or soundtrack is modified. Keep
  manual input, exact-occurrence/exact-all semantics, stale-state guards, keyboard,
  cast shortcut and focus restoration. UI rows avoid nested interactive buttons.
- **EXT-23:** replace the native select popup with a scoped 20px rounded menu.
  Preserve view-only indices and card highlighting. Keep arrow/Home/End/Enter,
  Escape, outside dismissal and visible keyboard focus. Close the menu on timeline
  refresh/close, reject stale segment objects, and bound/scroll long lists. This
  is not a remembered generation selection or a lock/solo shortcut.
- **EXT-24:** keep display preferences in a separate versioned, bounded browser
  store with safe parse/storage-denied fallback and per-context patches. Remember
  only supported tabs, visible query/filter, folder and display sort. Explicit
  caller constraints/reveal/restyle win, incompatible tabs and removed folders
  fall back safely, and restored search text stays visible. Reuse existing folder
  grants, selected-folder refresh and semantic LoRA preferences; do not create a
  second registry or overwrite actual user library data. Wears remembers only its
  visible supported family tab, never the configured/send family or media. Never
  restore selected/marked files, armed deletion, import MAX/MATCH/roles, preset/LoRA
  application, prompt/model/sampler values or replacement single/all scope.
  Fullscreen and other surfaces with existing display memory retain it. The current
  snapshot contains no separate technique-library module; do not recreate historic
  surfaces to implement these preferences.
- **EXT-25:** group only existing take/motion/face controls in a no-wrap status
  row; leave other metadata separately wrap-capable. Reserve sufficient minimum
  width only where the take and face control need it, scaling with UI text instead
  of shrinking labels. Toggles, take-forget behavior, availability and workflow
  state remain unchanged, including face/no-face label changes.
- **EXT-26:** remove only generated-card background double-click edit entry.
  Clicking its Edit button opens the segment editor. Background/prompt/status
  clicks cannot accidentally open it. Preserve every individual status, seed,
  ordering, clone and deletion action. Supplied clip cards retain their existing
  separate Trim/Replace/Crop behavior. Delete confirmation and number-badge
  changes are recorded separately under the later-authorized EXT-28/29.
  Existing JS-body and segment-card fixtures now open through the actual Edit
  button; the latter also asserts that prompt/background double-click stays
  closed. Other body/layout assertions are retained, not bypassed.

No backend, generation, source-audio, dependencies, workflow schema, new upstream
update or Git publication is included. Selected actual-source frontend/browser
proof is recorded separately from live ComfyUI/GPU-render proof. Do not infer
deployment from this ledger; final SHA checks remain in the task directory.

## 2026-10-10 — explicitly released card/sound controls (EXT-27–29)

Status: authorized local implementation, not published. The user explicitly
released all three formerly held requests together on 2026-10-10. This entry
supersedes earlier milestone statements that they remain unimplemented.

| ID | Behavior | Implementation owners | Checks |
| --- | --- | --- | --- |
| EXT-27 | Sound magnet immediately left of the bottom-right remove button | `web/creator/styles/timeline.js` | `tests/browser/test-final-card-controls.cjs`, existing sound-snap tests |
| EXT-28 | Full delete-confirmation hit area; temporarily hide neighboring transport actions | `web/creator/timeline.js`, `web/creator/styles/timeline.js` | `tests/browser/test-final-card-controls.cjs`, existing generated-card tests |
| EXT-29 | Always-yellow, display-only segment number | `web/creator/timeline.js`, `web/creator/styles/timeline.js` | `tests/browser/test-final-card-controls.cjs`, existing generated-card tests |

### Contracts to preserve

- **EXT-27:** change positioning only, retaining separate control hit targets,
  hover/focus visibility and the original magnet toggle. Keep controls within
  the clip. Ultra-short clips narrower than the space needed for two horizontal
  controls retain the safe vertical fallback; do not enlarge their visual
  duration or put controls over neighboring clips. The entire sound-lane source,
  frame snapping, continuation/trim math and stored sound values are unchanged.
- **EXT-28:** the full visible confirmation rectangle is a button target; stop
  its click/pointer bubbling so it cannot open the card editor. While armed,
  hide only the adjacent move-earlier/move-later/clone group, not Edit/Trim/Crop
  or status controls. Preserve the original two-step delete, disarm lifetime,
  outside dismissal and removal/state behavior; return controls on dismissal.
- **EXT-29:** the number is a readout, not a redundant execution/lock shortcut.
  Keep it yellow without hovering, remove its click/keyboard execution behavior
  and action tooltip. Preserve segment numbering and the separate right-side
  lock control, including saved held states. No render/state helper is rewritten.

Do not re-enable the cancelled workflow-tab preview preservation feature. These
changes introduce no generator, source-audio, backend, schema or dependency
changes and are not an upstream merge. Use the untouched snapshot and scoped
tests when integrating future upstream changes; a ledger does not guarantee a
conflict-free merge. Deployment and isolated verification evidence are kept in
the local task directory, separately from live ComfyUI/render validation.

## 2026-10-10 — local timeline header and status spacing (EXT-30/31)

Status: local implementation only, not published. The baseline is the fully
verified EXT-16–29 installed revision; no upstream update or earlier change is
discarded. A fresh snapshot and complete source stack are kept in
`local Timeline-header verification archive`.

| ID | Behavior | Implementation owners | Checks |
| --- | --- | --- | --- |
| EXT-30 | Shared settings beside Timeline title; vertical divider; whole-strip locks beside card navigation | `web/creator/timeline.js`, `web/creator/styles/timeline.js` | `tests/browser/test-timeline-header-layout.cjs`, existing body/navigation/disclosure/lock contracts |
| EXT-31 | Even take/motion/face status spacing, including conditional absence | `web/creator/styles/timeline.js` | `tests/browser/test-segment-card-pills.cjs` |

### Integration contracts

- **EXT-30:** move the existing `barHost` into the Timeline modal header rather
  than duplicating controls. Preserve every setting's original callback, label,
  tooltip and capability/availability gate, including conditional storyboard,
  sound-tail, one-pass mode and refine/revert controls. A decorative vertical
  divider separates title from controls; the close button has its own column.
  Compact windows wrap/scroll only the settings, keeping the title and close
  reachable. Existing portaled popovers are not turned into clipped inline menus.
- Split only presentation: the new `summaryHost` retains original duration,
  queue-cost, refusal and refine-error readouts below the input areas. It does not
  recalculate frame counts or change sampling, geometry or audio semantics.
- `renderNavigation()` draws the existing Go-to-segment control followed by the
  original `holdAllPills()` result. Preserve that helper exactly, including
  Lock all, conditional Forget missing takes, Unlock all, disabled/gated states
  and merged-pass/supplied-clip policies. Hide this row only when both navigation
  and all lock-related actions are absent; one missing group must not hide the other.
- **EXT-31:** use left alignment and a constant 6px gap, removing status-child
  auto margins that pushed take and repair controls to opposite card edges.
  Conditional controls leave no reserved gaps. Preserve labels, font sizes,
  one-line height, callbacks and exact take/hold/repair state operations. Reserve
  sufficient minimum width only for combinations whose unshortened labels need
  it, including short cards with missing-file takes.

The card fixture tests 384 optional/status/layout combinations and original
actions using actual source. Existing navigation/disclosure fixtures keep their
no-hold scenarios explicit; new header checks cover the actual lock helper.
No generation, source-audio, workflow schema, backend, dependencies, GitHub
publication or cancelled workflow-tab preview persistence is introduced.

Final deployment hashes, tests and untouched snapshot are recorded in the task
directory. Isolated-source browser checks are not live ComfyUI/GPU-render proof.

## 2026-10-10 — local cast details and menu readability (EXT-32–35)

Status: local implementation only, not published. The baseline includes the
verified EXT-30/31 header/card-spacing revision. Source, snapshot and deployment
evidence are kept separately in `local cast-detail verification archive`.

| ID | Behavior | Implementation owners | Checks |
| --- | --- | --- | --- |
| EXT-32 | Labeled cast description, replacement directly below, retention marker next | `web/creator/cast.js`, `web/creator/styles/cast.js` | `tests/browser/test-cast-detail-layout.cjs`, original cast contracts |
| EXT-33 | Bounded supporting-reference role-menu preview, double-click larger viewer | `web/creator/cast.js`, `web/creator/dom.js`, `web/creator/styles/cast.js` | `tests/browser/test-cast-detail-layout.cjs`, original preview/popover/role contracts |
| EXT-34 | Faded separator between card strip and sound lane | `web/creator/styles/timeline.js` | actual-source CSS/geometry checks; sound and Timeline sources frozen |
| EXT-35 | Wider model/weights menu; one-line animated long filenames and viewport cap | `web/creator/models.js`, `web/creator/styles/stage.js` | `tests/browser/test-model-menu-width.cjs`, model/routing source invariants |

### Integration contracts

- **EXT-32:** only rearrange the shared CastShelf presentation. Preserve the
  description input's existing placeholder variants and touch/blur/pointer
  handlers. The existing `placeRow()` retains its conditional availability,
  replacement text writes, clip selector and replacement semantics. It is not
  forced visible when the original conditions would hide it. Move the exact
  retention button into `markerButton()` below these fields; features stay in
  their original section, and derived/manual marker logic is unchanged.
- **EXT-33:** only file-role menus gain a preview under the `@handle` title,
  before existing notes/trigger inputs. Image/RefMod stills use contained imagery;
  video uses a first-frame thumbnail until the larger viewer is opened; audio
  uses a non-playing symbol and filename. Do not autoplay or edit media. Unsupported
  or missing-filename entries stay selection-only; missing files show an error.
- Reuse `openReferencePreview()` unchanged for the larger image/video/audio
  viewer. Preserve typed menu fields and scroll position while it is open,
  restore focus on close, and clean up the viewer when its owning menu is closed.
  The optional `dismissable(..., {suspended})` predicate defaults to false and is
  enabled only for this nested-preview gesture. Explicit parent cleanup must
  still work while dismissal is suspended. Ordinary popovers retain their
  original outside-click/Escape and checked-row scrolling behavior.
- **EXT-34:** use a scoped decorative pseudo-element with the same gradient and
  non-interactive pointer behavior as the existing Timeline separators. Do not
  modify sound drag/snap/frame math, sound data, card behavior or layout hosts.
- **EXT-35:** scope width and filename motion to the weights menu only, roughly
  doubling its original 380px width to 760px within viewport bounds. The user
  superseded filename wrapping with a slow, one-line back-and-forth animation
  for overflowing names, with brief rests at both ends. Names that fit do not
  move. Preserve the stationary button hit area and full filename access, honor
  reduced-motion preferences, and dispose presentation observers on repaint and
  menu close. Do not change model file choices, loaded values, routes, capability
  gates, catalog/remembering logic or original callbacks.

These changes introduce no backend, generator, state schema, dependency, audio
processing, workflow/media mutation, GitHub publication or upstream merge.
All prior Extended changes and the cancelled workflow-tab preview-persistence
decision remain intact. Future upstream integration should compare this ledger
and exact source contracts rather than assuming a conflict-free merge.

Final hashes and tests belong to this task directory; isolated browser tests
are not proof of a live ComfyUI session, real render or codec/acoustic fidelity.

## 2026-10-10 — local Timeline section header actions (EXT-36)

Status: local implementation only, not published. The baseline includes the
verified EXT-30–35 header/card/cast/preview/model-motion updates. The frozen
candidate snapshot was verified against all 2,627 installed source hashes before
this revision's deployment. Source and evidence live separately in
`local section-action verification archive`.

| ID | Behavior | Implementation owners | Checks |
| --- | --- | --- | --- |
| EXT-36 | Compact pill actions between Timeline section title and hint | `web/creator/disclosure.js`, `web/creator/timeline.js`, `web/creator/cast.js`, `web/creator/styles/timeline.js` | `tests/browser/test-timeline-leading-actions.cjs`, prior disclosure/header/cast/N/A contracts |

### Integration contracts

- `createDisclosure({actionsBeforeHint})` is opt-in and defaults to false. Only
  Timeline's soundscape, music and reference sections plus its shared CastShelf
  host opt in. Global prompt and ordinary/main-node/library disclosure headers
  preserve the original default layout and semantics.
- The leading layout uses a title/chevron toggle, the existing independent
  action host and the existing hint in that reading order. Never nest a button
  inside another button. Preserve existing setOpen/setText/setHint/setActions
  behavior, section state storage, ARIA and focus/undo handling. Hint/unused-header
  clicks retain section toggling; an action must not toggle the section.
- Preserve the original N/A, reference Add and cast-library/add button nodes,
  handlers, conditional visibility and disabled states. Style only the opted-in
  Timeline action host as compact rounded pills with regular gaps; do not turn
  their data operations into new implementations or restyle all global buttons.
- Localized compact layouts may wrap title/action/hint groups in order without
  overlapping hitboxes, clipping actions or reducing the user's font size.
  Expanded sections retain their previously unified outline and hint policy.
- All previous cast detail fields, role-menu previews, model filename animation,
  lock/navigation placement, status spacing and sound operations stay intact.
  No backend, generation, schema, dependency, GitHub/upstream, workflow or media
  changes; cancelled workflow-tab preview persistence remains excluded.

Exact deployment hashes, untouched baseline and isolated verification results are
recorded in this task folder, not substituted for live ComfyUI/GPU-render proof.

## 2026-10-10 — local timeline, card and cast refinements (EXT-37–48)

Status: local implementation only, not published. Baseline contains all prior
Extended changes through EXT-36; do not replace those changes during integration.

| ID | Behavior | Implementation owners | Checks |
| --- | --- | --- | --- |
| EXT-37 | Left-aligned strip summary; independent audio bubble heights | `web/creator/styles/timeline.js` | `tests/browser/test-timeline-audio-independence.cjs`, original header/disclosure/leading-action checks |
| EXT-38 | Right-aligned card statuses; swapped footer groups and matching edit-label font | `web/creator/timeline.js`, `web/creator/styles/timeline.js` | `tests/browser/test-segment-card-pills.cjs`, existing confirmation/action checks |
| EXT-39 | Top-row type/retention pills and rest-visible cast inputs | `web/creator/cast.js`, `web/creator/styles/cast.js` | `tests/browser/test-cast-detail-layout.cjs`, original cast-editor/marker/input contracts |
| EXT-40 | Two-press N/A confirmation before the original field operation | `web/creator/timeline.js`, `web/creator/styles/timeline.js`, `web/creator/locales/ko.js` | `tests/browser/test-timeline-na-confirmation.cjs`, updated original N/A/Undo/disclosure tests |
| EXT-41 | Add person then shorter Library header action | `web/creator/cast.js` | cast header order/label/add/library callback checks |
| EXT-42 | Separate reference/cast file-type count pills instead of long header instructions | `web/creator/media-counts.js`, `web/creator/disclosure.js`, Timeline/Cast header presentation, cast CSS/locales | `tests/browser/test-reference-counts.cjs` and original header/disclosure/cast fixtures |
| EXT-43 | Fullscreen first in the main toolbar with a faded vertical divider | Timeline toolbar rail, `web/creator/styles/editor.js` | `tests/browser/test-node-toolbar.cjs`, original button gates/callbacks |
| EXT-44 | Editable per-card Segment/Clip name; duration beside reference count | Timeline card presentation, scoped card CSS, `web/creator/state.js` UI metadata | `tests/browser/test-segment-card-name.cjs`, state/compile equivalence and original card operations |
| EXT-45 | Navigation uses each card's custom/default name and ordinal | Timeline segment-jump option labels | card-name/navigation tests, original navigation dismissal/scroll/highlight contracts |
| EXT-46 | Hover-only individual preview inside the same card, larger viewer and restart-ready saved takes | `web/creator/card-preview.js`, scoped Timeline card/navigation presentation, optional reference-viewer playback branch | `tests/browser/test-card-individual-preview.cjs`, original viewer/card/navigation regressions |
| EXT-47 | Larger supporting-reference file-role settings popup, viewport-bounded | Only supporting-file role popup presentation in cast styles | `tests/browser/test-cast-detail-layout.cjs`, original cast/input/role and popover contracts |
| EXT-48 | Slightly wider cast relationship-marker popup; natural height shows all options when space allows | Marker-menu-only presentation hook and cast styles | `tests/browser/test-cast-detail-layout.cjs`, original marker callbacks and default-menu contracts |

### Integration contracts

- **EXT-37:** scope `align-items: start` to the Timeline audio grid so each
  soundscape/music outline follows its own content height, not the other column.
  Their disclosure state was already independent; do not replace the closures,
  section-memory keys, body mounting, ARIA, focus, input or N/A/Undo callbacks.
  Stacked layouts may naturally move a later section down, but must not alter its
  own height/state. Reset only the existing summary row's total-group auto margin;
  retain the same DOM row, text/calculations, cost, warnings and availability.
- **EXT-38:** statuses use right alignment with the existing uniform gaps and
  conditional visibility. Preserve all take, motion and face operation handlers.
  This supersedes EXT-31's left-edge alignment only, not its consistent gaps or
  conditional-state guarantees.
  Place transport before edit tools in visual and keyboard reading order; keep
  existing native button handlers, unavailable/disabled actions, deletion-confirm
  behavior, and edit-button-only entry into the segment editor. Editing labels
  use the same computed font family/size as the existing seed-pill Card label,
  including user type scaling. Do not shrink all other card text or rename tools.
- **EXT-39:** move the existing preservation-marker button into the name row
  after the existing type/takes button. This supersedes only EXT-32's marker
  location beneath the replacement target; description remains labeled and the
  conditional replacement field remains directly below it. Keep type/marker
  picker handlers, inferred/forced relationship values, feature controls and
  popover ownership unchanged. Match their pill border/radius/spacing and keep
  both buttons bounded and independently clickable on compact layouts.
  Description/replacement input borders and surface remain visible without
  hover/focus; preserve input text, placeholder, gates and input/blur callbacks.
- **EXT-40:** the first N/A press shows a red, bounded confirmation button, with
  no input/data/refined/commit/Undo mutation. A second press confirms the original
  field-specific N/A operation, preserving its prior-value capture, ownership,
  refinement invalidation, version guard and Undo behavior. Pending confirmation
  is view-only, never serialized. Leaving the field header or blur cancels it;
  movement within that header permits reaching a wrapped warning. The existing
  Escape/modal-close behavior safely discards it. Reopen unarmed. A stale field,
  input, owner or revision must not be overwritten using an earlier confirmation.
  Keep disabled behavior and whole warning-label hit area usable across widths.
  This supersedes the earlier immediate first-press N/A interaction only, not the
  original actual application or Undo contracts. Do not change shared overlay
  handlers to implement confirmation.
- **EXT-41:** reorder only the shared CastShelf header actions to Add person,
  then Library, and use the existing localized Library label. Preserve the
  original handlers, conditional library availability, asynchronous arrival/reveal,
  focused mounted button identity and add-name focus. Other library/menu labels
  and data operations remain unchanged.
- **EXT-42:** count attached pool rows, not only active or cited references.
  Cast counts resolve unique exact handles across members' look/motion/voice and
  replacement roles against the existing available assets. A reused representative
  face is not another file; missing handles add no phantom count. Image/video/audio
  use the existing asset file kind, with RefMod and other files separate. Cast
  images use Supporting images wording. Omit zero categories, using one empty
  Reference files 0 pill if there are no files. Counts are read-only and do not
  prove files still exist on disk. Keep all queue/model/cast diagnostics visible
  even while bodies are folded; no callback, citation or import rule changes.
  The disclosure hint-node method is additive and unused by default callers;
  mounted bodies, action targets, ARIA, folding and focus behavior remain intact.
- **EXT-43:** move the existing Fullscreen tool block first, without changing its
  availability or callback. Show the new aria-hidden, pointer-inert divider only
  when that button exists, and hide it in the fullscreen toolbar alongside the
  button. Preserve every other tool's ordering, callback and keyboard access.
- **EXT-44:** show Segment or Clip by kind when unnamed; click the name to edit
  that card only. Enter/blur applies a bounded plain-text name; Escape cancels;
  clearing returns to the localized default. Persist names in top-level
  `extended_ui.card_names`, keyed by stable `card_id`, rather than adding them
  to generation segment payloads. Restore them on parse; duplication preserves
  a name on the new independent card identity. UI metadata must not alter take
  modified stamps or encoder/sampler generation requests. The raw saved widget
  blob changes, so ordinary outer-node graph fingerprinting is not claimed to
  remain identical. Move the original duration readout, not its calculation,
  beside reference count. Preserve locks, seeds, held takes, routes and editor
  entry rules. Backend source remains unchanged; no restart is introduced.
- **EXT-45:** reuse the same label resolver for navigation entries. Retain ordinal
  numbers to distinguish equal/default names, existing target values and actual
  scroll/highlight callbacks. Renaming is not navigation, playback or rendering.
- **EXT-46:** add only Ready preview (준비된 미리보기), not continuous preview or selected
  export. Its toggle is view-only, off on a fresh Timeline window; keep navigation
  and whole-strip lock callbacks intact, shifting locks only to make room.
  Append playback inside the same card, not a second floating card. Preview
  actual saved takes regardless of hold/edited status, and supplied clips; read
  persisted workflow file metadata after restart rather than requiring Stage
  memory or new generation. Missing/unplayable files show an honest unavailable
  state. Resolve the effective file/time window without changing the card's
  prompt, take, trim/crop, duration, sound, seed, or render state. A lone take's
  actual saved duration is authoritative, not a subsequently edited target
  duration. Merged generations have one head-owned file and do not persist all
  original follower cuts; even a matching head stamp cannot prove them. Show
  the actual full shared take/trim with an explicit shared-pass note on each
  member, never invented individual boundaries or a demand for fresh generation.
  Only the hovered preview area plays and can sound; entering another stops the
  previous one, leaving pauses immediately. Forced mute is per-card view state,
  never an output sound change. The bottom seek bar stays within the effective
  window. Double-click opens the existing larger read-only viewer and pauses
  inline players. Additive playback options must preserve its original reference
  behavior for all default callers. Destroy media, handlers and animation work
  on toggle-off, strip rebuild or modal close; stale play promises must not
  restart hidden/detached players. No generated files, concatenation, downloads,
  media edits, backend changes or user browser/server actions are introduced.
- **EXT-47:** enlarge only the supporting-reference settings popup shown with an
  `@handle` title, inline preview and file-role inputs. On a roomy screen target
  about 1.5 times the prior width and at least twice its prior visible height;
  clamp to the viewport on smaller screens and keep internal vertical scrolling.
  Preserve title/preview placement, typed notes and trigger words, role/size
  actions, outside-click/Escape cleanup and the existing double-click larger
  viewer. Ordinary cast/LoRA menus and the global reference viewer are unchanged.
- **EXT-48:** scope the second resize to the `What becomes of @handle` relationship
  menu only. Increase width slightly and remove the short fixed height limit so
  its options can all be seen together on roomy screens. Use natural content
  height rather than empty fixed-height padding, capped inside the viewport with
  internal scrolling when needed. Preserve automatic/full/partial/transfer/weak
  relationship values, checked states, save callbacks and dismissal behavior;
  no global cast/LoRA/popover size change.
- Preserve every earlier LoRA, folder/import, handle, preview, model marquee,
  navigation, lock, cast-detail and sound feature. Only the requested view-label
  metadata extends workflow serialization. No API/backend/generation, media or
  GitHub/upstream changes. No user workflow file is edited by the implementation.
  Cancelled workflow-tab
  preview persistence remains excluded.

Exact baseline/candidate/installed hashes and isolated validation are recorded
outside product source in this task folder. They do not imply live GPU-render or
audio-fidelity proof.
