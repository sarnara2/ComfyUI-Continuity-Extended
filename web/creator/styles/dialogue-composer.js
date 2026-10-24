// A compact paged composer: changing pages never changes the segment.
export const css = `
.mmc-overlay.mmc-dialogue-overlay { padding: 14px; box-sizing: border-box; }
.mmc-overlay > .mmc-dialogue-dialog {
  width: min(980px, 100%); height: auto; max-height: none; overflow: visible;
  display: flex; flex-direction: column; background: var(--mmc-float); color: var(--mmc-text);
  border: 1px solid var(--mmc-line); border-radius: 18px; box-sizing: border-box;
  box-shadow: 0 30px 90px var(--mmc-shadow); font-size: calc(12px * var(--mmc-type));
}
.mmc-dialogue-head { padding: 14px 18px; gap: 12px; border-bottom: 1px solid var(--mmc-line); }
.mmc-dialogue-head > strong { flex: 1; font-size: calc(15px * var(--mmc-type)); }
.mmc-dialogue-tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 18px; border-bottom: 1px solid var(--mmc-line); }
.mmc-dialogue-dialog .mmc-pill { min-height: 26px; height: auto; padding: 5px 11px; font-size: calc(11px * var(--mmc-type)); line-height: 1.3; }
.mmc-dialogue-dialog .mmc-pill[aria-selected="true"],
.mmc-dialogue-dialog .mmc-pill[aria-pressed="true"],
.mmc-dialogue-dialog .mmc-pill[aria-checked="true"] {
  color: var(--mmc-accent); border-color: var(--mmc-accent);
  background: color-mix(in srgb, var(--mmc-accent) 12%, var(--mmc-surface));
}
.mmc-dialogue-content { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); min-width: 0; }
.mmc-dialogue-panel { display: flex; flex-direction: column; gap: 12px; padding: 18px; min-width: 0; }
.mmc-dialogue-control { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.mmc-dialogue-label, .mmc-dialogue-panel label { color: var(--mmc-text); }
.mmc-dialogue-choices { display: flex; flex-wrap: wrap; gap: 6px; }
.mmc-dialogue-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.mmc-dialogue-two label { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.mmc-dialogue-dialog select, .mmc-dialogue-dialog input, .mmc-dialogue-dialog textarea {
  width: 100%; min-width: 0; padding: 8px 10px; border: 1px solid var(--mmc-line);
  border-radius: 10px; background: var(--mmc-surface); color: var(--mmc-text);
  font: inherit; box-sizing: border-box;
}
.mmc-dialogue-dialog textarea { height: 96px; resize: none; line-height: 1.6; }
.mmc-dialogue-note { margin: 0; color: var(--mmc-dim); font-size: calc(11px * var(--mmc-type)); line-height: 1.55; overflow-wrap: anywhere; }
.mmc-dialogue-open-speakers { align-self: flex-start; }
.mmc-dialogue-preview { display: flex; flex-direction: column; gap: 10px; padding: 18px; min-width: 0; border-left: 1px solid var(--mmc-line); }
.mmc-dialogue-speaker-info { color: var(--mmc-accent); overflow-wrap: anywhere; }
.mmc-dialogue-preview-text { margin: 0; min-height: 130px; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word;
  font: inherit; line-height: 1.75; padding: 12px; background: var(--mmc-surface); border: 1px solid var(--mmc-line); border-radius: 12px; user-select: text; }
.mmc-dialogue-preview-text:empty { display: none; }
.mmc-dialogue-status { padding: 0 18px; color: var(--mmc-accent); line-height: 1.4; }
.mmc-dialogue-status:empty { display: none; }
.mmc-dialogue-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; padding: 12px 18px; border-top: 1px solid var(--mmc-line); }
.mmc-dialogue-footer > :first-child { margin-right: auto; }
.mmc-dialogue-footer .active { color: var(--mmc-accent); border-color: var(--mmc-accent); }
.mmc-dialogue-speakers { display: flex; flex-direction: column; gap: 7px; }
/* The picker is a nested view of Dialogue, not a second top-level category.
 * Only this explicitly scrollable roster gets a taller, viewport-bounded shell. */
.mmc-overlay > .mmc-dialogue-dialog[data-page="speaker"] {
  height: min(800px, calc(100dvh - 28px)); min-height: 0;
}
.mmc-dialogue-dialog[data-page="speaker"] .mmc-dialogue-content { flex: 1; min-height: 0; }
.mmc-dialogue-dialog[data-page="speaker"] .mmc-dialogue-panel { flex: 1; min-height: 0; }
.mmc-dialogue-dialog[data-page="speaker"] .mmc-dialogue-speakers {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  padding: 3px; box-sizing: border-box; scrollbar-gutter: stable;
  overscroll-behavior: contain; scroll-padding: 3px;
}
.mmc-dialogue-speakers:focus-visible { outline: 1px solid var(--mmc-accent); outline-offset: 2px; }
.mmc-dialogue-speaker-back { margin-left: auto; }
.mmc-dialogue-speaker-card { display: flex; align-items: center; gap: 9px; padding: 7px 9px; border: 1px solid var(--mmc-line); border-radius: 12px; min-width: 0; }
.mmc-dialogue-speakers .mmc-dialogue-speaker-card {
  flex: none; height: calc(44px * var(--mmc-type) + 16px); box-sizing: border-box;
}
.mmc-dialogue-speaker-card > img, .mmc-dialogue-speaker-card > svg { flex: none; width: 38px; height: 44px; object-fit: contain; border-radius: 7px; background: var(--mmc-surface); }
.mmc-dialogue-speaker-card > div { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 3px; }
.mmc-dialogue-speaker-card strong { overflow-wrap: anywhere; }
.mmc-dialogue-speaker-card span { font-size: calc(10px * var(--mmc-type)); color: var(--mmc-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mmc-dialogue-speaker-card > button { max-width: 45%; white-space: normal; }
.mmc-dialogue-pager { display: flex; justify-content: center; align-items: center; gap: 14px; }
.mmc-dialogue-save { display: flex; gap: 8px; align-items: center; }
.mmc-dialogue-save input { flex: 1; }
.mmc-dialogue-save-words { display: flex; align-items: center; gap: 7px; }
.mmc-dialogue-save-words input { width: auto; }
.mmc-dialogue-cue-tools { display: flex; flex-wrap: wrap; gap: 6px; }
.mmc-dialogue-cues { display: flex; flex-direction: column; gap: 6px; }
.mmc-dialogue-cue { display: flex; align-items: center; gap: 5px; min-width: 0; }
.mmc-dialogue-cue > span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mmc-dialogue-cue .mmc-pill { padding: 3px 8px; }
.mmc-dialogue-recipes { display: flex; flex-direction: column; gap: 7px; }
.mmc-dialogue-recipe { display: flex; gap: 6px; min-width: 0; }
.mmc-dialogue-recipe-name { flex: 1; min-width: 0; overflow-wrap: anywhere; white-space: normal; }
.mmc-dialogue-example { white-space: pre-wrap; overflow-wrap: anywhere; padding: 10px; background: var(--mmc-surface); border-radius: 10px; user-select: text; }
.mmc-dialogue-links { display: flex; flex-wrap: wrap; gap: 14px; }
.mmc-dialogue-links a { color: var(--mmc-accent); }
.mmc-dialogue-dialog [data-dialogue-page="preview"] { display: none; }
.mmc-dialogue-dialog[data-page="preview"] .mmc-dialogue-content { display: block; }
.mmc-dialogue-dialog[data-page="preview"] .mmc-dialogue-panel { padding: 0; }
.mmc-dialogue-dialog[data-page="preview"] .mmc-dialogue-preview { border-left: 0; }
.mmc-dialogue-dialog button:focus-visible, .mmc-dialogue-dialog textarea:focus-visible,
.mmc-dialogue-dialog input:focus-visible, .mmc-dialogue-dialog select:focus-visible,
.mmc-dialogue-dialog a:focus-visible { outline: 2px solid var(--mmc-accent); outline-offset: 2px; }
@media (max-width: 760px), (max-height: 720px) {
  .mmc-overlay > .mmc-dialogue-dialog { width: min(760px, 100%); }
  .mmc-dialogue-content { display: block; }
  .mmc-dialogue-dialog[data-page="speaker"] .mmc-dialogue-content { display: flex; flex-direction: column; }
  .mmc-dialogue-content > .mmc-dialogue-preview { display: none; }
  .mmc-dialogue-dialog [data-dialogue-page="preview"] { display: inline-flex; }
  .mmc-dialogue-head { padding: 10px 14px; }
  .mmc-dialogue-tabs { padding: 8px 14px; }
  .mmc-dialogue-panel, .mmc-dialogue-preview { padding: 12px 14px; gap: 9px; }
  .mmc-dialogue-preview-text { min-height: 70px; }
  .mmc-dialogue-footer { padding: 10px 14px; }
}
@media (max-height: 620px) {
  .mmc-dialogue-dialog { font-size: calc(11px * var(--mmc-type)); }
  .mmc-dialogue-dialog .mmc-dialogue-head { padding: 8px 12px; }
  .mmc-dialogue-head > strong { font-size: calc(13px * var(--mmc-type)); }
  .mmc-dialogue-dialog .mmc-pill { padding: 4px 8px; min-height: 24px; font-size: calc(10px * var(--mmc-type)); }
  .mmc-dialogue-dialog textarea { height: 76px; }
  .mmc-dialogue-panel { gap: 8px; }
  .mmc-dialogue-note { line-height: 1.4; }
  .mmc-dialogue-tabs { padding: 6px 12px; gap: 5px; }
  .mmc-dialogue-dialog .mmc-dialogue-panel { padding-top: 8px; padding-bottom: 8px; gap: 6px; }
  .mmc-dialogue-dialog textarea { height: 64px; }
  .mmc-dialogue-dialog .mmc-dialogue-note { font-size: calc(10px * var(--mmc-type)); }
  .mmc-dialogue-dialog .mmc-dialogue-footer { padding: 8px 12px; }
  .mmc-dialogue-two label, .mmc-dialogue-control { gap: 4px; }
  .mmc-dialogue-dialog select, .mmc-dialogue-dialog input { padding: 6px 8px; }
}
`;
