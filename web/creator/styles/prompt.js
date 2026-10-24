export const css = `
/* A visual entry lane, not whitespace in the saved prompt. */
.mmc-prompt > .mmc-ref, .mmc-prompt > .mmc-say,
.mmc-prompt > .mmc-dialogue-incomplete, .mmc-prompt > .mmc-speaker-token { margin-left: 10px; }
.mmc-speaker-token { display: inline-block; white-space: nowrap; }
.mmc-say.mmc-dialogue {
  display: inline-block; max-width: calc(100% - 12px); box-sizing: border-box;
  vertical-align: baseline; padding: 2px 7px; margin-right: 2px;
  border: 1px solid color-mix(in srgb, var(--mmc-accent) 36%, transparent);
  border-radius: 8px; background: color-mix(in srgb, var(--mmc-accent) 12%, transparent);
  color: var(--mmc-text); white-space: pre-wrap; overflow-wrap: anywhere;
  box-decoration-break: clone; -webkit-box-decoration-break: clone;
  user-select: all; cursor: pointer;
}
.mmc-dialogue-icon { display: inline-flex; vertical-align: -.15em; margin-right: 4px; color: var(--mmc-accent); }
.mmc-dialogue-icon svg { width: .95em; height: .95em; }
.mmc-dialogue-language { color: var(--mmc-accent); font-size: .85em; margin-right: 6px; }
.mmc-dialogue-words { color: var(--mmc-text); }
.mmc-say.mmc-dialogue:hover, .mmc-say.mmc-dialogue:focus-visible {
  background: color-mix(in srgb, var(--mmc-accent) 22%, transparent); outline: none;
}
.mmc-dialogue-incomplete {
  display: inline-block; padding: 0 4px; border: 1px dashed var(--mmc-danger, #ef7777);
  border-radius: 6px; color: var(--mmc-danger, #ef7777); cursor: text;
}
`;
