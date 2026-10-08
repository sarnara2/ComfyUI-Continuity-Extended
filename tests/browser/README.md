# Isolated browser regression checks

These scripts read this checkout's production JavaScript methods and CSS and run
them in a fresh, headless Playwright browser context. They are optional developer
checks: **ComfyUI does not gain a Playwright/runtime dependency**.

## Run

Use a recent Node.js version. If `playwright` is already resolvable, install its
Chromium browser with `npx playwright install chromium`, then run the scripts
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
node tests/browser/test-pool-reference-actions.cjs
node tests/browser/test-reference-import-options.cjs
node tests/browser/test-external-picker-folders.cjs

# Point this at an existing Python interpreter for the sound timeline fixture.
$env:PYTHON_EXE = 'python'
node tests/browser/test-sound-clip-snap.cjs

# These two are Node contract checks, not headless-browser interactions.
node tests/browser/test-reference-import-contexts.cjs
node tests/browser/test-external-folder-api.cjs
```

On other operating systems, the same scripts work with the equivalent environment
variables. `PLAYWRIGHT_MODULE` is optional and can name any installed Playwright
module directory. `BROWSER_EXECUTABLE_PATH` optionally selects an existing
Chromium-based browser executable instead of Playwright's bundled Chromium.
On Node versions that expose a global `navigator`, the Python/Node fixtures may
need `NODE_OPTIONS=--no-experimental-global-navigator` to keep their default-locale
assumptions independent of the host. Set `PYTHON_EXE` to an absolute interpreter
path if `python` is not on PATH.

The style-strip suite normally runs 12 checks against the current checkout. Set
`CONTINUITY_BASELINE_DIR` to an older, unmodified checkout to add three comparisons
that reproduce the previous vertical-wheel behavior. No baseline copy is bundled.

Every suite exits nonzero on failure and prints its results to stdout. Network
requests are blocked and counted; successful runs require zero requests. The
scripts do not launch ComfyUI, touch a user browser profile, or modify project data.

## Coverage and limits

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
- **Piece-reference actions:** production callbacks for double-click preview,
  handle-based file replacement, cancellation and stale attachment guards.
- **Import options:** per-file and bulk choices, capability-filtered controls and
  existing selection/crop/trim flows. The separate import-context contract checks
  cover production call-site wiring; they are not live tests of every modal.
- **Sound snapping:** production SoundLane methods/CSS, per-clip toggles, delivered
  segment/continuation boundaries, nearby sound edges and normal placement commits.
- **External folders:** picker DOM methods/CSS, selected-folder refresh, tab filters,
  persistent built-in pills, shortcut removal and attachment preparation. Folder
  picker/native APIs are fixtures. Real filesystem and route security have separate
  Python tests; the API-transport contract checks use mocked requests.

These are isolated browser regression tests, **not end-to-end ComfyUI tests or
GPU/rendering validation**. Source extraction is intentionally explicit: if a
production method's structure changes, update the corresponding fixture rather
than silently testing a stale copy.
