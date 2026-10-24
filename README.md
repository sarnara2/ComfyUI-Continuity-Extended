# Continuity - Extended

This is sarnara2's personal fork of
[Continuity](https://github.com/roadmaus/ComfyUI-Continuity), not an upstream release.

## Extended changes

Latest integrated Extended update: **2026-10-24**.

This revision combines the existing Extended `main`, the accumulated local
improvements and upstream's remote-refiner timeout repair at
[`3146741`](https://github.com/roadmaus/ComfyUI-Continuity/commit/3146741a2b19768754bf68f8450fb3a4ad6455f1).

- **Scoped refinement:** global prompt, soundscape, music and the supported
  segment sections have independent Refine controls. Refine all remains an
  explicit whole-timeline action, with the existing two-press confirmation.
- **Modal and workflow continuity:** closing and reopening a segment editor
  retains its pending refinement and completed rewrite. Returning to a workflow
  restores that workflow's rendering progress and latest preview.
- **Remote answer recovery:** a long remote refine or chat turn returns a
  receipt immediately. A missed socket answer can be retrieved without sending
  the model request again. This covers temporary disconnection in the same
  live page, not a full page reload or ComfyUI restart.
- **Optional prompt and sheet tools:** Faithful Beta remains a separate skill
  choice. Where the compatible builder is available, the optional sheet tool
  keeps its panel selection and export controls. Existing defaults and saved
  node identifiers stay intact.

Verification uses isolated browser, fake-server and model/queue-stub tests.
It does not establish real model output quality or a new GPU render.

Personal presets, draft prompts, saved workflows, chat history, credentials and
imported media are user data, not repository content. They remain in ComfyUI's
user/media directories or browser storage and are not included in this update.

- **Prompt tags:** click a recognized `@handle` to replace one occurrence or all
  exact occurrences in the current segment. Choose a listed cast/reference/screen
  handle, or type a name or number without `@`. The cast-editor shortcut remains.
- **Timeline memory:** the five timeline sections remember whether they are open
  or closed, including when the saved workflow is loaded again.
- **Queue timing:** whole-run time includes an accepted batch's queue wait; each
  result keeps its own render span. Normal and fullscreen views share the stage.
- **Import options:** choose supported reference roles and MAX/MATCH sizes before
  importing media, per file or in a batch. Each input only offers relevant options.
- **Piece-reference controls:** double-click a thumbnail to preview; click its
  handle to reselect the file without changing the handle or prompt citations.
- **Quick `N/A`:** buttons beside soundscape and music ask for confirmation first;
  press the red warning again to replace that field's contents with `N/A`.
- **Sound snapping:** a per-clip magnet snaps sound edges to delivered segment
  boundaries, accounting for continuation trims, and nearby sound-clip edges.
- **Folder shortcuts:** add/remove saved local folders in the shared media picker,
  filter by tab, and refresh only the selected folder on click, tab switch or reopen.
  Folder pills scroll horizontally; built-in pills stay available. Windows uses a
  larger Explorer-style folder chooser with dialog-only foreground handling.

Tag replacement leaves other segments and the global prompt unchanged, treats
`@ref-1` and `@ref-11` separately, and preserves `:scope` suffixes and activation
rules. Removing a folder shortcut deletes no original files or imported copies;
selected external files are copied into existing managed roots before attachment.

For feature IDs, changed files, state contracts, verification limits and future
upstream-integration notes, see the [Extended change record](docs/extended-changes.md).
The [changelog](CHANGELOG.md) keeps the dated update summary.

### Latest UI refinements

- **Per-card Face pass:** the outer/global Face pass pill is replaced by each
  generated card's stable Face pass pill and its own ON/OFF/canvas/denoise options.
  New and duplicated cards start OFF; saved new-format enabled cards retain their
  settings. Existing legacy cards migrate OFF once, as explicitly chosen.
- **Hierarchical folder browsing:** added folders now show direct child folders
  (including empty ones) and files at their actual relative location, with root,
  parent and breadcrumb navigation. Large/small thumbnails and Details use the
  same file actions. Last view/tab/search/sort/folder/location are remembered.
- **Pending file checks:** selections are remembered per attachment purpose and
  tab, checked against fresh files and available slots. Reopening never attaches
  them automatically: Add/Done is still required. Old trim/crop/settings are not
  restored, and an attached sheet's own panels take priority.
- **Clear duration groups:** separate Full video, New video and Cards pills with
  quiet vertical dividers. Full video includes human duration, total seconds and
  whole-Timeline FPS/frame count; New video is the duration generated by this run,
  not waiting time. Each generated card shows only its own FPS/frame count
  between reference count and duration. Estimates remain marked as estimates.
- **Cast count:** a people-count pill precedes the supporting-image/file counts,
  counting registered cast members rather than attached files.
- **Sound work area:** Sound folds like the other Timeline fields and remembers
  its folded state. Ctrl+wheel zooms at the cursor; the Zoom tool also supports
  left/right scrubby drag. Its own horizontal scrollbar, Fit and +/- controls
  move the reel/lane/ruler together without changing audio placement or trimming.
- **Full-work-area Timeline:** normal and fullscreen entry points open the same
  edge-to-edge Timeline without outer window padding, border or rounded corners.
  Existing Close/Escape and nested-layer behavior remain intact.
- **Global-prompt Clear:** a Clear pill before Refine asks for a red second-press
  confirmation and clears only that input. Edits/changed owners invalidate the
  confirmation; a running refiner blocks clearing until it finishes.
- **Stable card/cast controls:** Storyboard captions also align right. Existing
  generated-card actions are Trim, Crop, Edit, with Edit rightmost; clips retain
  Trim, Replace, Crop and do not gain a new editor. Cast target controls sit below
  their label, and its two aligned inputs move closer to the label column.
- **No inline preview tooltip:** hover playback keeps its accessible label but
  removes the native help tooltip over the ready video. Playback/audio controls
  and large-viewer labels are unchanged.
- **Ready-preview memory:** the preview display defaults on when no preference
  exists, and remembers an explicit on/off choice across closing the window or
  restarting ComfyUI in the same browser. This never enables preview sound:
  playback volume still starts at 0% in a fresh session.
- **Field separation:** Timeline's five foldable input headers use a slightly
  stronger theme-relative fill. The main background, cards and other buttons
  retain their original colours and geometry.
- **Prompt counts:** segment cards replace prompt excerpts with a single exact
  character count including whitespace (for example, 공백 포함 33,459자). Original
  input and rewrite content stay intact; supplied-clip filename captions remain.
- **Visible remove control:** the card-delete X uses the modified-take badge's
  brighter warning/red tone. Its original two-press confirmation is unchanged.
- **Stable card controls:** generated and supplied-clip cards keep transport
  icons on a right-aligned row and editing actions in a wider matching pill
  below it, regardless of lock state or face/motion/take badges. Preview aspect ratios do not shift the
  facts or controls above them. The clip soundtrack icon is centred and red
  while that clip's own sound is enabled. One pass stays beside the other seam
  controls instead of sinking with a tall preview.
- **Preview volume:** ready previews start silent, including on hover. The
  sound icon beside the seek bar opens a vertical 0–100% volume slider; only
  changing that slider enables preview sound. Volume is session-only and bound
  to that card/file, never changing the saved source or generated audio.
- **Whole-Timeline scrollbar:** a thin rounded grey scrollbar on the right
  moves the full Timeline body, including expanded ready previews and sound
  tracks. The header stays in place and cards still scroll horizontally.
- **Count-group separation:** a subtle vertical rule separates Timeline
  reference/cast action buttons from their read-only file-count pills. On narrow
  screens the counts keep their own row without a stranded divider.
- **Field-only Refine:** Timeline global prompt, soundscape and music have
  their own compact Refine buttons. Structured segment editors can refine
  summary, retention rules, detailed description or that segment's combined
  sections without rewriting other cards. Only **Refine all** rewrites the whole timeline; its label
  remains explicit after a rewrite. Every execution still requires red Confirm
  followed by a second press. Collapsed text previews are removed; reference/cast
  file-count pills remain.
- **Refine confirmation:** every prompt-refine execution button, including
  Refine all/again, first shows a red Confirm label (확인 in Korean). Press the
  same button again to rewrite. Leaving the control, pressing Escape or opening
  its settings cancels the pending confirmation without changing any prompt.
- A brief Undo restores only an N/A-cleared field.
- **Go to segment** lists each card's custom name or default Segment/Clip label
  with its number; it scrolls to and highlights the card without opening its
  editor or changing playback/render settings. Its pill now matches neighbouring
  whole-strip lock pills in size and typography.
- Media imports offer recent/filename display sorting and Shift-range selection.
  Hover/focus shows available file metadata; focus, selection and scrolling are
  easier to distinguish.
- **Match length** shows the reference duration and model-valid target separately,
  using the existing calculation.
- Sound snapping now labels both sides of a shared segment boundary, with precise
  time/frame. The existing magnet and snapping math remain unchanged.
- **Timeline LoRA manager:** separate **LoRA**, **LoRA library** and **Stacks**
  tabs each use the available body height. Loaded LoRAs have a visible native
  scrollbar. Click a library file again to remove it and clear its check mark;
  double-click still opens details without changing selection. A pinned LoRA is
  protected and shows “핀을 먼저 해제해주세요” in Korean until explicitly unpinned.
  The timeline's inline LoRA rail is hidden; its pill and counts remain.
- **Main-node toolbar:** Fullscreen is first, separated from Add image by a subtle
  vertical rule. Pre-stage sits beside the existing top tools. A new **Tools**
  shortcut opens the existing tool dashboard. The redundant
  bottom Edit timeline button is removed; the prompt and strip still open it.
- **Timeline grouping:** each foldable area opens inside one rounded container,
  with subtle dividers between areas. **Go to segment** sits above the cards,
  separated from generation settings.
- **Segment controls:** continuation/frame and duration pills line up horizontally;
  reference and match-length facts remain below the duration pill.
- **Kept segment cards:** Edit, Trim and Crop share one roomy right-aligned pill group; the
  motion-fix status also has a pill outline. Their existing actions stay unchanged.
- **Handle picker previews:** a larger, viewport-bounded replacement picker offers
  thumbnail double-click previews for image/video/audio, without applying a tag
  change. Its single/exact-all scopes and input stay intact.
- **View memory:** supported library windows remember their last compatible
  tab, folder, display sort and search/filter. This does not restore selected
  files, apply presets/LoRAs or change generation options.
- **Card clarity:** a rounded segment-navigation menu matches the timeline;
  take/motion/face status buttons stay on one row. Generated cards open their
  editor only through **Edit**, not a background double-click.
- **Card controls:** segment numbers stay yellow and are display-only. The full
  delete-confirmation button is clickable; neighboring move/clone controls hide
  only while confirmation is open. The sound magnet sits beside the remove
  button, with an inside-clip fallback for extremely short clips.
- **Timeline header:** shared model/canvas/LoRA/storyboard/refiner controls sit
  beside the title, separated by a subtle vertical rule. Whole-strip lock/unlock
  actions sit beside **Go to segment**; queue facts and warnings remain below.
- **Status spacing:** take, motion and face buttons form one right-aligned row
  with even gaps, closing naturally when a conditional button disappears.
- **Cast detail layout:** the description has a persistent left label, followed
  immediately by the existing replacement field; retention sits beside type in
  the name row. Supporting
  references show a bounded preview in their role menu; double-click opens the
  existing larger viewer without changing their role, words or size.
- **Visual separation and filenames:** a subtle rule separates segment cards
  from the sound lane. The model/weights menu is wider; overflowing filenames
  move slowly within one line rather than wrapping. Model selection and routing
  stay unchanged, and the menu remains bounded by the viewport.
- **Section header actions:** Timeline N/A, reference Add and cast-library/add
  actions sit immediately after the section title, before its hint, as compact
  matching pill buttons. Section toggles and actions keep independent hit areas;
  main-node/library headers keep their existing disclosure layout.
- **Audio and strip alignment:** soundscape and music bubbles keep independent
  expanded heights; queue-time/segment facts sit at the left of their existing row.
- **Card tools layout:** take/motion/face badges align to the right with regular
  gaps. Playback/duplicate/delete controls are on the left and editing/cut tools
  on the right, with editing labels matching the seed pill's Card label size.
- **Cast input clarity:** type and preservation controls share pill styling in
  the name row; description and replacement fields stay visibly editable without
  hovering. Existing picker and input behavior is unchanged.
- **Cast header actions:** Add person comes before the shorter Library button;
  both retain their existing independent add/library operations.
- **Reference counts:** long reference/cast header instructions are replaced by
  separate image/video/audio count pills. Cast supporting images are counted
  separately, without counting a reused face preview twice. Counts describe
  attached records; missing physical files are still handled by existing validation.
- **Card names and duration:** duration sits beside the reference count. Its old
  position shows Segment/Clip or a name edited for that card only. Names persist
  with the workflow and also appear in the navigation list; they are not prompts.
- **Ready preview (준비된 미리보기):** its navigation-row toggle expands ready segment
  and supplied-clip cards in place. Hover the video area to play one at a time;
  leaving pauses it. A bottom seek bar and preview-only volume control stay inside
  the card; default volume is 0%. Double-click opens the existing larger read-only viewer. Saved takes,
  including edited kept takes, remain previewable after restart if their files
  exist. Continuous preview and selected-video export are not included.
  A merged generation is one saved file; its member cards show a clearly labeled
  shared-pass preview rather than guessing historical per-card cut boundaries.
- **Supporting-reference settings:** the file-role popup is about 1.5 times wider
  and at least twice as tall on a roomy screen, bounded by the current viewport.
  Its inline preview, notes, trigger words and role actions remain unchanged.
- **Cast relationship options:** their menu is slightly wider and grows to show
  every option on a roomy screen, with viewport-bounded scrolling when necessary.

The integrated update preserves the Extended controls, confirmation and
owner-scoped field APIs while adding the remote-answer transport described above.
Save the workflow, restart ComfyUI and refresh the browser when safe to load
the backend routes and frontend together. An older running backend rejects a
field-only request without rewriting content; it never falls back to Refine all.
Tests use isolated browsers and API stubs, not live refiner calls or ComfyUI/GPU renders;
see the change record for known baseline test limitations. Folder-only selection
does not guarantee individual image previews inside the Windows dialog.

The personal fork uses `- Extended` branding on its node names and fullscreen
wordmark. Internal node IDs stay unchanged.
Install the fork **instead of** the upstream pack, not alongside it: both register
the same node IDs. Original licenses and credits are retained below.

One node for AI video and stills in ComfyUI. Write a prompt, attach media with
`@`, press Render. Six model families, all through ComfyUI core, all local
open weights. The one thing that can talk to the outside is the prompt
refiner, and only if you point it at your own server or provider - LM Studio,
Ollama, or a hosted API with your key.

![A shot sampling, with the render beside it](docs/img/hero.png)

## What it does

### One node, one prompt

Drop the node, type, press Render. Files you attach get an `@` name and you
cite them in the sentence, so the prompt says which picture is the person and
which is the room. The pills under the box are the whole setup: duration,
aspect, resolution, the model, and a sampler row for when you want it.
[The node](docs/the-node.md) walks every control.

![The node in the simple view](docs/img/simple.png)

### References and the cast

A reference contributes what you say it contributes - the person, the place,
the look - and the same face can be saved once and brought back into any
piece by name. Two references cited in one prompt:

![Two references cited in a prompt](docs/img/mentions.png)

### The pre-stage

Video models eat stills: start frames, end frames, references. The pre-stage
is a second card on the same canvas that makes them, with any of the stills
families or H3 itself, and hands the result straight into the shot. One Queue
runs both; an untouched pre-stage doesn't re-render.

![The simple view on the pre-stage step](docs/img/simple-prestage.png)

### Timelines

Under the prompt: *Write the next shot*. Every shot on the strip is a whole
generation with its own prompt, references, LoRAs and even its own family - a
pre-stage on Krea 2 feeding start frames into shots on LTX 2.5 is one strip.
Seams carry picture and sound across the cut, or don't, independently.
[Timelines](docs/timeline.md).

### Chat

The other way in. A room where you say what you want - *a fox in a snowy wood
at dusk*, then *now a clip of it, she looks up*, then *bluer* - and the
refiner model writes the prompt and renders. Every picture and clip gets a
handle you can cite in the next line, so a still becomes a shot's first frame
by naming it. It is the same node underneath, on the same queue, and
everything lands in the same output folder. [Chat](docs/tools.md#chat).

![The chat room, before the first line](docs/img/chat.png)

### Tools

The wordmark opens a dashboard of tools that work over the piece: presets, a
ControlNet bench, a blockout bench for staging a scene out of boxes and
walking a camera through it, and an upscale bench. [Tools](docs/tools.md).

![The tool dashboard](docs/img/dashboard.png)

![The blockout bench](docs/img/blockout.png)

The style atlas is 941 looks captioned from real clips, applied as a prefix
to the prompt:

![The style atlas](docs/img/style-atlas.png)

## Where it is headed

The name is the goal. A single shot from an open video model is a solved
problem; a piece made of many shots that still looks like one piece is not.
Every continued shot comes out a little brighter and a little harder than the
one it continues, and after a handful of seams the strip has drifted somewhere
you never asked for. Most of the work now goes there: measuring the drift on
real strips rather than guessing, and pushing the number of shots a piece can
hold before it shows.

The other direction is getting the graph out of the way. The chat room and the
blockout bench are both ways of saying what you want without touching a pill,
and the pre-stage plus the timeline are what let one prompt become a scene.
There is no cloud in any of that, and there won't be: everything renders on
your hardware from weights you downloaded.

## Install

```
cd ComfyUI/custom_nodes
git clone https://github.com/sarnara2/ComfyUI-Continuity-Extended.git ComfyUI-Continuity
```

That leaves one folder, `ComfyUI-Continuity`, inside `custom_nodes/`. Restart
ComfyUI. Nothing to pip install.

### Already have Continuity or MiniMax Creator installed

Back up local edits first and keep the existing custom-node folder. To use this
Extended fork, point that checkout at the fork before updating:

```
cd ComfyUI/custom_nodes/ComfyUI-MiniMax-Creator
git remote set-url origin https://github.com/sarnara2/ComfyUI-Continuity-Extended.git
git pull --ff-only
```

Use your actual existing folder name in the first line. If Git refuses because
the checkout has local changes or diverged history, preserve those changes and
resolve the integration before updating. The directory name does not change
the internal node IDs.

Cloning next to the old folder is what breaks. The node ids stayed the same
through the rename so that old workflows keep loading, so two folders are two
packs registering the same ids, and the result is no node in the search at all,
under either name. If you already have both, delete one and restart. Your
presets, settings, favourites and LoRA memory are in ComfyUI's `user/`
directory, not in the pack folder.

## From a script or a coding agent

The pack ships a command-line client that renders on a running ComfyUI with no
browser. It picks the weights and the turbo settings itself and downloads the
result:

```
python3 skills/continuity-render/render.py families
python3 skills/continuity-render/render.py h3 "a cat stretches on a sunny windowsill"
```

`python3 skills/continuity-render/render.py --help` covers the options, and
[docs/headless.md](docs/headless.md) covers the HTTP API underneath. For
Claude Code, copy `skills/continuity-render` into `~/.claude/skills/` and ask
for a render in plain words.

## Documentation

- [Getting started](docs/getting-started.md)
- [Model downloads](docs/models.md) - every file, and the folder it goes in
- [The node](docs/the-node.md) - prompting, references, the cast, Refine
- [Timelines](docs/timeline.md) - pieces with more than one shot
- [Model families](docs/families.md) - what each model can do
- [Tools](docs/tools.md) - chat, ControlNet, upscaling, presets, LoRAs
- [Scripts and agents](docs/headless.md) - rendering from a shell or a coding agent
- [FAQ and troubleshooting](docs/faq.md)
- [Changelog](CHANGELOG.md) - what changed, release by release

## Models

| Family | Makes | Weights |
|---|---|---|
| MiniMax H3 | video with sound, and stills | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3) |
| LTX 2.5 | video with sound | [Lightricks/LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5) |
| Krea 2 | stills | [Comfy-Org/Krea-2](https://huggingface.co/Comfy-Org/Krea-2) |
| Ideogram 4.0 | stills | [Comfy-Org/Ideogram-4](https://huggingface.co/Comfy-Org/Ideogram-4) |
| Qwen Image Edit | stills, edited from a picture | [Comfy-Org/Qwen-Image-Edit_ComfyUI](https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI) |
| Flux 2 Klein | stills, edited from a picture | [Black Forest Labs](https://huggingface.co/black-forest-labs) |
| Qwen Image 2.1 | stills, drawn or edited from pictures | [Comfy-Org/Qwen-Image-2.1](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) |

See [docs/models.md](docs/models.md) for which files you need and where they go.

There is also an optional **neural refiner**: NVIDIA's DLSS 5 neural renderer
as a material pass over finished stills and clips (skin, hair, fabric, contact
shadows), through the open-source [MLX-DLSS](https://github.com/iamwavecut/MLX-DLSS)
port, which travels with the pack. It is not an upscaler and it ships with
nothing of NVIDIA's — the weights are extracted from your own copy of the DLSS
DLL on the settings page. See [docs/tools.md](docs/tools.md#neural-refiner-dlss-5).

## Thanks

This pack is glue. The work underneath it belongs to other people:

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) by Comfy Org - every family here lives in core, this node drives them
- [Lightricks](https://huggingface.co/Lightricks) - LTX 2.5, its IC-LoRAs, the duration head and the two-stage pipeline
- [ComfyUI-Spectrum-MiniMax-H3](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3) by xmarre - an accelerator on the sampler row
- [ComfyUI-MiniMaxH3-FirstBlockCache](https://github.com/duckyshell/ComfyUI-MiniMaxH3-FirstBlockCache) by duckyshell - an accelerator on the sampler row
- [ComfyUI-MiniMaxH3-TeaCache](https://github.com/Icyoung/ComfyUI-MiniMaxH3-TeaCache) by Icyoung - an accelerator on the sampler row
- [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) by Kijai - the live preview decoder, sage attention, the low vram pill
- [ComfyUI-MultiGPU](https://github.com/pollockjj/ComfyUI-MultiGPU) by pollockjj - the device chip on the weights popover
- [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) by city96 - loads the `.gguf` files the weights popover offers
- [ComfyUI#15416](https://github.com/Comfy-Org/ComfyUI/issues/15416) by matlowai - the fix behind H3 single-frame stills
- [ComfyUI-MiniMaxH3_LatentUpscaler](https://github.com/Tr1dae/ComfyUI-MiniMaxH3_LatentUpscaler) by Tr1dae - pioneered the two-pass upscale our refine pass reimplements
- [Minimax_h3_latent_Upscaler](https://huggingface.co/LBH-123-AI/Minimax_h3_latent_Upscaler) by LBH-123-AI - the trained latent upscaler behind the refine's "trained" road; the network is re-implemented here, the weights are theirs (Apache-2.0)
- [ComfyUI-H3-FaceRefine](https://github.com/Carasibana/ComfyUI-H3-FaceRefine) by Carasibana, and zuanfilm's graph on it - worked out the face pass ours reimplements
- [ComfyUI-MAINodes](https://github.com/matlowai/ComfyUI-MAINodes) by matlowai - the Motion Lab de-rope, whose method and measured dials the motion fix reimplements
- [minimax-h3-style-atlas](https://github.com/hoodtronik/minimax-h3-style-atlas) by hoodtronik, over [minimax_h3_1k](https://huggingface.co/datasets/ostris/minimax_h3_1k) by ostris - the 941 looks on the style tab
- [taehv](https://github.com/madebyollin/taehv) by madebyollin - the tiny decoder behind the live preview
- [BiRefNet](https://github.com/ZhengPeng7/BiRefNet) by ZhengPeng7 - the matte behind every one-click cutout
- [ComfyUI-H3-PowerLoraStack](https://github.com/cicalooo/ComfyUI-H3-PowerLoraStack) by cicalooo - the H3-safe LoRA loader, vendored (Apache-2.0)
- [MLX-DLSS](https://github.com/iamwavecut/MLX-DLSS) by iamwavecut - the DLSS 5 refiner's inference and weight extraction, vendored (Apache-2.0)
- [ComfyUI-VDN-H3](https://github.com/Saganaki22/ComfyUI-VDN-H3) by Saganaki22 - the port behind the VDN-H3 pill, vendored (Apache-2.0)
- [ComfyUI-PlagueKind-Nodes](https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes) by PlagueKind - SLA sparse attention on the attention pill
- [OpenVDN](https://github.com/OpenVDN/vdn-minimax-h3) - Video Delta Net itself: the hybrid attention, the training and the stages the pill loads
- NVIDIA - the DLSS 5 neural renderer itself. Nothing of theirs ships here; the weights are extracted from your own driver DLL
- [ReDetail](https://github.com/Bambushu/redetail) by Bambushu - the graph and the measurements behind the ReDetail upscale
- [Minimax-H3-ComfyUI](https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI) by Alissonerdx - the guide LoRAs behind the guide pass, and the rig they run in; trained on [ostris](https://github.com/ostris)'s ai-toolkit fork with guide-latent support
- [Raylight](https://github.com/Karmabu/raylight) by Karmabu - H3 across two GPUs
- MiniMax - H3 itself, and the reference guide this pack's prompts are written to
- Krea, Ideogram, Black Forest Labs and the Qwen team - the four still families beside H3 and LTX 2.5
- Meta - SAM 3, behind click-to-select cutouts, the faces pass and the Matte tracing
- ByteDance - SeedVR2, the Restore backend on the upscale bench
- Depth Anything 3 and SDPose - the two model-backed tracings, both loaded through core
- alibaba-pai - the MiniMax-H3-Acc-LoRAs whose 32 output heads the accelerator reads
- larryvrh and lightx2v - the H3 distillation LoRAs behind turbo
- CiviMeta - the sidecar format the LoRA cards read

Every node pack on that list is optional: if one is installed, the matching
pills light up, and if it is not, they say what is missing. The models are
optional in the same way — none of them is downloaded for you, and nothing on
this list ships inside the pack except the three vendored libraries it names.

## License

[MIT](LICENSE). ComfyUI itself is GPL-3.0 and this pack imports it; if you
redistribute the two together rather than as a node pack people install
themselves, that combination is what the GPL has an opinion about.
