export const css = `
.mmc-overlay.mmc-cp-overlay, .mmc-overlay.mmc-cp-custom-overlay { padding: 24px; box-sizing: border-box; }
.mmc-modal.mmc-cp-dialog { width: min(1320px, 100%); height: min(860px, 100%); min-height: 0; }
.mmc-modal.mmc-cp-dialog[data-field="replaces"] { height: auto; max-height: 100%; }
.mmc-cp-head { display: flex; align-items: flex-start; gap: 20px; padding: 22px 24px 18px; border-bottom: 1px solid var(--mmc-line); flex: none; }
.mmc-cp-heading { flex: 1; min-width: 0; }
.mmc-cp-title-line { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; min-width: 0; }
.mmc-cp-title { color: var(--mmc-strong); font-size: calc(18px * var(--mmc-type)); font-weight: 600; }
.mmc-cp-context { border: 1px solid var(--mmc-line-2); border-radius: 999px; padding: 5px 12px; font-size: calc(12px * var(--mmc-type)); color: var(--mmc-accent); background: var(--mmc-surface); }
.mmc-cp-note { margin: 10px 0 0; color: var(--mmc-dim); font-size: calc(12px * var(--mmc-type)); line-height: 1.5; overflow-wrap: anywhere; }
.mmc-cp-close { margin-left: auto; flex: none; color: var(--mmc-accent); display: flex; align-items: center; justify-content: center; }
.mmc-cp-controls { padding: 18px 24px 14px; display: flex; flex-direction: column; gap: 14px; flex: none; }
.mmc-cp-navigation { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.mmc-cp-tabs { display: inline-flex; align-items: center; flex-wrap: wrap; padding: 4px; gap: 4px; border: 1px solid var(--mmc-line); border-radius: 22px; background: var(--mmc-tint); }
.mmc-cp-pill { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--mmc-line-2); border-radius: 999px; background: var(--mmc-surface); color: var(--mmc-text); padding: 8px 14px; font: inherit; font-size: calc(12px * var(--mmc-type)); line-height: 1.3; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.mmc-cp-pill:hover:not(:disabled) { background: var(--mmc-surface-2); border-color: var(--mmc-line-3); }
.mmc-cp-pill[aria-pressed="true"] { color: var(--mmc-blue); border-color: color-mix(in srgb, var(--mmc-blue) 60%, transparent); background: color-mix(in srgb, var(--mmc-blue) 8%, var(--mmc-surface)); }
.mmc-cp-tab { border-color: transparent; background: transparent; }
.mmc-cp-add { margin-left: auto; }
.mmc-cp-pill:disabled, .mmc-cp-star:disabled, .mmc-cp-edit:disabled { opacity: .45; cursor: default; }
.mmc-cp-search { position: relative; display: flex; align-items: center; }
.mmc-cp-search-input { width: 100%; box-sizing: border-box; height: calc(44px * var(--mmc-type)); min-width: 0; padding: 0 44px 0 16px; border: 1px solid var(--mmc-line-2); border-radius: 999px; background: var(--mmc-surface); color: var(--mmc-text); font: inherit; font-size: calc(14px * var(--mmc-type)); }
.mmc-cp-search-input::-webkit-search-cancel-button { display: none; }
.mmc-cp-search-input::placeholder, .mmc-cp-form-input::placeholder { color: var(--mmc-off); }
.mmc-cp-search-input:focus { outline: 0; border-color: var(--mmc-blue); }
.mmc-cp-search-clear { position: absolute; right: 10px; width: 28px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 50%; color: var(--mmc-dim); background: var(--mmc-wash); cursor: pointer; }
.mmc-cp-filter-line { display: flex; align-items: flex-start; gap: 12px; }
.mmc-cp-categories { display: flex; gap: 7px; flex-wrap: wrap; flex: 1; min-width: 0; }
.mmc-cp-category { font-size: calc(11px * var(--mmc-type)); padding: 6px 11px; color: var(--mmc-dim); }
.mmc-cp-count { flex: none; color: var(--mmc-off); font-size: calc(11px * var(--mmc-type)); padding: 7px 0; }
.mmc-cp-results { flex: 1; min-height: 100px; overflow: auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: min-content; align-content: start; gap: 10px; padding: 2px 24px 20px; scrollbar-gutter: stable; }
.mmc-cp-row { display: flex; align-items: stretch; border: 1px solid var(--mmc-line); border-radius: 18px; background: var(--mmc-tint); min-width: 0; overflow: hidden; }
.mmc-cp-row:has(.mmc-cp-select[aria-pressed="true"]) { background: color-mix(in srgb, var(--mmc-blue) 7%, var(--mmc-surface)); border-color: color-mix(in srgb, var(--mmc-blue) 60%, transparent); }
.mmc-cp-select { flex: 1; min-width: 0; padding: 16px 10px 16px 16px; color: var(--mmc-text); background: transparent; border: 0; font: inherit; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 8px; }
.mmc-cp-select:hover { background: var(--mmc-wash); }
.mmc-cp-row-head { display: flex; align-items: center; flex-wrap: wrap; gap: 7px 12px; }
.mmc-cp-row-title { color: var(--mmc-strong); font-size: calc(13px * var(--mmc-type)); font-weight: 500; overflow-wrap: anywhere; }
.mmc-cp-row-category { font-size: calc(10px * var(--mmc-type)); color: var(--mmc-off); }
.mmc-cp-row-text { font-size: calc(12px * var(--mmc-type)); line-height: 1.6; color: var(--mmc-dim); overflow-wrap: anywhere; white-space: pre-wrap; }
.mmc-cp-row-tools { display: flex; flex-direction: column; gap: 6px; padding: 12px 10px 12px 2px; }
.mmc-cp-star, .mmc-cp-edit { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 50%; background: transparent; color: var(--mmc-off); cursor: pointer; }
.mmc-cp-star:hover, .mmc-cp-edit:hover { background: var(--mmc-wash); color: var(--mmc-text); }
.mmc-cp-star[aria-pressed="true"] { color: var(--mmc-accent); }
.mmc-cp-star[aria-pressed="true"] svg { fill: color-mix(in srgb, var(--mmc-accent) 22%, transparent); }
.mmc-cp-empty { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 9px; min-height: 140px; padding: 24px; color: var(--mmc-dim); text-align: center; font-size: calc(13px * var(--mmc-type)); }
.mmc-cp-empty strong { color: var(--mmc-text); font-weight: 500; }
.mmc-cp-empty span { font-size: calc(12px * var(--mmc-type)); }
.mmc-cp-foot { flex: none; border-top: 1px solid var(--mmc-line); padding: 16px 24px 12px; display: flex; flex-direction: column; gap: 10px; }
.mmc-cp-current { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.mmc-cp-preview-label { flex: none; font-size: calc(11px * var(--mmc-type)); font-weight: 500; color: var(--mmc-dim); }
.mmc-cp-current-text { flex: 1; min-width: 0; max-height: 42px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: calc(11px * var(--mmc-type)); color: var(--mmc-dim); line-height: 1.6; }
.mmc-cp-current-text.empty { color: var(--mmc-off); }
.mmc-cp-preview { display: flex; align-items: center; gap: 18px; padding: 14px 16px; border: 1px solid var(--mmc-line); border-radius: 18px; background: var(--mmc-surface); }
.mmc-cp-preview-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.mmc-cp-preview-text { max-height: 70px; overflow: auto; overflow-wrap: anywhere; white-space: pre-wrap; font-size: calc(12px * var(--mmc-type)); line-height: 1.6; color: var(--mmc-text); }
.mmc-cp-preview-text:empty { display: none; }
.mmc-cp-apply, .mmc-cp-save { color: var(--mmc-blue); border-color: color-mix(in srgb, var(--mmc-blue) 60%, transparent); flex: none; font-weight: 500; }
.mmc-cp-warning { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: calc(12px * var(--mmc-type)); color: var(--mmc-accent); line-height: 1.5; }
.mmc-cp-force { padding: 6px 12px; color: var(--mmc-accent); border-color: currentColor; }
.mmc-cp-status { min-height: 16px; color: var(--mmc-dim); font-size: calc(11px * var(--mmc-type)); line-height: 1.5; overflow-wrap: anywhere; }
.mmc-cp-status.warning, .mmc-cp-custom-status { color: var(--mmc-accent); }
.mmc-cp-dialog button:focus-visible, .mmc-cp-custom-dialog button:focus-visible { outline: 2px solid var(--mmc-blue); outline-offset: -3px; }
.mmc-cp-search-clear[hidden], .mmc-cp-warning[hidden] { display: none; }
.mmc-modal.mmc-cp-custom-dialog { width: min(1000px, 100%); height: auto; max-height: 100%; min-height: 0; }
.mmc-cp-custom-form { display: flex; flex-direction: column; gap: 14px; padding: 24px; min-height: 0; overflow: auto; }
.mmc-cp-form-group { border: 1px solid var(--mmc-line); border-radius: 18px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.mmc-cp-form-row { display: grid; grid-template-columns: calc(150px * var(--mmc-type)) minmax(0, 1fr); align-items: start; gap: 14px; }
.mmc-cp-form-row > span { padding-top: 10px; color: var(--mmc-dim); font-size: calc(12px * var(--mmc-type)); line-height: 1.5; }
.mmc-cp-form-input { box-sizing: border-box; min-width: 0; width: 100%; border: 1px solid var(--mmc-line-2); border-radius: 12px; background: var(--mmc-surface); color: var(--mmc-text); padding: 10px 12px; font: inherit; font-size: calc(13px * var(--mmc-type)); line-height: 1.5; }
.mmc-cp-form-text { resize: vertical; min-height: 120px; }
.mmc-cp-form-input:focus { outline: 0; border-color: var(--mmc-blue); }
.mmc-cp-custom-form > .mmc-cp-note { margin: -4px 2px 0; }
.mmc-cp-custom-status { min-height: 0; font-size: calc(12px * var(--mmc-type)); }
.mmc-cp-custom-status:empty { display: none; }
.mmc-cp-form-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 10px; border-top: 1px solid var(--mmc-line); padding-top: 16px; }
.mmc-cp-delete { margin-right: auto; color: var(--mmc-dim); }
.mmc-cp-delete.armed { color: var(--mmc-bad, #ef6b65); border-color: currentColor; }
.mmc-cp-results, .mmc-cp-custom-form, .mmc-cp-current-text, .mmc-cp-preview-text { scrollbar-width: thin; scrollbar-color: var(--mmc-line-3) transparent; }
@media (max-width: 900px) {
  .mmc-cp-results { grid-template-columns: minmax(0, 1fr); }
  .mmc-cp-form-row { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .mmc-cp-form-row > span { padding-top: 0; }
}
@media (max-width: 600px) {
  .mmc-overlay.mmc-cp-overlay, .mmc-overlay.mmc-cp-custom-overlay { padding: 12px; }
  .mmc-cp-head { padding: 16px; gap: 12px; }
  .mmc-cp-controls { padding: 14px 16px 12px; gap: 12px; }
  .mmc-cp-results { padding: 2px 16px 14px; }
  .mmc-cp-foot { padding: 12px 16px 10px; }
  .mmc-cp-tabs { gap: 3px; padding: 3px; }
  .mmc-cp-tab { padding: 7px 10px; }
  .mmc-cp-add { margin-left: 0; }
  .mmc-cp-filter-line { flex-wrap: wrap; gap: 2px; }
  .mmc-cp-count { width: 100%; padding: 4px 0 0; }
  .mmc-cp-categories { flex: 1 1 100%; }
  .mmc-cp-preview { flex-wrap: wrap; gap: 12px; padding: 12px; }
  .mmc-cp-preview-copy { flex-basis: 100%; }
  .mmc-cp-apply { margin-left: auto; }
  .mmc-cp-current { flex-direction: column; align-items: stretch; gap: 4px; }
  .mmc-cp-current-text { max-height: 30px; }
  .mmc-cp-custom-form { padding: 16px; }
  .mmc-cp-form-group { padding: 12px; }
}
@media (max-height: 650px) {
  .mmc-cp-dialog { overflow: auto; }
  .mmc-cp-results { flex: 1 0 180px; }
  .mmc-cp-head { padding-top: 14px; padding-bottom: 12px; }
}
@media (prefers-reduced-motion: reduce) { .mmc-cp-pill { transition: none; } }
`;
