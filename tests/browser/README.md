# Isolated browser regression checks

These scripts read this checkout's production JavaScript methods and CSS and run
them in a fresh, headless Playwright browser context. They are optional developer
checks: **ComfyUI does not gain a Playwright/runtime dependency**.

## Run

Use a recent Node.js version. If `playwright` is already resolvable, install its
Chromium browser with `npx playwright install chromium`, then run the three scripts
below from the repository root. Script paths are resolved relative to the script,
not the current working directory.

Alternatively, this PowerShell example keeps all test dependencies outside the
checkout, in a new temporary directory:

```powershell
$browserTestDeps = Join-Path ([IO.Path]::GetTempPath()) ('continuity-browser-tests-' + [guid]::NewGuid().ToString('N'))
npm install --prefix $browserTestDeps --no-package-lock --no-save playwright
$env:PLAYWRIGHT_MODULE = Join-Path $browserTestDeps 'node_modules/playwright'
node (Join-Path $env:PLAYWRIGHT_MODULE 'cli.js') install chromium

node tests/browser/test-style-scroll.cjs
node tests/browser/test-reference-preview.cjs
node tests/browser/test-timeline-sections-seams.cjs
```

On other operating systems, the same scripts work with the equivalent environment
variables. `PLAYWRIGHT_MODULE` is optional and can name any installed Playwright
module directory. `BROWSER_EXECUTABLE_PATH` optionally selects an existing
Chromium-based browser executable instead of Playwright's bundled Chromium.

The style-strip suite normally runs 12 checks against the current checkout. Set
`CONTINUITY_BASELINE_DIR` to an older, unmodified checkout to add three comparisons
that reproduce the previous vertical-wheel behavior. No baseline copy is bundled.

Every suite exits nonzero on failure and prints its results to stdout. Network
requests are blocked and counted; successful runs require zero requests. The
scripts do not launch ComfyUI, touch a user browser profile, or modify project data.

## Coverage and limits

- **Picker memory unit checks:** `node tests/browser/test-picker-check-memory.cjs`
  exercises actual paths-only/store modules with isolated storage, context/tab/
  single/only isolation, corrupt/denied/quota fallbacks, ordered checks, seeded
  panel opt-out and bounded directory records. No browser or API is used.
- **EXT62–69:** per-card Face migration/ownership, actual registered folder
  hierarchy, three view modes, purpose-scoped pending checks, separated duration
  summary and individual/whole frame facts have additional focused fixtures.
  They use synthetic media/temp trees and fake requests, never user data or a
  live server/model. Full local evidence is recorded separately; old behavior
  assertions change only where the explicitly approved interaction supersedes it.
- **Style strip:** actual category methods, DOM helpers, atlas categories and CSS;
  wheel directions/units/modifiers, scroll limits, keyboard navigation, focus,
  filtering, listener stability, RTL and grid-scroll isolation. Catalogue loading
  and card rendering are local fixtures.
- **Reference preview:** actual viewer module, relevant DOM helpers, editor
  reference-chip callbacks and CSS. The browser records a tiny local WebM to check
  playback, unloading, navigation, fullscreen/Escape, focus, narrow layouts and
  read-only state. API URL resolution and model-state helpers are adapters; this
  does not establish support for every user video codec.
- **Timeline sections and seams:** actual disclosure helper, timeline/Cast
  methods, popover lifecycle helpers and CSS. Checks cover default-open state,
  independent folding, sibling actions, focus, citations/additions, scoped
  popover cleanup, seam option/capability matrices and localized layout. Backend
  capability/state providers, picker responses and unrelated renderers are
  fixtures, not a running ComfyUI application.

These are isolated browser regression tests, **not end-to-end ComfyUI tests or
GPU/rendering validation**. Source extraction is intentionally explicit: if a
production method's structure changes, update the corresponding fixture rather
than silently testing a stale copy.

## Extended UI usability checks (2026-10-09)

Use the same external runtime/browser settings above; no runtime dependency is
added to the node. These scripts read the actual source in their parent checkout.

```powershell
node tests/browser/test-timeline-usability.cjs
node tests/browser/test-picker-usability.cjs
node tests/browser/test-duration-match-usability.cjs
node tests/browser/test-sound-snap-labels.cjs
```

- **Timeline (17, after EXT-23):** collapsed summaries, field-only N/A Undo and invalidation,
  numbered-card navigation, clip/single/empty cases, cleanup, reduced motion,
  narrow Korean and enlarged text, rounded menu keyboard/dismissal/stale guards.
  API/model and unrelated renderers are fixtures.
- **Picker (17):** display sorting, Shift-range limits and import modes, preserved
  options/order, existing-metadata info panels, accessible state distinction and
  responsive scrollbars. Inventory/API replies are fixtures; no real files probed.
- **Duration (10, after EXT-19):** actual model-valid length helpers and editor control methods,
  reference/match readout, matched/automatic states, original duration action,
  pill alignment and unchanged no-readout rows, narrow Korean and enlarged text.
  No media decode, audio sync or GPU render.
- **Sound labels (11):** actual snapping methods/windows, shared segment labels,
  merged/internal cuts, continuation and clip trim offsets, other clip boundaries,
  exact frame/time, read-only state, label cleanup and narrow layouts. Synthetic
  timeline/audio metadata is used; no real waveform or generated audio is tested.

The original 49 checks (55 after EXT-19/23) require zero network requests. The existing timeline extraction
and all four new scripts support CONTINUITY_SOURCE_ROOT to inspect a separate
installed source while keeping runtime output in the test workspace. Set
CONTINUITY_UX_SCREENSHOT_DIR (timeline/duration/sound) and PICKER_SCREENSHOT_DIR
to a writable test-output directory when checking the installed path.

The existing timeline extraction
harness was repaired to include actual methods required by mount; optionally set
CONTINUITY_SOURCE_ROOT to an untouched baseline and CONTINUITY_BASELINE_FIXTURE=1
to allow the newly added UI methods to be absent for the same 18 baseline checks.

Do not conflate these suites with a full upstream test pass. The installed
baseline's test_sound_persist.py has five old assertions expecting snapping while
the fixture never enables its opt-in magnet; candidate repeats that result.
The extension ledger records this known limitation separately.

## Unified timeline LoRA manager

```powershell
node tests/browser/test-lora-unified.cjs
```

Uses the actual manager, LoRA state-edit helpers and CSS with explicit local
inventory/preferences/preset adapters. Covers the three separate Timeline tabs
(loaded LoRAs, LoRA library and Stacks), exact-file library selection toggling,
settings preservation, missing metadata, versions, double-click/keyboard,
focus, pin/mute/removal, saved Stacks and responsive localized layout. Set
CONTINUITY_SOURCE_ROOT to inspect a separate installation and
CONTINUITY_UX_SCREENSHOT_DIR for workspace screenshots. These checks do not
exercise a live ComfyUI server, arbitrary user files or GPU generation.

### Separate Timeline LoRA tabs (EXT53)

```powershell
node tests/browser/test-lora-tabs.cjs
node tests/browser/test-lora-unified.cjs
node tests/browser/test-view-preferences.cjs
```

The tabs fixture reuses the maintained actual-manager adapter with the complete
production CSS array order. It checks one full-height pane at a time, the loaded
grid's native thin rounded scrollbar, real thumb dragging and keyboard access to
bottom controls, independent scroll positions and bounded lazy library chunks.
Thirty-six EN/KO normal/enlarged tab layouts cover desktop and compact widths.

Selection checks cover blue-check/attached-X synchronization, exact grouped-file
deselection, retained strength/routes/triggers/audio, selection-neutral native
double-clicks, held keyboard-repeat prevention and stale pending-click owners.
Pinned files retain state/preferences and show a localized unpin notice until
explicitly unpinned. Remembered tab/folder/query, attached/unattached reveals,
ordinary callers and one-shot swaps stay separate. Optional
`CONTINUITY_BASELINE_DIR` adds byte-exact state/API/DOM/preset/settings and Python
owner guards. `CONTINUITY_ARTIFACT_DIR` stores evidence outside the product.
Playwright's default `--hide-scrollbars` is omitted only by this fixture for native
painting and hit-testing. All inventory/preset/detail replies remain in RAM; no
live ComfyUI, user media, external API, AI or GPU generation is exercised.

## Main-node toolbar and timeline disclosure layout

```powershell
node tests/browser/test-node-toolbar.cjs
node tests/browser/test-timeline-disclosure-look.cjs
node tests/browser/test-segment-card-pills.cjs
```

The toolbar fixture exercises actual strip rail/panel methods and the existing
fullscreen dashboard adapter, including availability, callbacks, active Pre-stage
state, existing fullscreen gates and narrow Korean enlarged text. It does not
execute destinations, queue prompts or render models by opening the dashboard.

The disclosure fixture uses actual Timeline/Cast/disclosure methods and CSS to
check one outer rounded frame, unchanged folding and independent actions, visible
focus and unclipped menus, subtle separators, ordinary-control isolation and the
dedicated card-navigation row. API/model and unrelated-renderer fixtures remain
explicit. Both support CONTINUITY_SOURCE_ROOT and
CONTINUITY_UX_SCREENSHOT_DIR for isolated checks of a separate installation.

The generated-card fixture checks Edit/Trim/Crop grouping without substituting
their actions, missing/shared-take availability, the existing motion-fix toggle,
right-side ordering/clone/delete controls and localized enlarged-text layouts.
It uses local render/take fixtures, not a real generated video or ComfyUI queue.

## Replacement preview, view memory and final controls

```powershell
node tests/browser/test-handle-replacement-preview.cjs
node tests/browser/test-view-preferences.cjs
node tests/browser/test-final-card-controls.cjs
```

The replacement fixture checks the actual 540px / preferred 840px picker, viewport
clamping, single selection versus thumbnail preview, image/video/audio lifecycle,
focus, stale-source guards and original exact replacement semantics. Media is
synthetic and local; this is not user-codec or soundtrack fidelity proof.

The view-memory fixture checks the separate bounded store, reloads, corrupt/denied
storage fallback, compatible visible tabs/search/sort/folders, caller precedence,
selected-folder refresh, stale replies and zero application callbacks. Explicitly
excluded file selection, import roles/sizing and generation values are not restored.

The final-control fixture checks inert yellow numbers, the original lock action,
confirmation hit targets/sibling hiding/restoration, and inside-clip magnet/remove
placement across narrow and localized layouts. Sound mathematics are unchanged.

These fixtures support CONTINUITY_SOURCE_ROOT for the deployed installation and
CONTINUITY_UX_SCREENSHOT_DIR for writable workspace evidence. Record final counts
and hashes outside the node; passing fixtures do not establish a live ComfyUI
session or GPU/render result.

## Timeline header and conditional status spacing

```powershell
node tests/browser/test-timeline-header-layout.cjs
node tests/browser/test-segment-card-pills.cjs
```

The header fixture extracts actual modal/header/settings/navigation/lock methods
and CSS, checking original callbacks and capability gates, title/divider/close
layout, separated queue readouts, compact localized layouts, popover positioning
and lock/nav independence. Geometry/inventory/network responses remain explicit
local adapters; no render or refiner service is executed.

The card fixture includes uniform 6px spacing, absent status controls and short
cards across 384 localized/scale/state combinations, without reducing labels or
changing take/repair callbacks. These are view checks, not GPU/audio proof.

## Cast detail previews and model filename readability

```powershell
node tests/browser/test-cast-detail-layout.cjs
node tests/browser/test-timeline-na-confirmation.cjs
node tests/browser/test-reference-counts.cjs
node tests/browser/test-node-toolbar.cjs
node tests/browser/test-segment-card-name.cjs
node tests/browser/test-card-individual-preview.cjs
node tests/browser/test-timeline-na-confirmation.cjs
node tests/browser/test-model-menu-width.cjs
```

The cast fixture uses actual CastShelf fields, role/size/word handlers, DOM
popover ownership and the existing large reference viewer. It checks requested
field order/labels, conditional availability, contained imagery, read-only
double-click/Escape/outside/focus cleanup and localized compact layouts with
synthetic media. The model fixture checks the existing weights popup and its
wider, viewport-bounded filename layout and overflow-only one-line motion,
including reduced-motion and observer cleanup, without loading weights or rendering.
Backend, catalog, queue and media execution are isolated; these are not live
ComfyUI/GPU/codec-fidelity checks. Direct evidence paths into writable workspace
and use CONTINUITY_SOURCE_ROOT when inspecting a deployed installation.

## Timeline leading header actions

```powershell
node tests/browser/test-timeline-leading-actions.cjs
```

Uses real opt-in disclosure/header controls and scoped CSS to check the
title/actions/hint order, compact pill geometry, independent hit areas,
localized large-font layouts, keyboard/ARIA and N/A/ref/cast callback behavior.
Default/main-node/library headers and all previous UI features remain covered
by original regressions. Host/catalog/media adapters do not prove live renders.

## Independent audio bubbles and card footer alignment

```powershell
node tests/browser/test-timeline-audio-independence.cjs
node tests/browser/test-segment-card-pills.cjs
node tests/browser/test-cast-detail-layout.cjs
```

The audio fixture checks mixed disclosure states and actual independent outline
heights, retained input/state/focus/ARIA and the left-aligned summary row. The
card fixture checks right-aligned conditional status controls, swapped transport
and editing groups, exact seed-label font parity and existing native operations.
Synthetic browser/host adapters isolate execution; no queue or GPU render runs.
Cast detail checks include top-row type/retention pills and always-visible
description/replacement input framing without changing marker or field behavior.
They also verify the larger supporting-file role popup, natural-height cast
relationship menu, default-menu isolation and viewport-bounded internal scrolling.
N/A confirmation checks distinguish the data-free warning press from the actual
second-press operation, cancellation/stale confirmation and unchanged Undo. Old
N/A fixtures retain their original post-application assertions using the newly
required confirmation step; no unrelated failing assertion is removed.
Reference-count checks cover actual read-only helper and pool/cast headers, file
kinds, unique supporting handles, missing/muted references, empty state, visible
diagnostics and localized wrapping. Toolbar checks retain all original tool
callbacks/gates and verify first Fullscreen plus its conditional divider.
Card-name checks cover default/custom labels, per-card edit/cancel/reset, duration
placement, named navigation and workflow roundtrip/duplicate behavior. Generation
request/take-stamp equality is checked separately from raw saved-widget identity;
no live queue or GPU work runs.
Individual-card preview checks use local synthetic video/audio and actual
descriptor, controller, viewer and Timeline presentation code. They cover saved
take reload, provided clips, effective windows, hover-only single-player behavior,
explicit preview volume, seek, in-card expansion, larger-viewer isolation and cleanup. They
do not prove arbitrary user codecs, physical user-file existence or live GPU
rendering. Continuous preview/export are intentionally excluded.

## Refine confirmation (EXT49)

```powershell
node tests/browser/test-refine-confirmation.cjs
node tests/browser/test-timeline-header-layout.cjs
```

The confirmation fixture uses the actual shared refine button, node/segment
editor rail, request builder, rewrite application and Timeline Refine-all path.
It distinguishes the first red Confirm press (no request, settings read or data
write) from the second press, and checks cancellation, native held Enter/Space,
busy/progress/error reset and temporary listener/observer cleanup. It covers 24
English/Korean responsive layouts and two canvas-style transform zoom levels.
The existing header fixture keeps its previous hook assertions after the new
data-free confirmation step. Optional CONTINUITY_BASELINE_DIR adds exact
original-caller/request guards; no external baseline is required for normal use.
Settings/catalog, unrelated host controls and the queue boundary are isolated
adapters. All replies stay in RAM; no ComfyUI server, model/API or GPU job runs.
Set CONTINUITY_UX_SCREENSHOT_DIR to a writable workspace evidence directory.

## Field-only Refine (EXT50)

```powershell
node tests/browser/test-field-refine.cjs
node tests/browser/test-refine-confirmation.cjs
```

The field fixture uses actual Timeline actions, text-owner input callbacks,
CreatorEditor execution, shared request/response validation and RefinePanel
application/Revert. It verifies that plain Refine can change only its selected
global prompt, soundscape, music or card prompt, while only the explicitly named
Refine all retains whole-piece rewriting. All three new header actions retain
the two-press red Confirm rule; header prose previews are hidden and real
reference/cast count pills remain present.

Adversarial RAM replies include forbidden sibling rewrites. Tests compare all
non-target fields byte-for-byte, reject changed/replaced/detached owners and
malformed/legacy replies, preserve audio on individual Revert and retain the
original all-refine snapshot across mixed field/all/segment/Revert operations.
General checkpoint/Turbo/LoRA normalization paths must not run on a field edit.
Same-piece overlapping refine operations are refused before an additional API
request; their transient lock releases on success/error/stale results and is
never saved. Different pieces can refine independently. Twelve English/Korean
responsive configurations cover all 36 field-pill hitboxes, normal/large type,
native Enter/Space and independently folded audio fields.

These are isolated frontend checks, not a live LLM/GPU render. The queue and
rich-text/media/catalog boundaries are explicit adapters; no real user content
is refined. Backend field-output contracts have their own synthetic unit suite.
An older still-running Python server must refuse the new field request and show
a restart requirement, never fall back to a broad rewrite. Historical audio
defect reproduction uses a pre-audio-fix snapshot; current behavior/baseline
guards normalize only the exact new action/status/hint presentation inserts.

## Count-group divider (EXT51)

```powershell
node tests/browser/test-timeline-count-divider.cjs
```

The fixture uses the actual disclosure, media-count, DOM and translation helpers
with the real ordered CSS. It verifies the subtle, noninteractive vertical rule
only between Timeline reference/cast actions and their read-only count groups.
Thirty-two EN/KO/JA/ZH normal/enlarged-type configurations at 1600/900/640/320px
cover 64 count groups, compact wrapping, zero/many counts and absent actions.
Existing action clicks, header folding, native keyboard/ARIA and Tab order stay
independent. The decorative pseudo-element creates no accessibility separator
or focus stop. Optional CONTINUITY_BASELINE_DIR verifies byte-exact Python/JS
behavior owners and recovers the original full Timeline CSS after removing only
the requested divider rules. Screenshots/reports go to CONTINUITY_ARTIFACT_DIR
or a temporary directory outside the product. Action callback counters are
isolated adapters; no live ComfyUI request, model, queue, media or GPU work runs.

## Whole Timeline body scrollbar (EXT52)

```powershell
node tests/browser/test-timeline-body-scrollbar.cjs
```

The fixture reuses the maintained header adapter's actual Timeline mount,
disclosures and strip-wheel handler, adds real ready-preview controllers with
RAM-only portrait WebM, and reads the complete CSS in its production array order.
It checks the native right-edge rail's picker/popover tokens, native thumb drag,
whole-body wheel scrolling, pinned header and lower card controls/Sound reach.
The existing horizontal card strip and hidden nested prompt rails remain
independent. Short content, disclosure/preview growth, stable gutter, 16 EN/KO
normal/enlarged responsive layouts and wide/compact light palettes are covered.

Playwright's default `--hide-scrollbars` is excluded only in this fixture so
native painting and pointer hit-testing are observable; this does not change the
product or browser defaults for the user. Optional `CONTINUITY_BASELINE_DIR`
requires the complete prior Timeline CSS after removing only the new scrollbar
block, plus byte-exact Python/JavaScript behavior owners. Reports/screenshots use
`CONTINUITY_ARTIFACT_DIR` outside the product. Catalogue/panels and read-only Sound
rendering are explicit adapters; no live ComfyUI, user media, AI or GPU job runs.

## Explicit preview volume (EXT55)

```powershell
node tests/browser/test-card-preview-volume.cjs
node tests/browser/test-card-individual-preview.cjs
```

The volume fixture uses the maintained actual card-controller/reference-viewer
adapter, shared portal dismissal/placement helpers and complete production CSS
array order. Thirteen checks cover silent defaults, explicit 0/25/100% inputs,
native vertical keyboard controls, same-card/file RAM memory, replacement-file
reset, independent cards and fresh sessions. The icon opens controls but never
authorizes sound. Preview volume does not alter saved source/timeline audio.

Pointer travel through the portal gap stays local; leaving pauses immediately.
Outside/second-icon/Escape/scroll/resize disposal, layered viewer Escape, disabled
silent files, suspend/offscreen/error/destroy cleanup and pending native play
ownership are exercised. Deferred playback must not stale-pause a new hover or
large-viewer owner. Twelve EN/KO desktop/compact normal/enlarged configurations
check portal bounds, range orientation and localized labels; three additional
right-bottom edge anchors verify viewport clamping. The existing 39
individual-preview checks retain their crop, trim, lifecycle and source guards;
only superseded mute-toggle assumptions now use deliberate volume input.

`CONTINUITY_SOURCE_ROOT` supports an installed source. Optional
`CONTINUITY_BASELINE_DIR` guards unchanged preview state/API dependencies and
whole DOM/reference-viewer owners, allowing separate Face/folder-owned changes.
`CONTINUITY_ARTIFACT_DIR` keeps reports/screenshots outside the product. Synthetic
video/audio is recorded in RAM and mapped at the media API boundary; no user
media, live ComfyUI/API/model, workflow save, generation or GPU render runs.

## Generated-card prompt count (EXT58)

```powershell
node tests/browser/test-segment-prompt-count.cjs
```

The fixture checks actual generated/clip render methods: generated cards omit
the old prose preview and expose the raw prompt's character count instead. Clip
filenames, existing controls/callbacks and inline preview geometry remain intact.
Local metadata/action/media adapters do not mutate real workflows or render data.

## Timeline field contrast and ready-preview preference (EXT60/61)

```powershell
node tests/browser/test-timeline-field-contrast.cjs
node tests/browser/test-card-preview-preference.cjs
```

- Field contrast checks the five actual disclosure headers across 72 dark/light/
  forced-dark EN/KO normal/enlarged folded/expanded configurations; only their
  surface fill changes, while geometry, inputs, action identity and other headers
  remain untouched. Ready preview defaults ON and stores its last ON/OFF choice
  only in display preferences, not workflow/render data. Existing toggle-flow
  regressions explicitly seed OFF; their actual view-preference helpers remain
  active so default and persisted behavior can be tested independently. Seven
  preference checks cover native local-storage restart persistence, ready-file
  resolution, enum-only writes, focus/localized labels and corrupt/denied/full
  storage fallbacks. Synthetic origin pages are fulfilled by Playwright; no
  external or live ComfyUI request is made.

## Face, hierarchy, facts, Sound and work-area controls (EXT62–77)

```powershell
node tests/browser/test-face-card-ownership.cjs
node tests/browser/test-picker-check-memory.cjs
node tests/browser/test-picker-hierarchy-memory.cjs
node tests/browser/test-timeline-summary-facts.cjs
node tests/browser/test-sound-view.cjs
node tests/browser/test-global-prompt-clear.cjs
node tests/browser/test-cast-target-layout.cjs
node tests/browser/test-timeline-edge-fullscreen.cjs
```

These use actual owners/DOM/stores and the ordered production CSS, with real
EN/KO/JA/ZH dictionaries and temporary or RAM-only media/API boundaries. Pending
checks restore only fresh ordered allowed paths, never automatic attachment;
manual/tab/close/revoked-grant races, native checkbox selection and all three
lazy views are covered. Details and enlarged/narrow layouts check readable facts,
visible controls, independent page/footer bounds and an uncovered file-list area.

Sound checks cover both cursor anchors, native horizontal thumb drag, separate
card/body scrolling, original OFF-tool track slide/trim, Fit/limits/resize/rebuild,
capture cancellation and remembered folding. Global Clear covers ten checks,
24 actual-locale/type layouts, prompt-only data equality, two separate keyboard
presses, stale/disconnected owners and pending field/whole-refine collision refusal.
Existing field-refine and Refine all scope/confirmation suites retain their
original behavioral assertions. Native-scrollbar tests launch without Chrome's
headless hide-scrollbars flag. None of this is live ComfyUI, GPU/render or native-
speaker translation certification; catalog/source audit gaps remain documented.
