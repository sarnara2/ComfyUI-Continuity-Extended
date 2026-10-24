// The LoRA manager grid.
// No backticks or ${} anywhere in the CSS: each chunk is one template literal.
export const css = `
/* --- lora manager --------------------------------------------------------- */
/* Wider cells than the asset grid: a card carries a name, a base model, trigger
   words and, once active, three controls. */
.mmc-lora-grid { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
/* Which folder under models/loras is being browsed. A native select: the list
   is as deep as the user's collection and the browser's own scrolling popup
   handles a hundred entries better than anything built here would. */
.mmc-folder {
  flex: none; max-width: calc(260px * var(--mmc-type)); height: calc(40px * var(--mmc-type)); border-radius: 12px;
  background: var(--mmc-surface); border: 1px solid var(--mmc-line); color: var(--mmc-text);
  padding: 0 10px; font-size: calc(13px * var(--mmc-type)); font-family: inherit; cursor: pointer; outline: none;
}
.mmc-overlay .mmc-modal-bar { position: relative; z-index: 2; pointer-events: auto; }
.mmc-overlay .mmc-modal-bar .mmc-search:focus,
.mmc-overlay .mmc-modal-bar .mmc-folder:focus-visible { border-color: var(--mmc-blue); }
/* Sits after the last card and spans the grid: how many are still unrendered
   while scrolling, and what the server left out when it stops. */
.mmc-grid-note {
  grid-column: 1/-1; color: var(--mmc-dim); font-size: calc(12px * var(--mmc-type));
  padding: 18px 0 4px; text-align: center; line-height: 1.5;
}
.mmc-lora {
  display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
  background: var(--mmc-surface); border: 2px solid transparent;
}
.mmc-lora[aria-selected="true"] { border-color: var(--mmc-strong); }
/* 4:3, and aspect-ratio rather than .mmc-cell's height:0 + padding-bottom.
   The cell IS a grid item, so its percentage padding sizes its own row. The art
   is a child of one, and percentage padding contributes nothing to a grid item's
   intrinsic height — the row would be sized for the body alone and the card,
   which clips, would swallow the picture whole. aspect-ratio gives a real height
   that counts. Every child is still positioned out of flow, so a showcase clip
   cannot push the box taller than its ratio. */
.mmc-lora-art {
  position: relative; aspect-ratio: 4 / 3; cursor: pointer; background: var(--mmc-float);
}
.mmc-lora-art img, .mmc-lora-art canvas, .mmc-lora-art video, .mmc-lora-art .mmc-cell-fallback {
  position: absolute; inset: 0; width: 100%; height: 100%; box-sizing: border-box;
}
.mmc-lora-art img, .mmc-lora-art canvas, .mmc-lora-art video { object-fit: cover; display: block; }
.mmc-lora-art:focus-visible { outline: 2px solid var(--mmc-edge-2); outline-offset: -2px; }
.mmc-lora[aria-selected="true"] .mmc-check { display: flex; }
.mmc-lora-body { display: flex; flex-direction: column; gap: 4px; padding: 10px 11px 11px; }
.mmc-lora-name {
  font-size: calc(13px * var(--mmc-type)); color: var(--mmc-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mmc-lora-sub {
  font-size: calc(11px * var(--mmc-type)); color: var(--mmc-dim);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* Long file labels use the timeline's continuous loop, without a hover gate.
   The repeated copy is visual only: selecting text still selects one label. */
.mmc-lora-label-loop {
  display: block; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.mmc-lora-label-track {
  display: inline-block; position: relative; vertical-align: bottom; white-space: nowrap;
}
.mmc-lora-label-loop.scrolling { text-overflow: clip; }
.mmc-lora-label-loop.scrolling > .mmc-lora-label-track {
  animation: mmc-lora-label-loop var(--mmc-lora-label-duration) linear infinite;
  animation-delay: 1s;
}
.mmc-lora-label-loop.scrolling > .mmc-lora-label-track::after {
  content: attr(data-mmc-loop-label); position: absolute; left: calc(100% + 48px); top: 0;
}
.mmc-lora-label-loop.held > .mmc-lora-label-track { animation-play-state: paused; }
@keyframes mmc-lora-label-loop {
  0% { transform: translateX(0); }
  100% { transform: translateX(calc(-1 * var(--mmc-lora-label-distance))); }
}
@media (prefers-reduced-motion: reduce) {
  .mmc-lora-label-loop.scrolling { text-overflow: ellipsis; }
  .mmc-lora-label-loop.scrolling > .mmc-lora-label-track { animation: none; }
  .mmc-lora-label-loop.scrolling > .mmc-lora-label-track::after { content: none; }
}
.mmc-lora-words {
  font-size: calc(11px * var(--mmc-type)); color: var(--mmc-accent); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mmc-lora-ctl {
  display: flex; flex-direction: column; gap: 7px;
  margin-top: 8px; padding-top: 9px; border-top: 1px solid var(--mmc-line);
}
.mmc-lora-row { display: flex; justify-content: space-between; align-items: center; font-size: calc(11px * var(--mmc-type)); }
.mmc-lora-label { color: var(--mmc-dim); }
/* The card's mute, in the strength row: label left, this and the readout right.
   Pressed is lit the way a chosen trigger chip is — same "on" in the same
   panel — except that what is lit here is the LoRA being *off*. */
.mmc-lora-mute {
  margin-left: auto; margin-right: 8px; padding: 1px 7px; border-radius: 8px;
  background: none; border: 1px solid var(--mmc-line); color: var(--mmc-off);
  font-family: inherit; font-size: calc(10px * var(--mmc-type)); cursor: pointer;
}
.mmc-lora-mute:hover { color: var(--mmc-text); }
.mmc-lora-mute[aria-pressed="true"] {
  background: color-mix(in srgb, var(--mmc-warn) 16%, transparent); border-color: transparent; color: var(--mmc-warn);
}
.mmc-lora-ctl input[type="range"] { width: 100%; accent-color: var(--mmc-blue); margin: 0; }
/* The weight, typed. It has to look like the readout it replaced until you go
   for it — a card of forty is a wall of boxes otherwise — but a track is never
   the right instrument for every LoRA, and this is the one control that reaches
   any value at all. */
.mmc-lora-num {
  width: calc(46px * var(--mmc-type)); flex: none; text-align: right;
  background: none; border: 1px solid transparent; border-radius: 7px;
  color: var(--mmc-text); font-family: inherit; font-size: calc(11px * var(--mmc-type));
  font-variant-numeric: tabular-nums; padding: 1px 4px; outline: none;
}
/* The soundtrack dial's readout. An output rather than an input: the strength
   is the one control worth being able to type an exact value into, and a second
   typable box on the same card would say the two are the same kind of setting.
   Numbers stay tabular so the row does not shift while the slider moves. */
.mmc-lora-read {
  flex: none; text-align: right; color: var(--mmc-text);
  font-size: calc(11px * var(--mmc-type)); font-variant-numeric: tabular-nums;
}
/* Its own group, so the label and the track it belongs to stay together when
   the card's gap opens between the other rows. */
.mmc-lora-sound { display: flex; flex-direction: column; gap: 4px; }
.mmc-lora-num:hover { border-color: var(--mmc-line); }
.mmc-lora-num:focus { border-color: var(--mmc-blue); background: var(--mmc-float); }
/* How far the track under this row reaches. A constant everywhere else in the
   panel, and a control here, because a slider LoRA and a style LoRA do not
   share a range and the difference has to be something you can see and change.
   Same chip as the mute beside it: they are both settings on this one row. */
.mmc-lora-span {
  flex: none; margin-right: 6px; padding: 1px 6px; border-radius: 8px;
  background: none; border: 1px solid var(--mmc-line); color: var(--mmc-off);
  font-family: inherit; font-size: calc(10px * var(--mmc-type));
  font-variant-numeric: tabular-nums; cursor: pointer;
}
.mmc-lora-span:hover { color: var(--mmc-text); border-color: var(--mmc-edge-2); }

/* --- versions -------------------------------------------------------------- */
/* One model's files, the pills wearing only what differs between them: the card
   above already said the name, and a pill that repeated it would be four
   identical unreadable words. Wraps rather than scrolls — a model with six
   retrains on disk should show six, and honestly. */
.mmc-vers { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 6px; }
.mmc-ver {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 7px; border-radius: 8px; max-width: 100%;
  background: none; border: 1px solid var(--mmc-line); color: var(--mmc-off);
  font-family: inherit; font-size: calc(10px * var(--mmc-type)); cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mmc-ver:hover { color: var(--mmc-text); }
/* Which one the card is turned to. Same blue-tinted press as the checkpoint
   segment below it, because it is the same kind of answer: one of these. */
.mmc-ver[aria-pressed="true"] {
  background: color-mix(in srgb, var(--mmc-blue) 22%, transparent);
  border-color: transparent; color: var(--mmc-text);
}
/* In the stack. A dot rather than a fill: being run and being looked at are two
   different states and a card can show both at once. */
.mmc-ver.on::before {
  content: ""; flex: none; width: 4px; height: 4px; border-radius: 50%;
  background: var(--mmc-accent);
}
/* Which version this model opens on tomorrow. Exactly the star's manners, and
   for the star's reason: an untouched grid should look untouched, but a pin
   that is set stays lit. Hidden rather than dropped, so reaching for one does
   not shuffle the pills out from under the pointer. */
.mmc-ver-pin {
  margin-left: auto; flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: calc(20px * var(--mmc-type)); height: calc(20px * var(--mmc-type));
  padding: 0; border: 0; border-radius: 7px; background: none;
  color: var(--mmc-off); cursor: pointer; visibility: hidden; opacity: .45;
}
.mmc-lora:hover .mmc-ver-pin, .mmc-ver-pin:focus-visible, .mmc-ver-pin.on { visibility: visible; }
.mmc-ver-pin:hover, .mmc-ver-pin:focus-visible { opacity: 1; color: var(--mmc-text); }
.mmc-ver-pin.on { opacity: 1; color: var(--mmc-accent); }
.mmc-lora-idle { font-size: calc(10px * var(--mmc-type)); color: var(--mmc-warn); }
.mmc-seg {
  display: flex; border: 1px solid var(--mmc-line); border-radius: 9px; overflow: hidden;
}
.mmc-seg-btn {
  flex: 1; padding: 5px 0; background: none; border: 0; border-right: 1px solid var(--mmc-line);
  color: var(--mmc-dim); font-size: calc(10px * var(--mmc-type)); font-family: inherit; cursor: pointer;
}
.mmc-seg-btn:last-child { border-right: 0; }
.mmc-seg-btn:hover { color: var(--mmc-text); }
.mmc-seg-btn[aria-pressed="true"] { background: color-mix(in srgb, var(--mmc-blue) 22%, transparent); color: var(--mmc-text); }

.mmc-trig-box { display: flex; flex-direction: column; gap: 6px; }
.mmc-trigs { display: flex; flex-wrap: wrap; gap: 4px; }
.mmc-trigs:empty { display: none; }
/* Off is an outline, on is filled: a sidecar word you have not taken should not
   look like one you have. */
.mmc-trig {
  padding: 2px 8px; border-radius: 8px; cursor: pointer; font-family: inherit;
  font-size: calc(10px * var(--mmc-type)); max-width: 100%; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; background: none; border: 1px solid var(--mmc-line);
  color: var(--mmc-off);
}
.mmc-trig:hover { color: var(--mmc-text); }
.mmc-trig[aria-pressed="true"] {
  background: color-mix(in srgb, var(--mmc-accent) 14%, transparent); border-color: transparent; color: var(--mmc-accent);
}
/* Yours rather than the sidecar's — same weight in the prompt, but you can tell
   which list a word came from. Two controls in one chip: the word toggles, and
   the ✕ forgets it. It needs both because a word of yours that is switched off
   is still a chip — there is no "click again and it is gone" left to be the way
   out, and without the ✕ a typo would sit under that LoRA forever. */
.mmc-trig.own {
  display: inline-flex; align-items: center; padding: 0;
  border: 1px dashed color-mix(in srgb, var(--mmc-accent) 50%, transparent);
  background: none; color: var(--mmc-off);
}
.mmc-trig.own.on {
  background: color-mix(in srgb, var(--mmc-accent) 14%, transparent); color: var(--mmc-accent);
}
.mmc-trig-word {
  background: none; border: 0; color: inherit; font-family: inherit; font-size: inherit;
  padding: 2px 3px 2px 8px; cursor: pointer; max-width: 140px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* Quiet until wanted: forgetting a word is rarer than switching one off, and a
   row of ✕s would read as the chips' main business. */
.mmc-trig-forget {
  background: none; border: 0; color: inherit; font-family: inherit;
  font-size: calc(9px * var(--mmc-type)); line-height: 1; padding: 2px 6px 2px 2px;
  cursor: pointer; opacity: .4;
}
.mmc-trig-forget:hover { opacity: 1; color: var(--mmc-warn); }
.mmc-trig-add {
  height: calc(24px * var(--mmc-type)); border-radius: 8px; background: var(--mmc-float); border: 1px solid var(--mmc-line);
  color: var(--mmc-text); padding: 0 8px; font-size: calc(11px * var(--mmc-type)); font-family: inherit; outline: none;
  width: 100%; box-sizing: border-box;
}
.mmc-trig-add:focus { border-color: var(--mmc-blue); }

/* The star, and the same quiet-until-hover rule the asset picker's has: an
   untouched grid should look untouched, but a set star stays lit. Steps left
   when the selection check needs the corner. */
.mmc-lora-star {
  position: absolute; top: 8px; right: 8px; width: 24px; height: 24px;
  display: none; align-items: center; justify-content: center;
  border: 0; border-radius: 50%; background: var(--mmc-scrim-2);
  color: var(--mmc-text); cursor: pointer; padding: 0;
}
.mmc-lora-art:hover .mmc-lora-star,
.mmc-lora-art:focus-visible .mmc-lora-star,
.mmc-lora-star.on { display: flex; }
.mmc-lora-star.on { color: var(--mmc-accent); }
.mmc-lora-star.on svg { fill: currentColor; }
.mmc-lora-star svg { width: 13px; height: 13px; }
.mmc-lora[aria-selected="true"] .mmc-lora-star { right: 36px; }

/* Where these settings came from, when it was not the file's own sidecar. */
.mmc-lora-memo { font-size: calc(10px * var(--mmc-type)); color: var(--mmc-dim); font-style: italic; }

/* The card the window was opened for. Lit, then let go of — a mark that stayed
   would become part of how the card looks rather than an answer to "which one
   did I click". */
.mmc-lora-found { border-color: var(--mmc-blue); }
.mmc-lora-found .mmc-lora-art { box-shadow: inset 0 0 0 2px var(--mmc-blue); }
@media (prefers-reduced-motion: no-preference) {
  .mmc-lora-found { animation: mmc-lora-found 1.6s ease-out; }
}
@keyframes mmc-lora-found {
  0%, 55% { border-color: var(--mmc-blue); }
  100% { border-color: transparent; }
}

/* --- saved stacks ---------------------------------------------------------- */
/* One column rather than the grid's cards: a stack is a name and a list of
   filenames, and both want the width to read on one line. Same bottom padding
   as the grid, which clears the floating Done bar. */
.mmc-stacks {
  flex: 1; overflow-y: auto; padding: 4px 24px 96px;
  display: flex; flex-direction: column; gap: 8px;
}
.mmc-stack, .mmc-stack-save {
  display: flex; align-items: center; gap: 14px; padding: 12px 16px;
  border-radius: 12px; background: var(--mmc-surface); border: 1px solid transparent;
}
/* Keeping one is the errand you arrive on this tab with, so it leads and is
   marked off from the shelf below it rather than sitting in the same list. */
.mmc-stack-save { border-color: var(--mmc-line); background: none; }
.mmc-stack-what, .mmc-stack-save-what { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.mmc-stack-title { font-size: calc(14px * var(--mmc-type)); color: var(--mmc-text); }
.mmc-stack-sub {
  font-size: calc(11px * var(--mmc-type)); color: var(--mmc-dim);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mmc-stack-name {
  flex: none; width: calc(200px * var(--mmc-type)); height: calc(36px * var(--mmc-type));
  border-radius: 10px; background: var(--mmc-float); border: 1px solid var(--mmc-line);
  color: var(--mmc-text); padding: 0 12px; font-size: calc(13px * var(--mmc-type));
  font-family: inherit; outline: none;
}
.mmc-stack-name:focus { border-color: var(--mmc-blue); }
.mmc-stack .mmc-del { font-size: calc(12px * var(--mmc-type)); }

/* Timeline-only manager: one full-height pane at a time. The attached editor
   and library keep their own scroll position when switching between tabs. */
.mmc-lora-unified .mmc-modal-head {
  position: relative; flex: none; flex-wrap: wrap; gap: 8px 22px;
  padding-right: calc(58px * var(--mmc-type));
}
.mmc-lora-unified .mmc-modal-head .mmc-close {
  position: absolute; margin: 0; right: 24px; top: 50%; transform: translateY(-50%);
}
.mmc-lora-unified .mmc-modal-head .mmc-tab { max-width: 100%; }
.mmc-lora-added {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column; gap: 8px;
  padding: 14px 24px 0;
  container-type: inline-size;
}
.mmc-lora-section-head { display: flex; align-items: center; gap: 8px; flex: none; }
.mmc-lora-section-head h3 {
  margin: 0; color: var(--mmc-text); font-size: calc(13px * var(--mmc-type)); font-weight: 600;
}
.mmc-lora-added-count {
  color: var(--mmc-accent); font-size: calc(11px * var(--mmc-type));
  background: color-mix(in srgb, var(--mmc-accent) 12%, transparent);
  padding: 1px 7px; border-radius: 8px;
}
.mmc-lora-section-hint {
  flex: none; margin: 0; color: var(--mmc-dim); font-size: calc(11px * var(--mmc-type)); line-height: 1.4;
}
.mmc-lora-added-grid {
  flex: 1;
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 0 3px 96px 0;
  align-content: start; grid-auto-rows: max-content;
}
/* Match the library/picker's thin rounded native bar, overriding the pack's
   default hidden bars only on these three Timeline LoRA tab scroll surfaces. */
.mmc-lora-unified .mmc-lora-added-grid,
.mmc-lora-unified .mmc-lora-grid,
.mmc-lora-unified .mmc-stacks {
  min-height: 0; scrollbar-gutter: stable;
  scrollbar-width: thin; scrollbar-color: var(--mmc-line-3) transparent;
}
.mmc-lora-unified .mmc-lora-added-grid::-webkit-scrollbar,
.mmc-lora-unified .mmc-lora-grid::-webkit-scrollbar,
.mmc-lora-unified .mmc-stacks::-webkit-scrollbar { display: block; width: 6px; height: 6px; }
.mmc-lora-unified .mmc-lora-added-grid::-webkit-scrollbar-thumb,
.mmc-lora-unified .mmc-lora-grid::-webkit-scrollbar-thumb,
.mmc-lora-unified .mmc-stacks::-webkit-scrollbar-thumb { background: var(--mmc-line-3); border-radius: 3px; }
.mmc-lora-unified .mmc-lora-added-grid::-webkit-scrollbar-track,
.mmc-lora-unified .mmc-lora-grid::-webkit-scrollbar-track,
.mmc-lora-unified .mmc-stacks::-webkit-scrollbar-track { background: transparent; }
.mmc-lora-added-card {
  min-width: 0; padding: 10px 11px; border-radius: 12px;
  border: 1px solid var(--mmc-line); background: var(--mmc-surface);
}
.mmc-lora-added-card.muted { border-style: dashed; }
.mmc-lora-added-thumb {
  position: relative; display: block; width: 100%; min-height: 224px; aspect-ratio: 4 / 3;
  margin-top: 8px; padding: 0; box-sizing: border-box; border: 1px solid var(--mmc-line); border-radius: 12px;
  overflow: hidden; background: var(--mmc-float); color: var(--mmc-dim); cursor: pointer;
}
.mmc-lora-added-thumb > img, .mmc-lora-added-thumb > video,
.mmc-lora-added-thumb > .mmc-cell-fallback {
  position: absolute; inset: 0; width: 100%; height: 100%; box-sizing: border-box;
}
.mmc-lora-added-thumb > img, .mmc-lora-added-thumb > video { object-fit: contain; display: block; }
.mmc-lora-added-thumb:hover { border-color: var(--mmc-edge-2); }
.mmc-lora-added-thumb:focus-visible { outline: 2px solid var(--mmc-blue); outline-offset: 2px; }
/* An unloaded image still needs a visible box for lazy showcase loading. */
.mmc-sheet-media > img, .mmc-sheet-media > video { width: 100%; height: 100%; min-width: 0; min-height: 0; }
.mmc-lora-added-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
.mmc-lora-added-name {
  flex: 1 1 150px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--mmc-text); font-size: calc(13px * var(--mmc-type)); font-weight: 500;
}
.mmc-lora-added-card > .mmc-lora-sub { margin-top: 4px; }
.mmc-lora-added-actions { display: flex; align-items: center; gap: 5px; flex: none; }
.mmc-lora-added-action {
  display: inline-flex; justify-content: center; align-items: center; flex: none;
  width: calc(23px * var(--mmc-type)); height: calc(23px * var(--mmc-type));
  padding: 0; border: 1px solid transparent; border-radius: 7px; background: none;
  color: var(--mmc-off); font-family: inherit; font-size: calc(12px * var(--mmc-type)); cursor: pointer;
}
.mmc-lora-added-action:hover, .mmc-lora-added-action:focus-visible {
  color: var(--mmc-text); background: var(--mmc-float); border-color: var(--mmc-line);
}
.mmc-lora-added-action.on { color: var(--mmc-accent); }
.mmc-lora-added-actions .mmc-asset-x { opacity: 1; }
.mmc-lora-added-card .mmc-lora-row { flex-wrap: wrap; gap: 4px; }
.mmc-lora-added-status { color: var(--mmc-warn); font-size: calc(10px * var(--mmc-type)); line-height: 1.4; margin-top: 5px; }
.mmc-lora-added-empty { grid-column: 1/-1; color: var(--mmc-dim); font-size: calc(12px * var(--mmc-type)); line-height: 1.5; padding: 7px 0; }
.mmc-lora-unified .mmc-modal-bar { flex: none; flex-wrap: wrap; padding-top: 10px; padding-bottom: 10px; }
.mmc-lora-unified .mmc-search { min-width: 0; flex: 1 1 180px; box-sizing: border-box; }
.mmc-lora-unified .mmc-folder { min-width: 0; max-width: 100%; box-sizing: border-box; flex: 0 1 260px; }
.mmc-lora-unified .mmc-lora-grid { grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); }
.mmc-lora-library-state { color: var(--mmc-dim); font-size: calc(11px * var(--mmc-type)); margin-top: 4px; }
.mmc-lora-library-state.on { color: var(--mmc-accent); }
.mmc-lora-pin-notice {
  position: absolute; z-index: 2; left: 24px; bottom: 110px;
  width: max-content; max-width: calc(100% - 48px); box-sizing: border-box;
  padding: 8px 12px; border-radius: 12px; pointer-events: none;
  background: var(--mmc-surface); border: 1px solid color-mix(in srgb, var(--mmc-warn) 45%, transparent);
  color: var(--mmc-warn); font-size: calc(12px * var(--mmc-type)); line-height: 1.4;
  box-shadow: 0 8px 24px var(--mmc-shadow-soft);
}
@container (max-width: 980px) {
  .mmc-lora-added-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 650px) {
  .mmc-lora-added-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .mmc-lora-unified .mmc-modal-head { gap: 8px 14px; padding: 12px; padding-right: calc(54px * var(--mmc-type)); }
  .mmc-lora-unified .mmc-modal-head .mmc-close { right: 12px; }
  .mmc-lora-unified .mmc-modal-head .mmc-tab { font-size: calc(14px * var(--mmc-type)); }
  .mmc-lora-added { padding: 10px 12px 0; }
  .mmc-lora-unified .mmc-modal-bar { gap: 8px; padding: 8px 12px; }
  .mmc-lora-unified .mmc-grid { padding-left: 12px; padding-right: 12px; }
  .mmc-lora-unified .mmc-folder { flex-basis: 100%; }
  .mmc-lora-unified .mmc-stacks { padding-left: 12px; padding-right: 12px; }
  .mmc-lora-unified .mmc-stack, .mmc-lora-unified .mmc-stack-save { flex-wrap: wrap; gap: 8px; padding: 10px; }
  .mmc-lora-unified .mmc-stack-save-what, .mmc-lora-unified .mmc-stack-what { flex-basis: 100%; }
  .mmc-lora-unified .mmc-stack-name { width: 100%; min-width: 0; box-sizing: border-box; }
  .mmc-lora-unified .mmc-modal-foot { left: 12px; right: 12px; gap: 8px; padding: 10px; max-width: calc(100% - 24px); box-sizing: border-box; }
  .mmc-lora-unified .mmc-modal-foot .mmc-slots { flex: 1; min-width: 0; }
  .mmc-lora-unified .mmc-modal-foot .mmc-add { flex: none; white-space: nowrap; }
  .mmc-lora-pin-notice { left: 12px; max-width: calc(100% - 24px); bottom: 116px; }
}

`;
