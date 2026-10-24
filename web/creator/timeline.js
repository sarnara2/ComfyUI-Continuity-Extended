// The timeline modal: a global prompt, one canvas, and a strip of segments.
//
// The strip is the whole idea — cards laid out left to right, each as wide as
// its own duration, with the join between two of them saying whether the second
// cuts or continues. Everything inside a card is a whole generation, so opening
// one hands it to CreatorEditor unchanged: same rail, same @ prompt, same
// LoRAs, same routing badge. There is no reduced "segment UI" to keep in step
// with the node's, because there is only one editor.

import { api } from "../../../scripts/api.js";
import { compiledPrompt, probe, viewUrl, primeSettings, buildPlate, stillUrl } from "./api.js";
import { openRestyle } from "./restyle.js";
import { CastShelf, CAST_REFERENCE_TAKES } from "./cast.js";
import { pieceReferenceFields } from "./reference-fields.js";
import { castFamilies, keepAsMod } from "./refmod.js";
import { clearButton } from "./clear.js";
import { el, icon, svg, mountOverlay, swappable, closeOwnedPopovers, dismissable, placeNear } from "./dom.js";
import { createDisclosure } from "./disclosure.js";
import { mediaCountPills } from "./media-counts.js";
import { CreatorEditor, pickTakes, takesHelp } from "./editor.js";
import { t } from "./i18n.js";
import { openLoras, globalLoraOptions, loraBlock, loraBase, settlePins } from "./loras.js";
import { openPicker } from "./picker.js";
import { openPresetLibrary, styleCastMember } from "./presetlib.js";
import * as P from "./presets.js";
import { PromptBox, openEditorSheet } from "./prompt.js";
import { openCompiledPrompt, refineSources } from "./prompt-sections.js";
import { passDraft, clearRuntimePrompts } from "./prompt-overrides.js";
import { openSettings } from "./settings.js";
import { SoundLane } from "./soundlane.js";
import { openTrim, trimLabel } from "./trim.js";
import { openPicture, editPicture, asPick, cropLabel } from "./picture.js";
import { isVisualReference, previewable, openReferencePreview } from "./reference-preview.js";
import { cardPreviewSource, createCardPreview, pauseCardPreviews } from "./card-preview.js";
import { createTimelineScrollbars } from "./timeline-scrollbars.js";
import { readViewPrefs, patchViewPrefs } from "./viewprefs.js";
import { openAspectPopover, openResolutionPopover, openChoicePopover, facesPill, neuralPill, guideLoraPill, stepperPill,
         aspectGlyph, resolutionPillText, PILL_GLYPH } from "./pills.js";
import { refine, refineField, withRefineOwner, refineButton, chosenModel as refineModel } from "./refine.js";
import { adopted, blobIO, samplingBar, segmentSeedPill } from "./sampling.js";
import { Stage, stageSource } from "./stage.js";
import { watchSubmittedPrompts, submittedPrompt } from "./queue.js";
import { familyPill, weightsPill, loadCatalog, adoptWeights, rememberedWeights } from "./models.js";
import * as S from "./state.js";
import { timelineSummary, observeTimelineSummary } from "./timeline-summary.js";
import { confirmStoryboardChange, storyboardGuidance } from "./storyboard-notice.js";
import * as Turbo from "./turbo.js";
import * as Guide from "./guide.js";
import {
  framesForSeconds, secondsForFrames, resolveCanvas, describeRatio, isTrainedLength,
  rulesFor,
} from "./canvas.js";

/** What the seam picker calls each width, by its place in the family's grid
 *  rather than by the number of frames. The frame counts are the video VAE's
 *  and differ between families — H3's medium blend is 22 frames and LTX 2.5's
 *  is 17 — but "short, medium, long" is what the user is choosing between
 *  either way, and the seconds beside it say what it costs. Keyed on the
 *  numbers, this read "Blend" for every LTX width. */
const BLEND_NAMES = ["None", "Short", "Medium", "Long", "Extra long", "Longest"];

// Functional groups, not inferred from button classes: source and blend share
// a class but belong to the same optional group. Empty groups draw no divider.
const seamGroup = (children) => children.length
  ? el("div", { class: "mmc-tl-seam-group" }, children) : null;

/** A seam blend's width as the user reads it: seconds, one decimal. At the
 *  piece's own rate — the frames were snapped to it. */
const blendSeconds = (frames, rules) => (frames / rules.fps).toFixed(1);

/** Whether a seam's sound tail is decided by its blend rather than by the
 *  piece's setting. Mirrors `compile.compile_request`: a blended seam's sound
 *  and frames are the tail of one source and cover the same instants, so the
 *  blend sets the tail outright. */
const blendSetsTail = (segment, piece) =>
  S.continuesAudio(segment) && S.feather(segment, piece) > 1;

/** The seam's boundary-frame switch, drawn under the width list.
 *
 * A blended seam hands the run in front of it to the DiT as pinned frames; this
 * says whether the *last* of them is also named to the text encoder as a
 * picture. Off by default, because naming it says "arrive at exactly this
 * still" while the run says "carry this motion through" — but naming it is the
 * whole point of an unblended seam, so wanting both is legitimate.
 *
 * Only where the family has a second conditioning channel to say it in
 * (`seam_pin`), and only alongside a blend: at width 1 the boundary frame is
 * the seam and is always named.
 */
/** The seam restore, drawn under the width list: whether the run this seam
 *  hands over is re-drawn against the source shot's references before the next
 *  shot continues from it, and how far. Every continued shot comes out a
 *  little softer than the one it continues, and the next seam anchors on that
 *  tail, so the loss compounds down a strip (issue #41); restoring the run
 *  first breaks the chain at each seam. Off by default. Only where the family
 *  has the pass (`seam_restore`), and only between two generated shots — see
 *  the same gate in `syncTimeline`. Mirrors `compile.seam_restore_denoise`. */
function seamRestoreRow(piece, segment, index, commit) {
  if (!S.canDo(piece, "seam_restore")) return null;
  const donor = piece.segments[Number.isInteger(segment.continue_from)
    ? segment.continue_from : index - 1];
  if (S.isClip(segment) || !donor || S.isClip(donor)) return null;
  const names = ["Off", "Light", "Medium", "Strong"];
  return (close) => {
    const current = S.seamRestore(segment, piece);
    const nearest = S.SEAM_RESTORE_LEVELS.reduce((best, level) =>
      (Math.abs(level - current) < Math.abs(best - current) ? level : best));
    return el("div", { class: "mmc-twopass" }, [
      el("div", { class: "mmc-opt-label mmc-opt-col" }, [
        el("span", { text: t("Restore the frames it hands over") }),
        el("span", { class: "mmc-opt-sub",
                     text: t("Re-draws the run the seam inherits against the source "
                           + "shot's references before this shot continues from it, "
                           + "so the softening does not compound down the strip. "
                           + "One short generation per seam.") }),
      ]),
      ...S.SEAM_RESTORE_LEVELS.map((level, index) => el("button", {
        class: "mmc-opt",
        "aria-checked": level === nearest,
        onclick: () => {
          if (level > 0) segment.seam_restore = level; else delete segment.seam_restore;
          close();
          commit();
        },
      }, [
        el("span", { class: "mmc-opt-label",
                     text: level > 0 ? `${t(names[index])} · ${level}` : t(names[index]) }),
        el("span", { class: "mmc-radio" }),
      ])),
    ]);
  };
}

/** How the strip names a run of passes a card is shown: their last cards'
 *  numbers, contiguous runs as a range — "#1–3", "#1, #4". The last card,
 *  because that is the number a seam already speaks in (`from #2`) and the
 *  frame a merged run leaves behind. */
function passNumbers(sheet) {
  const numbers = sheet.map(({ pass }) => pass.end);
  const parts = [];
  for (let i = 0; i < numbers.length; i += 1) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j += 1;
    parts.push(j > i + 1 ? `#${numbers[i]}–${numbers[j]}` : numbers.slice(i, j + 1).map((n) => `#${n}`).join(", "));
    i = j;
  }
  return parts.join(", ");
}

/** The sheet as a picture: nine cells, each carrying the number of the card
 *  it will be filled from, in the order the frames will land. What the render
 *  makes is not on disk until it has rendered, so this is the one honest
 *  preview there is — and "five cells of #1, four of #2" is a thing to look at
 *  rather than read. Hue per source card, so a sheet of three shots reads as
 *  three bands. */
function sheetDiagram(sheet) {
  const cells = [];
  sheet.forEach(({ pass, count }, source) => {
    for (let n = 0; n < count; n += 1) {
      cells.push(el("span", { class: `mmc-board-cell${source % 2 ? " alt" : ""}`,
                              text: String(pass.end) }));
    }
  });
  return el("div", { class: "mmc-board", "aria-hidden": "true" }, cells);
}

/** The rows a seam popover draws under its list, in order, or null. */
function seamRows(...rows) {
  const drawn = rows.filter(Boolean);
  if (!drawn.length) return null;
  return (close) => el("div", {}, drawn.map((row) => row(close)));
}

function seamPinRow(piece, segment, width, commit) {
  if (width <= 1 || !S.canDo(piece, "seam_pin")) return null;
  return (close) => {
    const on = S.featherPin(segment, piece);
    return el("div", { class: "mmc-twopass" }, [
      el("button", {
        class: "mmc-opt",
        "aria-checked": on,
        onclick: () => {
          if (on) delete segment.feather_pin; else segment.feather_pin = true;
          close();
          commit();
        },
      }, [
        el("span", { class: "mmc-opt-label mmc-opt-col" }, [
          el("span", { text: t("Also pin the frame it lands on") }),
          el("span", { class: "mmc-opt-sub",
                       text: t("Names the boundary frame to the text encoder as well. "
                             + "Sharper arrival, less carried motion.") }),
        ]),
        el("span", { class: "mmc-radio" }),
      ]),
    ]);
  };
}

/** filename -> {width, height}, null while a probe is out. Module-level so the
 *  modal bar and the node face — two views of the same strip — measure a file
 *  once between them. Clip cards never land here: they store their own size. */
const ASPECT_SIZES = new Map();
// The source's own size; the framing is applied by whoever reads it — the
// cache is by file, and two chips can frame one file two ways.
const aspectSizeOf = (asset) => ASPECT_SIZES.get(asset.filename) || null;

/** Measure the pictures the timeline's canvas can follow: the resolved source
 *  (or segment 1's anchor under the auto rule), and with `all` every donor the
 *  aspect popover will list. Stills through an <img>, videos through the probe
 *  route; `onReady` re-renders when an answer lands. The backend re-reads the
 *  files at queue time — this is only so the bar can tell the truth early. */
function probeAspectSizes(timeline, onReady, { all = false } = {}) {
  const want = [];
  if (all) {
    for (const segment of timeline.segments) {
      if (!S.isClip(segment)) want.push(...S.aspectDonors(segment));
    }
    for (const asset of timeline.assets ?? []) {
      if (asset.kind !== "audio" && !S.soundOnly(asset)) want.push(asset);
    }
  } else {
    // Just what the bar needs: ask timelineAspectSize what it would read, by
    // reading through a recording lookup.
    S.timelineAspectSize(timeline, (asset) => {
      want.push(asset);
      return aspectSizeOf(asset);
    });
  }
  for (const asset of want) {
    if (ASPECT_SIZES.has(asset.filename)) continue;
    ASPECT_SIZES.set(asset.filename, null);
    if (asset.kind === "video") {
      probe(asset.filename).then(({ width, height }) => {
        if (!width || !height) return;
        ASPECT_SIZES.set(asset.filename, { width, height });
        onReady();
      });
      continue;
    }
    const measure = new Image();
    measure.onload = () => {
      ASPECT_SIZES.set(asset.filename, { width: measure.naturalWidth, height: measure.naturalHeight });
      onReady();
    };
    measure.src = viewUrl(asset.filename);
  }
}

const allDonors = (timeline) => [
  ...timeline.segments.flatMap((s) => (S.isClip(s) ? [] : S.aspectDonors(s))),
  ...(timeline.assets ?? []).filter((a) => a.kind !== "audio" && !S.soundOnly(a)),
];

/** The bar's geometry, source honoured — the mirror of `_timeline_canvas`. */
function timelineGeometry(timeline) {
  const rules = rulesFor(S.pieceFamily(timeline));
  const size = S.timelineAspectSize(timeline, aspectSizeOf);
  const ratio = size ? size.width / size.height
    : rules.aspects.find(([label]) => label === timeline.aspect)?.[1] ?? 16 / 9;
  const [width, height] = resolveCanvas(ratio, timeline.short_edge, rules);
  return { width, height, ratio, fromInput: !!size };
}

/** What the aspect pill's sub-line names as the ratio's source, or null when
 *  the preset rules. */
function aspectSourceLabel(timeline) {
  const source = timeline.aspect_source;
  if (source && typeof source === "object") {
    const card = Number(source.card) || 0;
    if (card && S.isClip(timeline.segments[card - 1])) {
      return t("clip · card {n}", { n: card });
    }
    if (card) return `@${source.handle} · ${t("card {n}", { n: card })}`;
    return `@${source.handle}`;
  }
  const head = timeline.segments[0];
  if (head && !S.isClip(head)
      && (S.frameAsset(head, "first_frame") || S.frameAsset(head, "last_frame"))) {
    return t("from image");
  }
  return t("from clip");
}


/**
 * @param {object} options
 * @param {object} options.timeline    mutated in place
 * @param {() => void} options.onCommit
 * @returns {Promise<void>} resolves when the modal closes
 */
export function openTimeline(options) {
  return new Promise((resolve) => new Timeline(options, resolve).mount());
}

// Card controls have a stable base. Ready media uses the shared aspect-class
// widths in CSS; only the sound lane and duration readouts represent time.
const cardWidth = () => 358;

/** What a card or a pass looks like when it is not in the next render: solid
 *  because the film already exists, perforated because it does not. Empty for
 *  everything in the render, which is every card on a strip that has never held
 *  one back. */
const holdSkin = (head, gone) => (S.isHeld(head)
  ? (S.takeOn(head) && !gone.has(S.takeOn(head).filename) ? " mmc-tl-kept" : " mmc-tl-unshot")
  : "");

/**
 * The finished prompt for the pass holding one card of a piece — what the
 * prompt box's "what the model reads" rail opens onto.
 *
 * It takes the whole piece to compile one shot: the global prompt is folded in,
 * the pool's cited references are merged in front of the card's own, the cast is
 * the piece's, and a run of merged cards is one generation with one description.
 * So this serialises the piece exactly as the node saves it and lets the
 * compiler answer, rather than assembling anything here.
 *
 * `cards` is what turns a card's index into a pass's: on a strip with a merged
 * run in it the two stop being the same number, and showing card 4 the prompt of
 * pass 4 would be showing it somebody else's shot.
 *
 * A function and not a method, because both faces need it and only one of them
 * had it. It was a method on `Timeline`, and `TimelineBody.faceBody` — the
 * lone-shot face, which is most of this node's use — handed the box a hook that
 * looked it up on itself, where it does not exist. Every open of the panel there
 * threw. Out here neither class can have it and the other not.
 *
 * @param {object} timeline  the piece, as the node holds it
 * @param {number} card      which card's pass to answer for
 * @param {number} seed      the piece's seed, the number the node will queue
 */
async function compiledFor(timeline, card, seed, changed = () => {}) {
  const source = JSON.parse(S.serializeTimeline(timeline));
  let answer = await compiledPrompt(source, seed), draftReset = false;
  if (answer.problem && source.prompt_overrides && /final-prompt draft/i.test(answer.problem)) {
    clearRuntimePrompts(timeline); delete source.prompt_overrides; changed();
    draftReset = true; answer = await compiledPrompt(source, seed);
  }
  if (answer.problem) return { problem: answer.problem };

  const index = answer.cards?.[card] ?? 0;
  const pass = answer.passes?.[index];
  if (!pass) return { problem: t("this shot is not in any pass yet") };
  if (pass.clip) {
    // `message`, not `text`: this is the panel talking, not a compiled prompt,
    // and setting it as one would give a sentence of ours a wire key it does
    // not have.
    return { note: t("supplied footage"),
             message: t("This shot is a clip you attached. Nothing is generated for it, so "
                      + "there is no prompt — it is spliced into the piece as it is.") };
  }

  const total = answer.passes.length;
  const held = Object.keys(answer.cards ?? {})
    .filter((key) => answer.cards[key] === index).length;
  // Pass count is not the workflow mode: a chain with one segment still has
  // only one compiled pass. Keep the saved/selected mode distinct from this
  // prompt's actual pass position, using the same source snapshot we compiled.
  const single = S.isSingle(source);
  const mixed = !single && total < source.segments.length;
  const note = [
    single ? t("one pass") : mixed ? t("Mixed") : t("chained"),
    !single || total > 1 ? t("pass {n} of {total}", { n: index + 1, total }) : null,
    held > 1 ? t("{n} shots merged", { n: held }) : null,
    pass.mode,
    pass.overridden ? t("replaced by hand") : null,
  ].filter(Boolean).join(" · ");
  const warnings = (pass.warnings ?? []).map((warning) => {
    const match = String(warning).match(/^The usage rule for @([A-Za-z0-9_]+) mentions @([A-Za-z0-9_]+), but @\2 is not cited in this shot\. Cite @\2 in a segment field to send that reference\.$/);
    if (match) return t("@{owner}'s rule mentions @{handle}, which is not used in this segment. To send that reference, cite @{handle} in a segment field.",
      { owner: match[1], handle: match[2] });
    const stale = String(warning).match(/^Replacement reference @([A-Za-z0-9_-]+) was captured from an earlier file attached as @([A-Za-z0-9_-]+)\. Re-capture it to identify the target in the current video; its original capture is unchanged\.$/);
    if (stale) return t("Replacement reference @{handle} was captured from an earlier file attached as @{source}. Re-capture it to identify the target in the current video; its original capture is unchanged.",
      { handle: stale[1], source: stale[2] });
    const missing = String(warning).match(/^The source video for replacement reference @([A-Za-z0-9_-]+) is not attached here\. Attach the source or re-capture the replacement target\.$/);
    if (missing) return t("The source video for replacement reference @{handle} is not attached here. Attach the source or re-capture the replacement target.",
      { handle: missing[1] });
    const trimmed = String(warning).match(/^Replacement reference @([A-Za-z0-9_-]+) is outside the current trim of @([A-Za-z0-9_-]+)\. Re-capture a frame inside the selected portion\.$/);
    if (trimmed) return t("Replacement reference @{handle} is outside the current trim of @{source}. Re-capture a frame inside the selected portion.",
      { handle: trimmed[1], source: trimmed[2] });
    return warning;
  });
  if (draftReset) warnings.unshift(t("The final-prompt draft was disabled because its reference binding changed. Review the current prompt before enabling Force edit again."));
  const cards = Object.keys(answer.cards ?? {}).filter((key) => answer.cards[key] === index)
    .map((key) => source.segments[Number(key)]?.card_id);
  const override = cards.every(Boolean) ? passDraft(timeline, source, cards, pass.base_prompt ?? pass.prompt, changed, pass.prompt_binding) : null;
  return { text: pass.prompt, tags: pass.tags ?? [], note, warnings, override, loras: pass.loras ?? [],
    scope: held > 1 ? t("Force edit affects this entire merged pass ({count} segments).", { count: held })
      : t("Force edit affects only this segment's generation."),
  };
}

class Timeline {
  constructor({ timeline, onCommit, onPromptCommit = null, edit = null, io = null, sections = null, soundSnaps = null }, resolve) {
    this.timeline = timeline;
    this.onCommit = onCommit;
    this.onPromptCommit = onPromptCommit ?? onCommit;
    this.sections = sections;
    this.soundSnaps = soundSnaps;
    this.resolve = resolve;
    // The node's sampler widgets, so a card's preset can carry the row it was
    // dialled at. The modal owns none of them — the sampler belongs to the node,
    // not to one shot — so this is lent by the body that opened the strip. Absent
    // where nothing lent it, and then a speed section simply writes nowhere.
    this.io = io ?? (() => ({ value: (_name, fallback) => fallback, set: () => {} }));
    // A card to open a window on as soon as the strip is up. Set when the strip
    // was opened *by* growing a shot into it: the new card is where the writing
    // is going, so it opens ready rather than waiting to be found.
    this.openOnMount = edit;
    // The card whose ✕ has been pressed once. Removing a card is the one
    // thing in here that cannot be undone, and its button sits where the strip
    // is scrolled and scrubbed — so it asks twice, the way the library's
    // Delete does, and the arming is forgotten the moment the pointer leaves
    // the card. Never a browser confirm(): see `presetlib.saveCurrent`.
    this.armed = null;
    // The kept takes whose files are not on disk any more. A take is a record
    // on the card and the film is a file under output/, and the two part ways
    // when the folder is cleared out (issue #42): the card still reads as kept,
    // and the render refuses it by name. Filled by `askTakes` as the probes
    // answer, once per filename for the life of the strip — a file put back
    // shows on the next open, and the refusal reads the disk either way.
    this.gone = new Set();
    this.storyboardClosed = false;
    this.asked = new Set();
    // View-only state: never part of creator_data or the generation request.
    this.audioVersions = { soundscape: 0, music: 0 };
    this.promptVersion = 0;
    this.previewMode = readViewPrefs("timeline:preview").preview !== "off";
    this.cardPreviews = new Set();
    this.cardPreviewClose = null;
    this.editors = new Map();
    this.segmentEditors = new Map();
  }

  /**
   * Ask the server which kept takes are still on disk.
   *
   * One probe per take, and only the first time the strip sees the name: the
   * answer arrives after the strip has drawn, so a take found missing redraws
   * it once. Nothing is forgotten here — a mounted-later folder or a workflow
   * opened on the wrong machine would lose real film to an automatic ✕ — the
   * chip says so and the pill beside the locks offers to forget them all.
   */
  askTakes() {
    for (const pass of S.passes(this.timeline)) {
      const take = S.takeOn(pass.segments[0]);
      if (!take || this.asked.has(take.filename)) continue;
      this.asked.add(take.filename);
      probe(take.filename).then((answer) => {
        if (!answer.missing || this.gone.has(take.filename)) return;
        this.gone.add(take.filename);
        this.render();
      });
    }
  }

  commit() {
    S.syncTimeline(this.timeline);
    this.onCommit?.();
    this.render();
  }

  refreshReferences(options) {
    this.promptBox?.refresh();
    this.renderReferenceWarnings();
    for (const editor of this.editors?.keys() ?? []) editor.refreshReferences(options);
  }

  renderReferenceWarnings() {
    if (!this.referenceWarnings) return;
    const cast = this.timeline.subjects ?? [];
    const texts = (state) => [state.prompt, state.soundscape, state.music,
      ...S.promptSectionTexts(state), ...(state.refined?.enabled !== false
        ? [state.refined?.body, ...Object.values(state.refined?.sections ?? {})] : [])];
    const missing = new Set(S.missingPromptHandles(texts(this.timeline),
      S.castAssets(this.timeline), cast));
    for (const segment of this.timeline.segments) {
      if (S.isClip(segment)) continue;
      for (const handle of S.missingPromptHandles(texts(segment),
        [...(segment.assets ?? []), ...(this.timeline.assets ?? [])], cast, segment.screens ?? [])) {
        missing.add(handle);
      }
    }
    this.referenceWarnings.hidden = !missing.size;
    this.referenceWarnings.textContent = missing.size
      ? t("Unconnected tags: {handles}. Your text is kept. Attach a reference or cast member with the same handle to reconnect automatically.",
        { handles: [...missing].map((handle) => `@${handle}`).join(", ") }) : "";
  }

  /**
   * One of the timeline's global text fields.
   *
   * Built once and never re-rendered: a full render would rebuild the element
   * under the caret and lose the selection mid-sentence, which is why `commit`
   * redraws the bar and the strip and leaves these alone.
   */
  textBox(key, { className = "mmc-tl-prompt", placeholder, rows }) {
    const box = el("textarea", {
      class: className,
      placeholder,
      ...(rows ? { rows: String(rows) } : {}),
      oninput: (event) => {
        this.audioEdited(key);
        this.timeline[key] = event.target.value;
        this.updateSectionSummaries();
        this.onCommit?.();
        this.renderBar();
        // The pool shelf reads these fields — a citation typed into the global
        // prompt flips a chip from idle to "everywhere" as it is written. The
        // shelf holds no caret, so rebuilding it here loses nothing.
        this.renderPool();
        this.renderCast();
        this.renderReferenceWarnings();
      },
    });
    box.value = this.timeline[key] ?? "";
    // The canvas is drag-to-pan territory in the graph; a textarea needs its
    // own pointer events.
    box.addEventListener("pointerdown", (event) => event.stopPropagation());
    return box;
  }

  /** The number the node will queue — what every `{day|night}` in the piece
   *  is chosen on. Zero where nothing lent a seed, which is also what the
   *  node's widget starts at. */
  pieceSeed() {
    return Number(this.io().value("seed", 0)) || 0;
  }

  /**
   * The global prompt: the same box a segment's prompt is, chips and all.
   *
   * It was a plain textarea, which made the piece's own references the one
   * place in the pack where "@" did nothing — the pool shelf could write a
   * handle into it but the box could not, and a handle typed by hand stayed
   * grey text. The pool *is* the timeline's attached assets, so `getState`
   * hands the box the timeline itself and the same `@` menu that offers a
   * segment its attachments offers this one the pool, under the pool's own
   * name.
   *
   * Picking a file the pool does not hold yet attaches it to the pool, which is
   * what the "+ Add" button does — the citation then carries it into every
   * segment, which is what a global citation has always meant. Nothing is ever
   * blocked here: the pool takes references and only references, and a start
   * or end frame is a card's business, not the piece's.
   */
  globalPromptBox() {
    const box = new PromptBox({
      getState: () => this.timeline,
      onInput: (text) => {
        this.promptVersion = (this.promptVersion ?? 0) + 1;
        this.timeline.prompt = text;
        this.updateSectionSummaries();
        this.onCommit?.();
        this.renderBar();
        // A citation typed here flips a pool chip from idle to "everywhere" as
        // it is written. The shelf holds no caret, so rebuilding it here loses
        // nothing — and `renderPool` is why this cannot be a full `render`.
        this.renderPool();
        this.renderCast();
        this.renderReferenceWarnings();
      },
      attachBlocked: () => null,
      attachedLabel: () => t("Piece references"),
      // A `{day|night}` in the standing prompt is chosen once for the whole
      // piece, on the node's seed — a standing description that changed at
      // every cut would not be standing. See `compile.varied_piece`.
      pick: () => ({ seed: this.pieceSeed(), card: "piece" }),
      getCast: () => this.timeline.subjects ?? [],
      onAttach: (row) => this.attachToPool(row),
      castFromLibrary: (member) => this.castFromLibrary(member),
      // The shelf is already in this window, a few rows down — so a name in the
      // standing prompt opens the card that is the whole reason it is there.
      // It was the one prompt box in the pack whose chips did nothing.
      onCastChip: (handle) => this.openCastMember(handle),
      // A look picked out of the `/` menu, onto this window's own piece.
      castStyle: (row) => {
        const subject = P.castIntoPiece(styleCastMember(row, 0), this.timeline);
        this.commit();
        return subject?.handle ?? null;
      },
      // The `/` menu's doors, onto this window's own piece: a style or a cast
      // member chosen here lands on the piece, which is where both belong.
      openLibrary: (scope) => openPresetLibrary({ target: this.pieceTarget(), scope })
        .then(() => { this.renderStrip(); this.renderPool(); this.renderCast(); }),
      onBrowse: () => this.addPoolAssets(),
      // No `onUncited`: a name deleted from the standing prompt leaves the
      // member on the shelf. The shelf's ✕ is what takes them out (#52).
    });
    box.frame.classList.add("mmc-tl-prompt-frame");
    box.frame.addEventListener("pointerdown", (event) => event.stopPropagation());
    return box;
  }

  /** A file picked from the `@` menu, attached to the piece's pool. The same
   *  entry `addPoolAssets` builds, minus the picker's trim and track — those
   *  are the shelf's to set afterwards, and every kind attaches as a reference
   *  because that is the only role a pool asset may have. */
  attachToPool(row) {
    const entry = {
      handle: S.nextPoolHandle(this.timeline),
      kind: row.kind,
      role: "reference",
      filename: row.path,
      ref_size: "max",
    };
    if (row.kind === "video") entry.track = S.trackFor(row);
    this.timeline.assets.push(entry);
    // Not `commit`: the caret is in the box and the chip is about to be written
    // into it, so only the shelf that gained a row is redrawn.
    this.onCommit?.();
    this.renderPool();
    this.renderCast();
    this.poolSection?.setOpen(true);
    return entry.handle;
  }

  /** The global prompt, in the state and in the box that shows it. The refiner
   *  and the pool shelf both write it from outside the box. */
  setGlobalPrompt(text) {
    this.promptVersion = (this.promptVersion ?? 0) + 1;
    this.timeline.prompt = text;
    this.promptBox?.setValue(text);
    this.updateSectionSummaries();
  }

  sectionOptions(key) {
    return {
      initialOpen: this.sections?.read(key) ?? true,
      onOpenChange: (opened) => this.sections?.write(key, opened),
    };
  }

  /** A collapsed header reads its actual input, not generated audio or a
   *  prediction about what a model will produce. Plain text only. */
  sectionPreview(key) {
    const value = String(this.timeline[key] ?? "").replace(/\s+/g, " ").trim();
    if (!value) return t(key === "prompt" ? "Empty" : "Empty · model chooses");
    if (value.toUpperCase() === "N/A") return "N/A";
    const chars = Array.from(value);
    return chars.length > 84 ? `${chars.slice(0, 84).join("")}…` : value;
  }

  updateSectionSummaries() {
    this.promptSection?.setHint("");
    this.soundscapeSection?.setHint("");
    this.musicSection?.setHint("");
  }

  /** Each plain Refine owns one input; only Refine all owns the whole piece. */
  fieldRefineButton(key, input) {
    const label = key === "prompt" ? "global_prompt"
      : key === "soundscape" ? "overall_soundscape" : "non_diegetic_music";
    const control = refineButton({
      run: (options) => this.refineTimelineField(key, input, options),
      family: () => S.pieceFamily(this.timeline),
      label: "Refine", className: "mmc-pill mmc-tl-field-refine",
      title: t("Refine only {field}. Other fields stay unchanged.", { field: label }),
    });
    control.setAttribute("data-mmc-refine-field", key);
    control.firstElementChild.setAttribute("data-mmc-refine-field", key);
    control.firstElementChild.setAttribute("aria-label", `${label}: ${t("Refine")}`);
    return control;
  }

  fieldValue(key, input) {
    return key === "prompt" ? (this.promptBox?.getValue?.() ?? this.timeline.prompt ?? "")
      : input.value;
  }

  /** Two presses clear only the global input. Confirmation never survives a
   *  changed value, replaced owner, focus loss or leaving this header. */
  globalPromptClearButton() {
    const label = t("Clear prompt");
    const warning = t("Confirm clearing content");
    const title = t("Clear only the global prompt. Other fields stay unchanged.");
    let armed = null;
    let head = null;
    const cancel = () => {
      head?.removeEventListener("pointerleave", cancel);
      head = null;
      armed = null;
      button.classList.remove("armed");
      button.textContent = label;
      button.title = title;
      button.setAttribute("aria-label", `global_prompt: ${label}`);
    };
    const button = el("button", {
      type: "button", class: "mmc-pill mmc-tl-prompt-clear", text: label,
      title, "aria-label": `global_prompt: ${label}`,
      "data-mmc-clear-field": "prompt",
      onblur: cancel,
      onpointerleave: (event) => {
        if (armed && head?.contains(event.relatedTarget)) return;
        cancel();
      },
      onkeydown: (event) => {
        if (event.repeat && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault(); event.stopPropagation(); return;
        }
      },
      onclick: async (event) => {
        event.stopPropagation();
        const input = this.promptBox;
        if (!armed) {
          if (!button.isConnected || !input?.root.isConnected || !this.modal?.isConnected) return;
          armed = { owner: this.timeline, box: input, value: this.timeline.prompt,
            owned: Object.hasOwn(this.timeline, "prompt"), visible: input.getValue(), version: this.promptVersion };
          head = button.closest(".mmc-tl-section-head");
          head?.addEventListener("pointerleave", cancel);
          button.classList.add("armed");
          button.textContent = warning;
          button.title = warning;
          button.setAttribute("aria-label", `global_prompt: ${warning}`);
          return;
        }
        const saved = armed;
        const fresh = button.isConnected && input?.root.isConnected && this.modal?.isConnected
          && this.timeline === saved.owner && input === saved.box
          && this.timeline.prompt === saved.value && input.getValue() === saved.visible
          && Object.hasOwn(this.timeline, "prompt") === saved.owned && this.promptVersion === saved.version;
        cancel();
        if (!fresh || (!saved.value && !saved.visible)) return;
        try {
          // The same live-owner lock as Refine all prevents its late reply from
          // replacing a just-cleared field. No refiner/API job runs here.
          await withRefineOwner(saved.owner, () => {
            this.setGlobalPrompt("");
            this.onPromptCommit?.();
            this.renderBar(); this.renderPool(); this.renderCast();
            const status = this.fieldRefineStatus?.prompt;
            if (status) { status.textContent = ""; status.hidden = true; }
          });
        } catch (error) {
          const status = this.fieldRefineStatus?.prompt;
          if (this.timeline === saved.owner && status?.isConnected) {
            status.textContent = String(error.message || error); status.hidden = false;
          }
        }
      },
    });
    this.cancelGlobalPromptClear = cancel;
    return button;
  }

  async refineTimelineField(key, input, options) {
    if (!["prompt", "soundscape", "music"].includes(key)
        || !input.isConnected || !this.modal?.isConnected) return;
    const owner = this.timeline;
    const value = owner[key], owned = Object.hasOwn(owner, key);
    const visible = this.fieldValue(key, input);
    const version = key === "prompt" ? this.promptVersion : this.audioVersions[key];
    const fresh = () => this.timeline === owner && this.modal?.isConnected && input.isConnected
      && input === (key === "prompt" ? this.promptBox?.root
        : key === "soundscape" ? this.soundscapeBox : this.musicBox)
      && owner[key] === value && Object.hasOwn(owner, key) === owned
      && this.fieldValue(key, input) === visible
      && (key === "prompt" ? this.promptVersion : this.audioVersions[key]) === version;
    const status = this.fieldRefineStatus?.[key];
    const say = (message) => {
      if (!status?.isConnected) return;
      status.textContent = message;
      status.hidden = !message;
    };
    say("");
    try {
      await withRefineOwner(owner, async () => {
        const result = await refineField({ kind: "timeline",
          data: JSON.parse(S.serializeTimeline(owner)) }, key, options);
        if (!fresh()) {
          say(t("The field changed while refining. No fields were changed."));
          return;
        }
        if (result?.scope !== "field" || result.target_scope !== "timeline" || result.field !== key
            || typeof result.body !== "string" || !result.body.trim()) {
          throw new Error(t("the refiner returned an invalid result for this field"));
        }
        // No takePiece/commit: neither sibling fields nor rewrite/LoRA/strip
        // metadata belong to this operation, even if a reply contains extras.
        if (key === "prompt") this.setGlobalPrompt(result.body);
        else {
          this.audioEdited(key);
          owner[key] = result.body;
          input.value = result.body;
        }
        this.updateSectionSummaries();
        this.onPromptCommit?.();
        this.renderBar();
        this.renderPool();
        this.renderCast();
        say((Array.isArray(result.problems) ? result.problems : []).map(String).join("\n"));
      });
    } catch (error) {
      if (this.timeline === owner && this.modal?.isConnected) say(String(error.message || error));
    }
  }

  audioEdited(key) {
    if (key !== "soundscape" && key !== "music") return;
    this.audioVersions ??= { soundscape: 0, music: 0 };
    this.audioVersions[key]++;
    this.clearAudioUndo(key);
  }

  clearAudioUndo(key) {
    if (key && this.audioUndo?.key !== key) return;
    clearTimeout(this.audioUndoTimer);
    if (this.audioUndoHost?.contains(document.activeElement)) this.audioUndoAnchor?.focus();
    this.audioUndo = null;
    this.audioUndoHost?.replaceChildren();
    if (this.audioUndoHost) this.audioUndoHost.hidden = true;
  }

  showAudioUndo(record, anchor) {
    if (!this.audioUndoHost) return;
    this.clearAudioUndo();
    this.audioUndo = record;
    this.audioUndoAnchor = anchor;
    this.audioUndoHost.hidden = false;
    this.audioUndoHost.replaceChildren(
      el("span", { text: t("{field} set to N/A", { field: record.label }) }),
      el("button", { type: "button", class: "mmc-pill mmc-tl-na-undo", text: t("Undo"),
        title: t("Restore only this field's previous text"), onclick: () => this.undoAudioField() }),
      el("button", { type: "button", class: "mmc-ghost mmc-tl-na-dismiss", text: "✕",
        title: t("Dismiss"), "aria-label": t("Dismiss"), onclick: () => this.clearAudioUndo() }),
    );
    const expire = () => {
      if (!this.audioUndo) return;
      // Do not remove the button while a keyboard user is reading/focusing it.
      if (this.audioUndoHost.contains(document.activeElement)) {
        this.audioUndoTimer = setTimeout(expire, 1000);
      } else this.clearAudioUndo();
    };
    this.audioUndoTimer = setTimeout(expire, 8000);
  }

  undoAudioField() {
    const saved = this.audioUndo;
    const input = saved?.key === "soundscape" ? this.soundscapeBox : this.musicBox;
    if (!saved || saved.owner !== this.timeline || this.timeline[saved.key] !== "N/A"
        || input?.value !== "N/A" || this.audioVersions[saved.key] !== saved.version
        || this.timeline.refined !== saved.refined) {
      this.clearAudioUndo();
      return false;
    }
    if (saved.owned) this.timeline[saved.key] = saved.value;
    else delete this.timeline[saved.key];
    input.value = saved.value ?? "";
    this.audioEdited(saved.key);
    this.commit();
    return true;
  }

  noAudioButton(key, input, label) {
    const title = t("Set {field} to N/A", { field: label });
    const warning = t("Entered content will be deleted and replaced with N/A");
    // Transient, field-local confirmation. Nothing is written to the piece
    // until a second press still refers to the same field contents/version.
    let armed = null;
    let confirmationHead = null;
    const cancel = () => {
      confirmationHead?.removeEventListener("pointerleave", cancel);
      confirmationHead = null;
      armed = null;
      button.classList.remove("armed");
      button.textContent = "N/A";
      button.title = title;
      button.setAttribute("aria-label", title);
    };
    const button = el("button", {
      type: "button", class: "mmc-pill mmc-tl-na", text: "N/A",
      title, "aria-label": title,
      onpointerleave: (event) => {
        // A wrapped warning can move away from the pointer on narrow headers.
        // Allow reaching it within this header; leaving the header still cancels.
        if (armed && confirmationHead?.contains(event.relatedTarget)) return;
        cancel();
      },
      onblur: cancel,
      onclick: (event) => {
        event.stopPropagation();
        if (!armed) {
          armed = { owner: this.timeline, value: this.timeline[key], input: input.value,
            owned: Object.hasOwn(this.timeline, key), version: this.audioVersions?.[key] };
          confirmationHead = button.closest(".mmc-tl-section-head");
          confirmationHead?.addEventListener("pointerleave", cancel);
          button.classList.add("armed");
          button.textContent = warning;
          button.title = warning;
          button.setAttribute("aria-label", `${label}: ${warning}`);
          return;
        }
        const fresh = button.isConnected && input.isConnected && this.timeline === armed.owner
          && this.timeline[key] === armed.value && input.value === armed.input
          && Object.hasOwn(this.timeline, key) === armed.owned
          && this.audioVersions?.[key] === armed.version;
        cancel();
        if (!fresh) return;
        if (this.timeline[key] === "N/A" && input.value === "N/A") return;
        const previous = { owner: this.timeline, key, label, value: this.timeline[key],
          owned: Object.hasOwn(this.timeline, key), refined: this.timeline.refined };
        this.audioEdited(key);
        this.timeline[key] = "N/A";
        input.value = "N/A";
        this.commit();
        this.showAudioUndo({ ...previous, refined: this.timeline.refined,
          version: this.audioVersions[key] }, event.currentTarget);
      },
    });
    return button;
  }

  mount() {
    this.promptBox = this.globalPromptBox();
    this.promptBox.setValue(this.timeline.prompt ?? "");
    this.promptSection = createDisclosure({
      ...this.sectionOptions("global_prompt"),
      // Display label only. The serialized key remains `prompt`.
      title: "global_prompt", content: this.promptBox.frame,
      summary: true, inlineActions: true, actionsBeforeHint: true,
      actions: [this.globalPromptClearButton(), this.fieldRefineButton("prompt", this.promptBox.root)],
      onBeforeCollapse: () => this.promptBox.closeMenu(),
    });
    this.promptBox.root.setAttribute("aria-labelledby", this.promptSection.titleId);

    // The two audio fields H3's own prompt format has, kept side by side and
    // shorter than the prompt: they are a few sentences each, and putting them
    // under the picture description is the order the model reads them in.
    // Held rather than built inline: the refiner writes into both, and it has to
    // put the text where the user can see it rather than only into the state
    // behind them.
    this.soundscapeBox = this.textBox("soundscape", {
      className: "mmc-tl-prompt mmc-tl-small", rows: 3,
      placeholder: t("Ambience, action sounds, breathing — everything heard in the room. "
                   + "Empty leaves it to the model; write N/A for silence."),
    });
    this.musicBox = this.textBox("music", {
      className: "mmc-tl-prompt mmc-tl-small", rows: 3,
      placeholder: t("The score only the audience hears: instruments, tempo, how it moves. "
                   + "Empty leaves it to the model; write N/A for none."),
    });

    this.soundscapeSection = createDisclosure({ ...this.sectionOptions("overall_soundscape"),
      title: t("overall_soundscape"), content: this.soundscapeBox, inlineActions: true, actionsBeforeHint: true,
      summary: true,
      actions: [this.noAudioButton("soundscape", this.soundscapeBox, t("overall_soundscape")),
        this.fieldRefineButton("soundscape", this.soundscapeBox)] });
    this.musicSection = createDisclosure({ ...this.sectionOptions("non_diegetic_music"),
      title: t("non_diegetic_music"), content: this.musicBox, inlineActions: true, actionsBeforeHint: true,
      summary: true,
      actions: [this.noAudioButton("music", this.musicBox, t("non_diegetic_music")),
        this.fieldRefineButton("music", this.musicBox)] });
    this.fieldRefineStatus = {};
    for (const [key, section] of [["prompt", this.promptSection],
      ["soundscape", this.soundscapeSection], ["music", this.musicSection]]) {
      const status = el("div", { class: "mmc-tl-field-refine-status", role: "status",
        "aria-live": "polite", hidden: true });
      this.fieldRefineStatus[key] = status;
      section.root.append(status);
    }
    this.soundscapeBox.setAttribute("aria-labelledby", this.soundscapeSection.titleId);
    this.musicBox.setAttribute("aria-labelledby", this.musicSection.titleId);
    this.audioHost = el("div", { class: "mmc-tl-audio" }, [
      this.soundscapeSection.root, this.musicSection.root,
    ]);
    this.audioUndoHost = el("div", { class: "mmc-tl-audio-undo", hidden: true,
      role: "status", "aria-live": "polite" });
    this.referenceWarnings = el("div", { class: "mmc-warn mmc-tl-reference-warnings",
      role: "status", "aria-live": "polite", hidden: true });

    this.poolHost = el("div", { class: "mmc-tl-pool" });
    this.poolSection = createDisclosure({
      ...this.sectionOptions("references"),
      actionsBeforeHint: true,
      title: t("Piece references"),
      onBeforeCollapse: () => closeOwnedPopovers(this.poolSection.body),
    });
    this.poolWarning = el("div", { class: "mmc-tl-pool-bad", role: "status" });
    // Errors stay visible even when the reference body is folded.
    this.poolHost.append(this.poolSection.root, this.poolWarning);
    this.castHost = el("div", { class: "mmc-tl-cast" });
    this.barHost = el("div", { class: "mmc-tl-bar" });
    this.summaryHost = el("div", { class: "mmc-tl-summary-row" });
    this.loraHost = el("div", { class: "mmc-tl-loras" });
    this.navigationHost = el("div", { class: "mmc-tl-navigation" });
    this.stripHost = el("div", { class: "mmc-tl-strip" });
    // Cards scroll the Timeline vertically. The 32px band above the horizontal
    // scrollbar is the intentional, forgiving place to wheel along the strip.
    this.stripHost.addEventListener("wheel", (event) => {
      if (event.ctrlKey || (!event.deltaX && !event.deltaY)) return;
      const body = this.stripHost.closest(".mmc-tl-body");
      if (!body) return;
      const bounds = this.stripHost.getBoundingClientRect();
      const sideways = event.clientY >= bounds.bottom - 32
        && this.stripHost.scrollWidth > this.stripHost.clientWidth + 1;
      const unit = event.deltaMode === 1 ? 16
        : event.deltaMode === 2 ? (sideways ? this.stripHost.clientWidth : body.clientHeight) : 1;
      event.preventDefault();
      if (sideways) {
        this.stripHost.scrollLeft += (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
      } else body.scrollTop += event.deltaY * unit;
    }, { passive: false });
    // Under the strip, because it is under the strip in what it describes: the
    // cards are what the piece is made of and the lane is what it is cut to.
    // It brings its own axis — see `sound.js` for why it cannot borrow the
    // strip's.
    this.sound = new SoundLane({
      read: () => this.timeline,
      sectionOptions: this.sectionOptions("sound"),
      snaps: this.soundSnaps,
      onCommit: () => this.commit(),
      flash: (message) => this.flash?.(message),
    });

    this.modal = el("div", { class: "mmc-modal mmc-tl-modal" }, [
      el("div", { class: "mmc-modal-head mmc-tl-header" }, [
        el("span", { class: "mmc-tab mmc-tl-heading", "aria-selected": "true", text: t("Timeline") }),
        el("span", { class: "mmc-tl-header-divider", "aria-hidden": "true" }),
        this.barHost,
        el("button", { class: "mmc-close", text: "✕", title: t("Close"), onclick: () => this.close() }),
      ]),
      el("div", { class: "mmc-tl-body" }, [
        this.promptSection.root, this.audioHost, this.audioUndoHost, this.referenceWarnings, this.poolHost, this.castHost,
        this.summaryHost, this.loraHost, this.navigationHost, this.stripHost, this.sound.host,
      ]),
    ]);

    this.overlay = el("div", {
      class: "mmc-overlay mmc-tl-overlay",
      onpointerdown: (event) => { if (event.target === this.overlay) this.close(); },
    }, [this.modal]);

    this.unmount = mountOverlay(this.overlay, () => this.onEscape());
    this.scrollbars = createTimelineScrollbars(this.modal.querySelector(":scope > .mmc-tl-body"), this.stripHost);
    this.render();
    if (this.openOnMount != null && this.timeline.segments[this.openOnMount]) {
      this.edit(this.openOnMount);
      this.openOnMount = null;
    }
  }

  close() {
    this.compiledView?.close();
    this.storyboardClosed = true;
    this.disposePoolNamePress();
    for (const close of this.editors?.values() ?? []) close();
    this.editors?.clear();
    for (const editor of this.segmentEditors?.values() ?? []) editor.destroy();
    this.segmentEditors?.clear();
    closeOwnedPopovers(this.modal);
    this.storyboardNoticeClose?.();
    this.storyboardNoticeClose = null;
    this.storyboardNoticeCurrent = null;
    this.cancelGlobalPromptClear?.();
    this.summaryFit?.disconnect();
    this.poolFieldFit?.disconnect();
    if (this.poolFitFrame != null) cancelAnimationFrame(this.poolFitFrame);
    this.poolFitFrame = null;
    this.sound?.destroy?.();
    this.scrollbars?.destroy();
    this.scrollbars = null;
    this.clearCardPreviews();
    this.clearAudioUndo();
    this.jumpMenu?.close();
    clearTimeout(this.jumpTimer);
    this.jumpTarget?.classList.remove("mmc-tl-jump-target");
    this.unmount();
    this.resolve();
  }

  onEscape() {
    // The document capture listener runs before Sound's local tool listener.
    // Leave Zoom mode first; an ordinary second Escape still closes Timeline.
    if (this.sound?.dismissZoomTool?.()) return;
    this.close();
  }

  // ---- render ---------------------------------------------------------------

  render() {
    if (this.storyboardNoticeCurrent && !this.storyboardNoticeCurrent()) {
      this.storyboardNoticeClose?.();
      this.storyboardNoticeClose = null;
      this.storyboardNoticeCurrent = null;
    }
    this.updateSectionSummaries();
    if (this.audioUndo && (this.audioUndo.owner !== this.timeline
        || this.timeline[this.audioUndo.key] !== "N/A"
        || this.timeline.refined !== this.audioUndo.refined)) this.clearAudioUndo();
    // The global prompt is the same field either way but lands in a different
    // place: in front of every segment when chained, at the head of Shot 1's
    // description when not — which is where the guide puts the style and the
    // opening composition, and is worth saying because it changes how to write it.
    // A contenteditable has no `placeholder`; the box draws `data-placeholder`
    // itself while it is empty.
    this.promptBox.root.setAttribute("data-placeholder", S.isSingle(this.timeline)
      ? t("The whole piece: setting, look, who is in it. Opens Shot 1's description, so write it as the start of one.")
      : t("The whole piece: setting, look, who is in it. Added in front of every segment's own prompt."));
    this.renderPool();
    this.renderCast();
    this.renderBar();
    this.renderLoras();
    this.renderStrip();
    // Asked of the family rather than assumed: fixing a supplied track needs a
    // maskable audio stream in the latent, which is an architectural fact and
    // not something every family a later version adds will have.
    this.sound.host.hidden = !S.familyOf(this.timeline).capabilities?.audio?.supplied;
    if (!this.sound.host.hidden) this.sound.render();
    this.refreshReferences();
  }

  /**
   * The global stack is edited inside the timeline's unified LoRA manager.
   * Hiding the inline rail gives the timeline room without dropping the existing
   * family-pin initialization or changing the LoRA pill's count.
   */
  renderLoras() {
    // Keep the existing pin initialization even though the inline rail is hidden.
    this.timeline.loras ??= [];
    if (settlePins(this.timeline, S.pieceFamily(this.timeline), () => this.commit())) this.onCommit?.();
    this.loraHost.replaceChildren();
    this.loraHost.hidden = true;
  }

  /** Try another file in this LoRA's slot. See `state.replaceLora`. */
  async swapLora(entry) {
    await openLoras({
      state: this.timeline,
      family: S.pieceFamily(this.timeline),
      targets: S.timelineCheckpoints(this.timeline),
      scope: "piece",
      swapping: entry.name,
      onChange: () => this.commit(),
    });
    this.render();
  }

  /**
   * The piece's reference pool: files attached to the timeline itself.
   *
   * A pool asset is cited by its @handle from any segment's text, and the
   * citation is what attaches it — the file rides into exactly the segments
   * that write the handle, and no other. That is the whole point: a character
   * sheet is attached once here instead of once per segment it appears in,
   * and every citing segment gets the same reference under the same handle.
   */
  renderPool() {
    this.watchPoolNamePress();
    const assets = S.sortByHandle(this.timeline.assets ?? []);
    // The shelf is references, so on a family that reads none there is nothing
    // to offer — the same answer the rails give, for the same reason. The head
    // and any chips already on it stay: a piece carried over from a family that
    // did read them has files here to take back off, and a shelf that vanished
    // with them still on it would leave a queue-time refusal about references
    // nothing on screen mentions. See `S.overflow`, which says exactly that.
    const takesRefs = S.takesReferences(this.timeline);
    this.poolHost.hidden = !takesRefs && !assets.length;
    if (this.poolHost.hidden) return;
    this.poolSection.setText(t("Piece references"));
    this.poolSection.setHintNodes(mediaCountPills(assets));
    this.poolSection.root.classList.toggle("mmc-tl-section-warning", !takesRefs);
    this.poolAdd ??= el("button", {
          type: "button",
          class: "mmc-ghost mmc-tl-pool-add",
          title: t("Attach a reference to the whole piece — a character sheet, a location, "
               + "a voice. Cite it with its @handle in every segment where it appears."),
          onclick: () => this.addPoolAssets(),
        }, [el("span", { text: "+" }), el("span", { text: t("Add") })]);
    // Mount action once too: a background refresh must not steal its focus.
    this.poolClear ??= clearButton({ written: true, compact: true,
      what: t("Clear all piece references. Prompt text stays; missing handles show a warning until reconnected."),
      getOwner: () => this.timeline, getValue: () => S.serializeTimeline(this.timeline),
      run: () => {
        const handles = (this.timeline.assets ?? []).map((asset) => asset.handle);
        closeOwnedPopovers(this.poolSection.body);
        this.timeline.assets = [];
        for (const handle of handles) S.releaseFromPiece(this.timeline, handle);
        this.commit();
      },
    });
    this.poolClear.disabled = !assets.length;
    if (this.poolClear.disabled) this.poolClear.cancelClear?.();
    if (!this.poolClear.isConnected || (takesRefs && !this.poolAdd.isConnected)) {
      this.poolSection.setActions(...(takesRefs ? [this.poolAdd] : []), this.poolClear);
    }
    const warnings = [
      !takesRefs ? t("{family} reads no attached references — detach these, or put the piece "
        + "back on a model that reads them.", { family: S.familyOf(this.timeline).label }) : "",
      this.poolError || "",
      ...S.staleReplacementReferences(assets).map(asset => t(
        "Replacement reference @{handle} was captured from an earlier file. Re-capture the target in the current video; the original capture is unchanged.",
        { handle: asset.handle })),
    ].filter(Boolean);
    this.poolWarning.textContent = warnings.join("\n");
    this.poolWarning.hidden = !warnings.length;
    this.poolRows ??= new Map();
    for (const asset of this.poolRows.keys()) if (!assets.includes(asset)) this.poolRows.delete(asset);
    if (!this.poolRowsHost) {
      this.poolRowsHost = el("div", { class: "mmc-tl-pool-references" });
      let width = 0;
      this.poolFieldFit = new ResizeObserver(([entry]) => {
        if (!entry || !this.poolRowsHost.isConnected) return;
        const next = entry.contentRect.width;
        if (next === width) return;
        width = next;
        if (next <= 0 || this.poolFitFrame != null) return;
        // Refit after the grid has changed columns, without replacing fields
        // or touching their values/carets. Height-only changes (including a
        // user's manual resize) must not refit or feed back into this observer.
        this.poolFitFrame = requestAnimationFrame(() => {
          this.poolFitFrame = null;
          if (!this.poolRowsHost.isConnected || !this.poolRowsHost.clientWidth) return;
          for (const row of this.poolRowsHost.children) row.referenceFields.refresh();
        });
      });
      this.poolFieldFit.observe(this.poolRowsHost);
    }
    const rows = assets.map((asset) => {
      let row = this.poolRows.get(asset);
      if (!row) {
        const header = el("div", { class: "mmc-assets mmc-piece-reference-head" });
        const fields = pieceReferenceFields(asset, {
          available: () => this.poolSection.root.isConnected && (this.timeline.assets ?? []).includes(asset),
          onChange: () => { this.updatePoolReferenceNotes(row, asset); this.onCommit?.(); },
          restoreFocus: (namespace, kind) => {
            if (!row.isConnected || !this.poolSection.isOpen()) return this.poolSection.toggle.focus();
            const target = row.referenceExtra.isOpen() ? row.querySelector(
              `.mmc-cast-${kind === "help" ? "help" : "preset-label"}[data-field="${namespace}"]`) : row.referenceExtra.toggle;
            target?.focus();
          },
        });
        const copy = el("span", { class: "mmc-piece-reference-cast-copy" });
        const actions = el("div", { class: "mmc-piece-reference-cast-actions" });
        const notice = el("div", { class: "mmc-piece-reference-cast-note", hidden: true }, [copy, actions]);
        const extra = createDisclosure({
          title: t("File-specific settings"), content: fields, initialOpen: false,
          onBeforeCollapse: () => closeOwnedPopovers(fields),
          onOpenChange: (opened) => { if (opened) fields.refresh(); },
        });
        extra.root.classList.add("mmc-piece-reference-extra");
        extra.toggle.title = t("Additional instructions for this file only. Shared cast instructions stay in the cast tab.");
        row = el("div", { class: "mmc-piece-reference-row" }, [header, notice, extra.root]);
        row.referenceHeader = header;
        row.referenceFields = fields;
        row.referenceNotice = notice;
        row.referenceCopy = copy;
        row.referenceActions = actions;
        row.referenceButtons = new Map();
        row.referenceExtra = extra;
        row.referenceExtraCount = el("span", { class: "mmc-piece-reference-extra-count",
          text: t("Additional settings present"),
          title: t("Open file-specific settings to edit existing instructions; they still apply while folded.") });
        this.poolRows.set(asset, row);
      }
      row.dataset.referenceHandle = asset.handle;
      this.updatePoolReferenceNotes(row, asset);
      // File readouts may change after probing; text controls stay mounted.
      if (!row.referenceHeader.contains(document.activeElement)) row.referenceHeader.replaceChildren(this.poolChip(asset));
      return row;
    });
    const current = [...this.poolRowsHost.children];
    if (current.length !== rows.length || current.some((row, index) => row !== rows[index])) {
      // Insert only the rows whose order actually changed. Moving every child
      // through replaceChildren would discard a focused textarea's caret.
      for (const row of [...this.poolRowsHost.children]) if (!rows.includes(row)) row.remove();
      rows.forEach((row, index) => {
        if (this.poolRowsHost.children[index] !== row) this.poolRowsHost.insertBefore(row, this.poolRowsHost.children[index] ?? null);
      });
    }
    if (this.poolRowsHost.parentElement !== this.poolSection.body) this.poolSection.body.replaceChildren(this.poolRowsHost);
    for (const row of rows) row.referenceFields.refresh();
  }

  updatePoolReferenceNotes(row, asset) {
    const owners = S.assetOwners(this.timeline, asset);
    const linked = owners.length > 0;
    const extra = row.referenceExtra;
    row.referenceNotice.hidden = !linked;
    extra.head.hidden = !linked;
    extra.root.classList.toggle("mmc-piece-reference-extra-linked", linked);
    // Linking must not interrupt an edit already in progress. Unlinking
    // restores the ordinary file fields without replacing their DOM nodes.
    if (row.referenceLinked !== linked) {
      extra.setOpen(!linked || row.referenceFields.contains(document.activeElement));
      if (!linked && row.referenceNotice.contains(document.activeElement)) {
        row.referenceFields.querySelector("textarea")?.focus();
      }
      row.referenceLinked = linked;
    }
    const noted = ["description", "usage_rules"].some(key => String(asset[key] ?? "").trim());
    const panelNoted = (asset.panels ?? []).some(part =>
      ["description", "usage_rules"].some(key => String(part[key] ?? "").trim()));
    extra.setText(t("File-specific settings"));
    extra.toggle.title = t("Additional instructions for this file only. Shared cast instructions stay in the cast tab.");
    row.referenceExtraCount.textContent = t(!noted && panelNoted ? "Sheet panel settings present" : "Additional settings present");
    row.referenceExtraCount.title = t(!noted && panelNoted
      ? "These instructions belong to individual sheet panels. Edit them in the sheet editor; they still apply while folded."
      : "Open file-specific settings to edit existing instructions; they still apply while folded.");
    if (noted || panelNoted) extra.setHintNodes(row.referenceExtraCount);
    else extra.setHint("");
    row.referenceCopy.textContent = t("This reference is linked to {who}. Set shared descriptions and usage rules in the cast tab.",
      { who: owners.map(subject => `@${subject.handle}`).join(", ") });
    let lostFocus = false;
    for (const [subject, button] of row.referenceButtons) {
      if (!owners.includes(subject)) {
        lostFocus ||= button === document.activeElement;
        button.remove(); row.referenceButtons.delete(subject);
      }
    }
    for (const subject of owners) {
      let button = row.referenceButtons.get(subject);
      if (!button) {
        button = el("button", {
          type: "button", class: "mmc-pill mmc-piece-reference-cast-go",
          onclick: () => {
            if (!row.isConnected || !(this.timeline.assets ?? []).includes(asset)
                || !S.assetOwners(this.timeline, asset).includes(subject)) return;
            this.openCastMember(subject.handle, { forceOpen: true });
          },
        });
        row.referenceButtons.set(subject, button);
        row.referenceActions.append(button);
      }
      button.textContent = owners.length === 1 ? t("Go to cast") : t("Go to @{handle}", { handle: subject.handle });
      button.title = t("Go to @{handle}", { handle: subject.handle });
      button.dataset.subjectHandle = subject.handle;
    }
    owners.forEach((subject, index) => {
      const button = row.referenceButtons.get(subject);
      if (row.referenceActions.children[index] !== button) {
        row.referenceActions.insertBefore(button, row.referenceActions.children[index] ?? null);
      }
    });
    if (lostFocus && row.isConnected) row.referenceButtons.get(owners[0])?.focus();
  }

  /** Keep a restored name from moving a pool button under an active press. */
  watchPoolNamePress() {
    if (this.poolNamePressRoot === this.poolHost) return;
    this.disposePoolNamePress();
    this.pendingPoolNames = new Set();
    this.poolNamePressEnd = (event) => {
      if (event && event.pointerId !== this.poolNamePress) return;
      this.poolNamePress = null;
      document.removeEventListener("pointerup", this.poolNamePressEnd, true);
      document.removeEventListener("pointercancel", this.poolNamePressEnd, true);
      window.removeEventListener("blur", this.poolNamePressBlur);
      clearTimeout(this.poolNameTimer);
      this.poolNameTimer = setTimeout(() => {
        this.poolNameTimer = null;
        if (this.storyboardClosed) return;
        const subjects = [...this.pendingPoolNames];
        this.pendingPoolNames.clear();
        for (const subject of subjects) this.updatePoolNames(subject);
      }, 0);
    };
    this.poolNamePressBlur = () => this.poolNamePressEnd();
    this.poolNamePressDown = (event) => {
      if (this.storyboardClosed || event.button !== 0
          || !event.target.closest?.("[data-reference-handle]")) return;
      this.poolNamePress = event.pointerId;
      document.addEventListener("pointerup", this.poolNamePressEnd, true);
      document.addEventListener("pointercancel", this.poolNamePressEnd, true);
      window.addEventListener("blur", this.poolNamePressBlur);
    };
    this.poolNamePressRoot = this.poolHost;
    this.poolNamePressRoot.addEventListener("pointerdown", this.poolNamePressDown, true);
  }

  disposePoolNamePress() {
    this.poolNamePressRoot?.removeEventListener("pointerdown", this.poolNamePressDown, true);
    document.removeEventListener("pointerup", this.poolNamePressEnd, true);
    document.removeEventListener("pointercancel", this.poolNamePressEnd, true);
    window.removeEventListener("blur", this.poolNamePressBlur);
    clearTimeout(this.poolNameTimer);
    this.poolNamePressRoot = null;
    this.poolNamePress = null;
    this.poolNameTimer = null;
    this.pendingPoolNames?.clear();
  }

  updatePoolNames(subject) {
    if (this.poolNamePress != null || this.poolNameTimer != null) {
      // The linked notice and warnings can change row height too. Defer the
      // whole passive repaint until after click; the actual name is saved now.
      this.pendingPoolNames.add(subject);
      return;
    }
    for (const [asset, row] of this.poolRows ?? []) {
      if (!S.assetOwners(this.timeline, asset).includes(subject)) continue;
      this.updatePoolReferenceNotes(row, asset);
      // Keep file buttons mounted: restoring an empty name on blur can be
      // part of the pointer press that is about to click one of them.
      const current = row.referenceHeader.firstElementChild;
      if (!current) continue;
      const next = this.poolChip(asset);
      current.className = next.className;
      current.title = next.title;
      current.querySelector(".mmc-tl-pool-owners")?.replaceChildren(
        ...next.querySelector(".mmc-tl-pool-owners").childNodes);
      const remove = current.querySelector(".mmc-asset-x");
      if (remove) remove.title = next.querySelector(".mmc-asset-x").title;
    }
    this.refreshReferences({ namesOnly: true });
  }

  /**
   * One reference on the piece's shelf.
   *
   * Two kinds of entry share this row. Most are files somebody attached to the
   * piece, and the readout is about the citation that carries them into a shot.
   * The rest belong to the cast: growing the strip past one card moves a
   * member's own pictures into the pool (`state.promoteCastFiles`), because a
   * lone shot keeps them on its own row and card 2 cannot see them there.
   *
   * Those were being drawn as ordinary references — new handles, "cited nowhere
   * yet", a ✕ that would take a member's face out from under them — appearing
   * the moment a segment was duplicated, directly above a shelf showing the
   * same two photographs. Read as copies, and reported as copies. So they are
   * marked as the cast's and answer for themselves in the cast's terms: whose
   * they are, and which shots write that name. Marked rather than hidden, for
   * the reason the editor's own row marks them — a shelf drawing only some of
   * what is attached is not an answer to "what does this piece carry".
   */
  poolChip(asset) {
    // Whose file this is, if it is anybody's. Their citations are what carries
    // it into a shot — the handle here is an address, not the name anyone
    // writes — so the whole readout below branches on this.
    const owners = S.assetOwners(this.timeline, asset);
    const everywhere = S.poolCitedGlobally(this.timeline, asset);
    const cited = S.poolCitations(this.timeline, asset);
    // Uncited, but the same file is attached to a card under its own handle:
    // the reference *is* in use, one level down, and saying "cited nowhere yet"
    // about it is technically true and useless. Say which card and which handle
    // instead — that is the whole of what happened, and it is enough to decide
    // whether to cite the piece copy or drop it. See `S.poolDoubles`.
    const doubles = owners.length || everywhere || cited.length
      ? [] : S.poolDoubles(this.timeline, asset);
    // A cast file is in the shots that name its owner — or the file itself:
    // `@ref-1` written into a shot that never says `@vera` still carries it,
    // and `cited` already counts both routes. Read in the shelf's own words,
    // since that is the shelf's own question (#91).
    const ownerShots = owners.length
      ? (everywhere || owners.some((subject) => S.subjectCitedGlobally(this.timeline, subject)))
        ? [{ cited: true, text: t("in every shot") }]
        : [{ cited: cited.length > 0,
             text: cited.length
               ? t(cited.length === 1 ? "in shot {list}" : "in shots {list}",
                   { list: cited.join(", ") })
               : t("in no shot yet") }]
      : [];
    const where = owners.length
      ? ownerShots.map((shot) => shot.text).join(" · ")
      : everywhere
        ? t("everywhere — cited in the global prompt")
        : cited.length
          ? t(cited.length === 1 ? "in segment {list}" : "in segments {list}", { list: cited.join(", ") })
          : doubles.length
            ? t(doubles.length === 1
                  ? "not cited — attached to segment {list} instead"
                  : "not cited — attached to segments {list} instead",
                { list: doubles.map((d) => `${d.segment} (@${d.handle})`).join(", ") })
            : t("cited nowhere yet");
    const thumb = asset.kind === "image"
      ? el("img", { class: "mmc-asset-thumb", alt: "",
                    src: viewUrl(asset.filename, { preview: true, crop: S.thumbCrop(asset) }) })
      : el("span", { class: "mmc-asset-thumb", text: asset.kind === "video" ? "▶" : "♪" });
    if (isVisualReference(asset)) {
      previewable(thumb, {
        title: t("Double-click to preview @{handle}. Click the handle to replace its file.",
                 { handle: asset.handle }),
        open: (returnFocus) => openReferencePreview([asset], { returnFocus }),
      });
    } else {
      swappable(thumb, {
        title: t("Swap the file behind @{handle} — the handle stays, so every citation still fits.",
                 { handle: asset.handle }),
        onclick: () => this.replacePoolAsset(asset),
      });
    }
    return el("div", {
      // Not idle where a double exists: the file is being used, and dimming the
      // chip that says so would contradict its own text. A cast file is idle on
      // its owner's terms — nobody names them, so it rides into nothing.
      // The rule down the left edge is painted from the row's own hue, which is
      // the one the @ref handle beside it already wears.
      class: `mmc-asset${owners.length ? ` mmc-asset-cast mmc-tag-${S.tagIndex(asset.handle)}` : ""}${
        (owners.length
          ? ownerShots.some((shot) => shot.cited)
          : everywhere || cited.length || doubles.length) ? "" : " idle"}`,
      title: owners.length
        ? t("{file} — {who}'s reference, kept with the piece because a strip of more than "
          + "one segment is the only place every segment can see it. It rides into the "
          + "segments that write their name; removing it here takes it away from them.",
            { file: asset.filename, who: owners.map((s) => `@${s.handle}`).join(", ") })
        : everywhere || cited.length
        ? t("{file} — {where}", { file: asset.filename, where })
        : doubles.length
          ? t("{file} — this same file is attached to segment {list} under its own handle, "
            + "so that copy is the one being used and @{handle} rides into nothing. "
            + "Cite @{handle} there and remove the card's copy to keep one reference "
            + "for the whole piece.",
              { file: asset.filename, handle: asset.handle,
                list: doubles.map((d) => `${d.segment} (@${d.handle})`).join(", ") })
          : t("{file} — no segment cites @{handle} yet, so it rides into none of them.",
              { file: asset.filename, handle: asset.handle }),
    }, [
      el("div", { class: "mmc-tl-pool-group mmc-tl-pool-identity" }, [thumb, el("button", {
        type: "button",
        class: `mmc-asset-handle mmc-tl-pool-cite mmc-tag-${S.tagIndex(asset.handle)}`,
        text: `@${asset.handle}`,
        title: t("Swap the file behind @{handle} — the handle stays, so every citation still fits.",
                 { handle: asset.handle }),
        onclick: () => this.replacePoolAsset(asset),
      })]),
      // Whose it is, in their own hue — the one the shelf below draws them in,
      // and the one their name wears mid-sentence. The chip is then readable as
      // what it is at a glance: not a second reference, a member's picture.
      el("div", { class: "mmc-tl-pool-group mmc-tl-pool-owners" }, [...owners.map((subject) => el("span", {
        class: `mmc-asset-handle mmc-tag-${S.tagIndex(subject.handle || "x")}`,
        text: `@${subject.handle}`,
      })),
      el("span", { class: "mmc-tl-pool-where", text: where })]),
      // What a plate is, in the one number that says it — and the pen where
      // the picture can be edited at all: the door itself, right on the chip,
      // same as the card's.
      el("div", { class: "mmc-tl-pool-group" }, [...(S.isPlate(asset) && asset.panels.length > 1
        ? [el("span", { class: "mmc-asset-panels",
                        text: t("{count} panels", { count: asset.panels.length }) })]
        : S.croppable(asset)
          ? [(() => {
              const said = [asset.panels?.[0]?.cut ? t("cut out") : "", cropLabel(S.cropOf(asset))]
                .filter(Boolean);
              return el("button", {
                class: `mmc-pl-cut mmc-asset-scissors mmc-asset-edit${said.length ? " on" : ""}`,
                "aria-pressed": String(said.length > 0),
                title: said.length
                  ? t("{framing} — press to change the framing", { framing: said.join(" · ") })
                  : t("Used whole — press to crop, turn or mirror it, or cut the subject out"),
                onclick: () => this.editPoolPicture(asset),
              }, [icon("edit", 12)]);
            })()]
          : []),
      // Building the sheet again, from here. The pool is where a shared
      // reference is set at all — a citation of it in a segment has nothing to
      // open — so without this a sheet attached to the piece could never be
      // added to.
      ...(asset.kind === "image" && S.plateSpec(this.timeline)
        ? [el("button", {
            class: "mmc-ghost",
            style: { fontSize: "11px" },
            title: t("Choose the pictures on this sheet again — add one, take one off, "
                   + "rearrange them, or change which are cut out of their backgrounds. "
                   + "The sheet is laid out again as you go."),
            text: S.isPlate(asset) && asset.panels.length > 1
              ? t("Edit sheet…") : t("Combine…"),
            onclick: () => this.editPoolSheet(asset),
          })]
        : [])]),
      // What of the file is the reference — a character sheet is usually the
      // person, not the sheet's background, a clip is as often borrowed for its
      // camera as for what it shows, and a voice is borrowed for its timbre and
      // not its words. The editor's own chip, same menu.
      el("div", { class: "mmc-tl-pool-group" }, [...(S.takeable(asset) && !(S.isPlate(asset) && asset.panels.length > 1)
        ? [el("button", {
        class: "mmc-ghost",
        style: { fontSize: "11px" },
        title: t(takesHelp(asset)),
        text: t(S.takeWord(S.takes(asset))),
        onclick: (event) => pickTakes(event.currentTarget, asset, () => this.commit()),
      })] : []),
      // What the reference is encoded at. The pool's copy is the only place a
      // shared reference can be set, so without it every citation of it is
      // stuck on the kind's default — see the editor's own button.
      ...(S.sizeable(asset) ? [el("button", {
        class: "mmc-ghost",
        style: { fontSize: "11px" },
        title: asset.kind === "video"
          ? t("match: scale to the generation's pixel area. max: core's 768 reference canvas — "
            + "more detail, and much the slower of the two. A video's reference tokens are its "
            + "whole grid once per latent frame, so at full length one clip is about as long as "
            + "the target video itself, and all of it rides through every sampling step.")
          : t("match: scale to the generation's pixel area. max: 2048 short edge — better identity, "
            + "several times slower, because reference tokens ride through every sampling step."),
        text: t(S.refSize(asset)),
        onclick: (event) => {
          asset.ref_size = S.refSize(asset) === "max" ? "match" : "max";
          event.currentTarget.textContent = t(S.refSize(asset));
          this.commit();
        },
      })] : [])]),
      el("div", { class: "mmc-tl-pool-group" }, [el("button", {
        class: "mmc-asset-x", text: "✕",
        title: owners.length
          ? t("Remove @{handle} — {who} is built out of this file and loses it. Take them "
            + "off the cast shelf instead to remove both at once.",
              { handle: asset.handle, who: owners.map((s) => `@${s.handle}`).join(", ") })
          : cited.length
            ? t("Remove @{handle} — segments {list} still cite it. Their text is kept; "
              + "reconnect the same handle to clear the warning.", { handle: asset.handle, list: cited.join(", ") })
            : t("Remove @{handle}", { handle: asset.handle }),
        onclick: () => {
          this.timeline.assets = (this.timeline.assets ?? []).filter((a) => a !== asset);
          // The tooltip promised the member loses it, so they do — a claim
          // left standing was a `?` tile and a refusal to queue.
          S.releaseFromPiece(this.timeline, asset.handle);
          this.commit();
        },
      })]),
    ]);
  }

  /**
   * The cast, in the window: the piece's, built out of the piece's pool.
   *
   * The shelf itself is `cast.js` and is the same one the node face mounts —
   * one node, one cast, one way of editing it. What is the window's is only
   * what it can answer that the shelf cannot: which files there are to build
   * somebody out of, and which cards on the strip write their name.
   *
   * The pool *and* a lone shot's own row, because that is where a piece of one
   * shot keeps its cast's pictures — see `S.castAssets`. Reading the pool alone
   * drew every one of them as a member built out of a file "not attached here",
   * on a piece where the face beside this window shows their photographs.
   */
  /**
   * A name clicked in the standing prompt: open that member's card on the shelf
   * below, and put it where the eye already is.
   *
   * The window is a tall scroller — the prompt at the top, the shelf under the
   * pool, the strip under that — so opening a card three screens down and
   * saying nothing would read as a click that did nothing. The shelf is already
   * mounted here (`renderCast` mounts it once), so this only has to open and
   * scroll.
   */
  openCastMember(handle, { forceOpen = false } = {}) {
    this.renderCast();
    // Pressing the name of whoever is already open shuts them — the press is
    // its own undo. Nothing to scroll to in that case: what was being pointed
    // at has just gone.
    if (this.castShelf?.openMember(handle, { forceOpen: forceOpen || !this.castShelf.isExpanded() }) !== "opened") return;
    this.castShelf.reveal();
    const target = forceOpen ? this.castShelf.root.querySelector(".mmc-cast-card.open") : this.castHost;
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (forceOpen) target?.querySelector(".mmc-cast-desc")?.focus({ preventScroll: true });
  }

  renderCast() {
    this.castShelf ??= new CastShelf({
      disclosure: true,
      actionsBeforeHint: true,
      ...this.sectionOptions("cast"),
      getCast: () => this.timeline.subjects ?? [],
      setCast: (list) => { this.timeline.subjects = list; },
      family: () => S.pieceFamily(this.timeline),
      getAssets: () => S.castAssets(this.timeline),
      addAsset: (subject, options) => this.attachOneCastAsset(subject, options),
      addReplacementAsset: async (saved, options = {}) => {
        if (options.isCurrent?.() === false) return null;
        const entry = this.poolEntry(saved);
        this.timeline.assets.push(entry);
        this.commit();
        return entry;
      },
      whereCited: (subject) => {
        if (S.subjectCitedGlobally(this.timeline, subject)) {
          return { cited: true, text: t("in every shot") };
        }
        const shots = S.subjectCitations(this.timeline, subject);
        return {
          cited: shots.length > 0,
          text: shots.length
            ? t(shots.length === 1 ? "in shot {list}" : "in shots {list}",
                { list: shots.join(", ") })
            : "",
        };
      },
      // A cast citation in the global prompt applies to every shot.
      cite: (subject) => this.citeName(subject.handle),
      // The roster, both ways — see the same pair on the node face. Casting
      // somebody out of the library attaches their files to the pool, which is
      // the shelf this window is already drawing.
      keep: (subject, assets) => P.keepSubject(subject, assets),
      library: (options = {}) => openPresetLibrary({ target: this.pieceTarget(), scope: "cast", ...options })
        .then(() => { this.renderStrip(); this.renderPool(); this.renderCast(); }),
      // Their pictures as saved latents, landing where the shelf's own "+"
      // lands a picture: the lone shot's row, or the pool.
      mod: (subject, assets, mode, onProgress, family = null) => {
        const single = this.timeline.segments.length === 1;
        const host = single ? this.timeline.segments[0] : this.timeline;
        return keepAsMod(subject, assets, mode, {
          vae: this.timeline.models?.vae ?? "",
          family,
          onProgress,
          list: () => (host.assets ??= []),
          nextHandle: (kind) => (single ? S.nextHandle(host, kind) : S.nextPoolHandle(this.timeline)),
          texts: () => S.allTexts(this.timeline),
          cast: () => this.timeline.subjects ?? [],
          drop: (handles) => {
            for (const owner of [this.timeline, ...(this.timeline.segments ?? [])]) {
              if (owner.assets) owner.assets = owner.assets.filter((a) => !handles.includes(a.handle));
            }
          },
        }).then((rows) => { this.commit(); this.renderStrip(); this.renderPool(); return rows; });
      },
      vae: () => this.timeline.models?.vae ?? "",
      // The families a member's pictures can be saved for, the piece's first.
      families: () => castFamilies(S.pieceFamily(this.timeline), this.timeline.models?.vae ?? "",
                                  rememberedWeights()),
      // The ledger's estimate of a `match` picture is the piece's canvas.
      canvas: () => timelineGeometry(this.timeline),
      // Recasting somebody rewrites every sentence that wrote their name — the
      // piece's own three and each card's, because a member cast into the
      // standing prompt walks on in shots that never mention them by hand.
      // The three global boxes are built once and hold the caret, so a rename
      // made from outside them has to be written back in by hand — the same
      // reason `setGlobalPrompt` exists. A card's own prompt is drawn by the
      // strip, which `commit` redraws.
      rename: (from, to) => {
        this.promptVersion = (this.promptVersion ?? 0) + 1;
        this.audioEdited("soundscape");
        this.audioEdited("music");
        S.renameSubjectCitations(
          [this.timeline, ...(this.timeline.segments ?? [])], from, to);
        this.promptBox?.setValue(this.timeline.prompt ?? "");
        if (this.soundscapeBox) this.soundscapeBox.value = this.timeline.soundscape ?? "";
        if (this.musicBox) this.musicBox.value = this.timeline.music ?? "";
        this.updateSectionSummaries();
      },
      // Remove their sole files even if prose still names them. Written tags
      // stay in the prompt and are reported as unconnected until reattached.
      // The lone shot's own files are the other half of this shelf's scope.
      dropAssets: (handles) => {
        const keep = (asset) => !handles.includes(asset.handle);
        this.timeline.assets = (this.timeline.assets ?? []).filter(keep);
        const segments = this.timeline.segments ?? [];
        if (segments.length === 1 && segments[0].assets) {
          segments[0].assets = segments[0].assets.filter(keep);
        }
      },
      // A keystroke in a name or a description: written through, nothing
      // redrawn. The card holds the caret.
      touch: () => this.onCommit?.(),
      onNameChange: (subject) => this.updatePoolNames(subject),
      commit: () => this.commit(),
    });
    // Mounted once. `replaceChildren` with the same node still detaches and
    // reattaches it, and a detached input loses the caret — which on a host that
    // redraws per keystroke is the whole bug over again, one level up.
    if (this.castHost.firstChild !== this.castShelf.root) {
      this.castHost.replaceChildren(this.castShelf.root);
    }
    this.castShelf.render();
  }

  /**
   * Cast somebody out of the roster, from an `@` typed into any prose in this
   * window — the global prompt or a card's.
   *
   * Their files land in the piece's pool and they land in the piece's cast, which
   * is what the shelf above is already drawing; the caller writes their name where
   * the caret is. Not `commit`: the caret is in a box that is about to receive a
   * chip, so only the two shelves that gained a row are redrawn.
   */
  castFromLibrary(member) {
    const subject = P.addSubjectToPiece(member, this.timeline);
    if (!subject) return null;
    this.onCommit?.();
    this.renderPool();
    this.renderCast();
    this.renderStrip();
    return subject.handle;
  }

  /**
   * The piece, as something a preset can land on — the window's own.
   *
   * The node has one of these already; this window is the same piece with the
   * strip open, and the cast shelf in it needs somewhere to put somebody taken
   * out of the roster. No cover is offered: a cover comes off the stage, the
   * stage belongs to the node, and this window never sees it.
   */
  pieceTarget() {
    return {
      scope: "piece",
      label: t("this piece"),
      // Which family a preset's row and weights would be landing on. Read by
      // `crossable`, which refuses those two sections across families.
      family: () => S.pieceFamily(this.timeline),
      // The VAE a kept member's pictures are encoded through when the library
      // keeps them as RefMods — the piece's own, so a mod made from the roster
      // is the mod a render here would read — and every family this machine
      // could encode for beside it.
      vae: () => this.timeline.models?.vae ?? "",
      families: () => castFamilies(S.pieceFamily(this.timeline), this.timeline.models?.vae ?? "",
                                  rememberedWeights()),
      // What the picker needs to cut a picture out — the scissors ride into
      // the library's own attach flow through this. The pool's spec, because a
      // member's pictures are individual files, not one sheet.
      plate: () => this.poolPlate(),
      capture: () => ({
        data: P.capturePiece(this.timeline, this.io()),
        defaultName: (this.timeline.prompt || this.timeline.segments?.[0]?.prompt || "")
          .trim().split("\n")[0].slice(0, 48),
      }),
      apply: (body, keys, from) => {
        P.applyToPiece(body, keys, this.timeline, this.io(), { from });
        this.commit();
      },
    };
  }

  /** Files attached for the cast shelf's "attach a file…".
   *  Return all new entries so the shelf can bind a whole selection.
   *
   *  Onto the pool, or onto a lone shot's own row where that is where the cast's
   *  files live — the same rule `presets.addSubjectToPiece` follows, and for the
   *  same reason: a piece with a pool is not a lone shot any more, so putting a
   *  member's first picture in one would fold the node's face into the strip
   *  summary as the answer to hanging a photograph on somebody. */
  async attachOneCastAsset(subject = null, { replacement = false, isCurrent = () => true } = {}) {
    const owner = this.timeline;
    const single = this.timeline.segments.length === 1;
    const host = single ? this.timeline.segments[0] : this.timeline;
    const chosen = await openPicker({
      selectionPurpose: "timeline-cast-files",
      rememberSelection: false,
      kinds: replacement ? ["image", "video", "renders"] : ["image", "video", "audio", "renders", "refmods"],
      kind: "image",
      referenceOptions: { allowedTakes: CAST_REFERENCE_TAKES },
      capacity: (kind) => {
        const slots = single ? S.capacity(host, kind, this.timeline)
          : { used: 0, max: S.refCaps(this.timeline).files, filesLeft: S.refCaps(this.timeline).files };
        // A cast member has one voice, but may keep several visual references.
        return kind === "audio" ? { ...slots, max: Math.min(slots.max, slots.used + 1) } : slots;
      },
      // The scissors ride along: a picture attached while casting somebody is
      // the purest cutout case there is — the `takes` prose already promises
      // the background is dropped, and the chip makes the pixels agree.
      plate: this.poolPlate(),
    });
    if (!chosen?.length || this.timeline !== owner || !isCurrent()
        || (host !== owner && !owner.segments.includes(host))) return null;
    if (!Array.isArray(host.assets)) host.assets = [];
    const entries = [];
    for (const picked of chosen) {
      // Sheets use this host's handles too: img-N on one shot, ref-N in the pool.
      if (picked.plate) {
        const entry = S.plateEntry(picked, S.takenHandles(host),
          single ? {} : { plate: "ref", panel: "ref" });
        host.assets.push(entry);
        entries.push(entry);
        continue;
      }
      const entry = {
        handle: single ? S.nextHandle(host, picked.kind) : S.nextPoolHandle(this.timeline),
        kind: picked.kind,
        role: "reference",
        filename: picked.path ?? picked.filename,
        ref_size: picked.ref_size ?? "max",
      };
      if (picked.trim) entry.trim = picked.trim;
      if (picked.crop) entry.crop = picked.crop;
      if (picked.replacement_origin) entry.replacement_origin = { ...picked.replacement_origin };
      if (picked.replacement_annotation) entry.replacement_annotation = structuredClone(picked.replacement_annotation);
      if (entry.kind === "video") entry.track = S.trackFor(picked);
      if (picked.takes) entry.takes = S.takes({ ...entry, takes: picked.takes });
      host.assets.push(entry);
      entries.push(entry);
    }
    this.commit();
    return entries;
  }

  /** Write a name into the global prompt, so it applies to every shot. The
   *  cast's half of `citeInGlobal`, which does the same for a file. */
  citeName(handle) {
    if (!handle) return;
    const current = this.timeline.prompt ?? "";
    if (new RegExp(`@${handle}\\b`).test(current)) return;
    const joiner = current && !/\s$/.test(current) ? " " : "";
    this.setGlobalPrompt(`${current}${joiner}@${handle} `);
    this.promptSection?.setOpen(true);
    this.commit();
  }

  /** Write a pool handle into the global prompt — the one-click way to say
   *  "this reference applies to the whole piece". The join then carries the
   *  citation into every segment, which is what attaches the file there. */
  citeInGlobal(asset) {
    if (S.poolCitedGlobally(this.timeline, asset)) return;
    const current = this.timeline.prompt ?? "";
    const joiner = current && !/\s$/.test(current) ? " " : "";
    this.setGlobalPrompt(`${current}${joiner}@${asset.handle} `);
    this.promptSection?.setOpen(true);
    this.commit();
  }

  /** The plate spec a pool picker gets: the family's, with `sheet` off. The
   *  pool serves many segments — one loose picture per segment is legal even
   *  on a family whose *card* carries one sheet — so multi-select stays loose
   *  and Connect is the deliberate way to build a sheet here. */
  poolPlate(extra = {}) {
    const spec = S.plateSpec(this.timeline, this.frame());
    return spec ? { ...spec, sheet: false, ...extra } : null;
  }

  /** The same picker the segments use, filling the pool instead of a card. */
  async addPoolAssets() {
    const chosen = await openPicker({
      selectionPurpose: "timeline-pool-files",
      kinds: ["image", "video", "audio", "renders", "refmods"],
      kind: "image",
      referenceOptions: {},
      // The per-segment reference caps are compile's, applied where a segment
      // actually cites — the pool itself has no ceiling worth enforcing here.
      capacity: () => ({ used: 0, max: S.refCaps(this.timeline).files, filesLeft: S.refCaps(this.timeline).files }),
      plate: this.poolPlate(),
    });
    if (!chosen) return;
    for (const picked of chosen) {
      // A sheet built in the picker lands in the pool as one reference, the way
      // it lands on a card as one — and numbered the pool's way, `ref-N` for
      // the sheet and for every panel on it.
      if (picked.plate) {
        this.timeline.assets.push(S.plateEntry(
          picked, S.takenHandles(this.timeline), { plate: "ref", panel: "ref" }));
        continue;
      }
      this.timeline.assets.push(this.poolEntry(picked));
    }
    if (chosen.length) this.poolSection?.setOpen(true);
    this.commit();
  }

  /** One picked file as a pool reference. Its own function because the picker is
   *  no longer the only thing that hands this body a file — see `takeReference`. */
  poolEntry(picked) {
    const entry = {
      handle: S.nextPoolHandle(this.timeline),
      kind: picked.kind,
      role: "reference",
      filename: picked.path,
      // Fidelity is why a reference is attached — same default as the editor.
      ref_size: picked.ref_size ?? "max",
    };
    if (picked.kind === "video") entry.track = S.trackFor(picked);
    if (picked.takes) entry.takes = S.takes({ ...entry, takes: picked.takes });
    if (picked.trim) entry.trim = picked.trim;
    if (picked.crop) entry.crop = picked.crop;
    if (picked.replacement_origin) entry.replacement_origin = { ...picked.replacement_origin };
    if (picked.replacement_annotation) entry.replacement_annotation = structuredClone(picked.replacement_annotation);
    return entry;
  }

  /**
   * A guide off the ControlNet bench, attached where this body keeps references.
   *
   * Which place that is depends on what the body is wearing. A lone shot has an
   * editor and the reference belongs on the card, chip and all, the same as
   * anything the slot buttons attach. A piece on the strip has no single card to
   * attach to and its shared references live in the pool, so that is where this
   * goes — and every segment can then cite it by handle.
   */
  async takeReference(picked) {
    const editor = this.editor;
    if (editor) return editor.attachAssets([picked]);
    this.timeline.assets.push(this.poolEntry(picked));
    this.commit();
  }

  /** Open the sheet editor on a pool sheet, keeping its handle — the pool-side
   *  twin of the editor's `editSheet`, and the same bargain: the pictures that
   *  come back keep the handles and the chips they had, so every segment citing
   *  one still means the picture it meant. Loose picks made in the same session
   *  join the pool as their own references. */
  async editPoolSheet(asset) {
    const spec = this.poolPlate({ edit: true });
    if (!spec) return;
    const chosen = await openPicker({
      selectionPurpose: "timeline-edit-pool-sheet",
      kinds: ["image", "renders"],
      kind: "image",
      referenceOptions: { takes: S.takes(asset), ref_size: S.refSize(asset) },
      capacity: () => ({ used: 0, max: S.refCaps(this.timeline).files,
                         filesLeft: S.refCaps(this.timeline).files }),
      plate: { ...spec, panels: (asset.panels?.length
        ? asset.panels.map((panel) => ({ path: panel.filename, cut: Boolean(panel.cut),
            ...(panel.rect ? { rect: [...panel.rect] } : {}),
            ...(panel.points?.length ? { points: panel.points.map((p) => ({ ...p })) } : {}),
            ...(panel.crop ? { crop: { ...panel.crop } } : {}),
            ...(panel.takes ? { takes: panel.takes } : {}) }))
        : [{ path: asset.filename, cut: false }]) },
    });
    if (!chosen) return;
    this.foldPoolSheet(asset, chosen);
  }

  /** Fold a picker (or scissors) answer back into the pool in `asset`'s place,
   *  keeping its handle — the pool-side twin of the editor's `mergeSheet`,
   *  and the shared tail of Edit sheet…, the chip and the subject view. */
  foldPoolSheet(asset, chosen) {
    const at = this.timeline.assets.indexOf(asset);
    if (at < 0) return;
    const sheet = chosen.find((picked) => picked.plate);
    const loose = chosen.filter((picked) => !picked.plate);
    const kept = new Map((asset.panels ?? []).map((panel) => [panel.filename, panel]));
    if (!asset.panels?.length) kept.set(asset.filename, asset);
    this.timeline.assets.splice(at, 1);
    if (sheet) {
      const replacement = S.plateEntry(
        { ...sheet, takes: sheet.takes ?? asset.takes, ref_size: sheet.ref_size ?? asset.ref_size },
        S.takenHandles(this.timeline),
        { plate: "ref", panel: "ref", handle: asset.handle, kept });
      for (const key of ["description", "usage_rules"]) if (typeof asset[key] === "string") replacement[key] = asset[key];
      this.timeline.assets.splice(at, 0, replacement);
    } else {
      // Narrowed to one, or taken apart: the first pick that was a panel steps
      // into the sheet's place and its handle — same rule as the card's.
      const heirAt = loose.findIndex((picked) => kept.has(picked.path));
      if (heirAt >= 0) {
        const [heir] = loose.splice(heirAt, 1);
        const before = kept.get(heir.path);
        this.timeline.assets.splice(at, 0, {
          handle: asset.handle, kind: "image", role: "reference",
          filename: heir.path, ref_size: heir.ref_size ?? asset.ref_size ?? "max",
          ...(typeof asset.description === "string" ? { description: asset.description } : {}),
          ...(typeof asset.usage_rules === "string" ? { usage_rules: asset.usage_rules } : {}),
          ...((heir.takes ?? before?.takes ?? asset.takes)
            ? { takes: heir.takes ?? before?.takes ?? asset.takes } : {}),
          ...(("crop" in heir ? heir.crop : before?.crop)
            ? { crop: "crop" in heir ? heir.crop : before.crop } : {}),
        });
      }
    }
    for (const picked of loose) {
      this.timeline.assets.push(this.poolEntry(picked));
    }
    this.commit();
    this.renderPool();
  }

  /** The picture editor on a pool picture — the editor's `editPicture`, folded
   *  through the pool's own sheet fold. */
  async editPoolPicture(asset) {
    const { width, height } = this.geometry();
    let answer;
    try {
      answer = await editPicture(asset, {
        plate: this.poolPlate(),
        aspect: width && height ? { ratio: width / height, label: t("canvas") } : null,
        frame: asset.kind === "video" && !S.isRefMod(asset),
      });
    } catch (error) {
      this.poolError = String(error.message || error);
      this.renderPool();
      return;
    }
    if (!answer) return;
    if (answer.frame) return this.usePoolFrame(asset, answer);
    if (asset.kind === "image") {
      this.poolError = null;
      this.foldPoolSheet(asset, [asPick(answer)]);
      return;
    }
    if (answer.crop) asset.crop = answer.crop;
    else delete asset.crop;
    S.dropMods(asset);
    this.commit();
    this.renderPool();
  }

  /** One frame of a pool clip, in the clip's place — the editor's `useFrame`,
   *  pool-side. A pool handle names no kind, so the row keeps it and every
   *  citation with it; what a clip alone can carry — a segment, a soundtrack,
   *  a member's motion or voice — comes off with the clip. */
  usePoolFrame(asset, answer) {
    S.stillForClip(this.timeline, asset, answer.frame.path, answer.crop);
    this.poolError = null;
    this.commit();
    this.renderPool();
  }

  /** Point a pool reference at a different file, keeping its handle — see the
   *  editor's `replaceAsset`, which this is the pool-side twin of. */
  async replacePoolAsset(asset) {
    const chosen = await openPicker({
      selectionPurpose: "timeline-replace-pool-file",
      kinds: [asset.kind, "renders"],
      kind: asset.kind,
      only: asset.kind,
      single: true,
      referenceOptions: { takes: S.takes(asset), ref_size: S.refSize(asset) },
      capacity: () => ({ used: 0, max: 1, filesLeft: 1 }),
    });
    const picked = chosen?.[0];
    if (!picked || !(this.timeline.assets ?? []).includes(asset)) return;
    if (picked.plate) {
      this.foldPoolSheet(asset, chosen);
      return;
    }
    const changedFile = asset.filename !== picked.path;
    asset.filename = picked.path;
    if (changedFile || Object.hasOwn(picked, "trim")) {
      if (picked.trim) asset.trim = picked.trim;
      else delete asset.trim;
    }
    if (changedFile || Object.hasOwn(picked, "crop")) {
      if (picked.crop) asset.crop = picked.crop;
      else delete asset.crop;
    }
    if (changedFile || Object.hasOwn(picked, "crop")) S.dropMods(asset);
    if (asset.kind === "video" && (changedFile || Object.hasOwn(picked, "track"))) asset.track = S.trackFor(picked);
    if (picked.takes) asset.takes = S.takes({ ...asset, takes: picked.takes });
    if (picked.ref_size) asset.ref_size = picked.ref_size;
    this.commit();
  }

  geometry() {
    return timelineGeometry(this.timeline);
  }

  /** The picture this piece is about to make: the canvas, and how long it runs.
   *  For a host that has to draw the frame before there is anything in it —
   *  the fullscreen editor's dock, which is a whole column of nothing until
   *  the first render lands (see fullscreen.js). */
  frame() {
    const { width, height } = this.geometry();
    return { width, height, seconds: S.timelineSeconds(this.timeline) };
  }

  /** The bar's ratio popover: every picture the strip holds is offered as the
   *  canvas's source — any card's frames, references and footage, and the
   *  pool's — with the presets beneath them. */
  openAspect(anchor) {
    const donors = S.timelineAspectSources(this.timeline).map(({ value, card, asset }) => {
      if (S.isClip(asset)) {
        return {
          value, label: t("clip"), tag: null,
          ratio: S.clipSize(asset) ? S.clipSize(asset).width / S.clipSize(asset).height : null,
          sub: t("card {n}", { n: card }),
        };
      }
      const size = S.framedSize(aspectSizeOf(asset), asset.crop);
      const role = asset.role === "first_frame" ? t("start frame")
        : asset.role === "last_frame" ? t("end frame")
        : asset.kind === "video" ? t("reference video") : t("reference image");
      return {
        value, label: `@${asset.handle}`, tag: S.tagIndex(asset.handle),
        ratio: size ? size.width / size.height : null,
        sub: card ? `${role} · ${t("card {n}", { n: card })}` : t("piece reference"),
      };
    });
    const autoSize = S.timelineAspectSize(this.timeline, aspectSizeOf, { ignoreChoice: true });
    openAspectPopover(anchor, this.timeline, () => this.commit(), donors.length ? {
      donors,
      auto: {
        ratio: autoSize ? autoSize.width / autoSize.height
          : rulesFor(S.pieceFamily(this.timeline)).aspects
              .find(([label]) => label === this.timeline.aspect)?.[1] ?? 16 / 9,
        sub: autoSize ? aspectSourceLabel({ ...this.timeline, aspect_source: undefined })
          : this.timeline.aspect,
      },
    } : null);
  }

  /**
   * Chained or one pass — the two ends of the same dial.
   *
   * Both are now the same statement made on every seam at once, which is why
   * the control has a third position it never asks for: a strip with some of
   * its seams merged is neither, and saying "chained" about it would be a lie
   * told by the one control on the bar that changes what all the others mean.
   * Mixed is reported, not offered — the seams themselves are where a pass is
   * made, and there is no sensible thing for clicking it to do.
   */
  renderMode() {
    const single = S.isSingle(this.timeline);
    const passes = S.passes(this.timeline);
    const mixed = !single && passes.length < this.timeline.segments.length;
    const option = (merge, label, title) => el("button", {
      class: `mmc-tl-render-opt${!mixed && merge === single ? " on" : ""}`,
      text: t(label),
      title,
      onclick: () => { if (mixed || merge !== single) this.mergeAll(merge); },
    });
    return el("div", { class: "mmc-tl-render" }, [
      option(false, "Chained",
        t("One generation per segment, joined end to end. No limit on the finished length, "
        + "and a segment can start from the previous one's last frame — but every join is a real seam.")),
      ...(mixed ? [el("span", {
        class: "mmc-tl-render-opt mmc-tl-render-mixed",
        text: t("Mixed"),
        title: t("Some of this strip's segments are merged into passes and some are "
             + "generated alone — {passes} generations for {count} segments. Merge or "
             + "split a seam to change it, or use the two ends of this control to make "
             + "the whole strip one or the other.",
             { passes: passes.length, count: this.timeline.segments.length }),
      })] : []),
      option(true, "One pass",
        t("One generation. The segments become the shots of a single description, cut times and all, "
        + "so nothing is decoded and re-encoded mid-clip and there is no seam to cross. "
        + "Everything a single pass can only have one of — mode, checkpoint, LoRAs — "
        + "becomes the timeline's.")),
    ]);
  }

  /**
   * The mode, the canvas, and the running total.
   *
   * The canvas sits here rather than on a segment because chained segments are
   * concatenated frame by frame at the end, which is only defined if they all
   * came out the same size. compile.py enforces it by compiling every segment
   * against the geometry the first one resolved; this is where the user sets it.
   */
  /** A view shortcut, separate from the display-only number badge. The
   *  selection never writes a shot, opens its editor or starts playback. */
  segmentNavigator() {
    const segments = this.timeline.segments ?? [];
    if (segments.length < 2) return null;
    const button = el("button", {
      class: "mmc-tl-jump-select", type: "button", "aria-label": t("Go to segment"),
      "aria-haspopup": "menu", "aria-expanded": "false",
      title: t("Find a card without changing its settings"),
      onclick: (event) => this.openSegmentNavigator(event.currentTarget),
      onkeydown: (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault(); event.stopPropagation();
        this.openSegmentNavigator(event.currentTarget, event.key === "ArrowUp");
      },
      onpointerdown: (event) => event.stopPropagation(),
    }, [el("span", { text: t("Go to segment") }),
        el("span", { text: "⌄", "aria-hidden": "true" })]);
    this.jumpStatus = el("span", { class: "mmc-tl-jump-status", role: "status", "aria-live": "polite" });
    return el("div", { class: "mmc-tl-jump" }, [button, this.jumpStatus]);
  }

  /** A rounded, view-only menu instead of the OS's rectangular select popup. */
  openSegmentNavigator(anchor, last = false) {
    const previous = this.jumpMenu;
    if (previous) {
      previous.close();
      if (previous.anchor === anchor) return;
    }
    const segments = this.timeline.segments ?? [];
    if (segments.length < 2 || !anchor.isConnected) return;
    const menu = el("div", {
      class: "mmc-pop mmc-tl-jump-menu", role: "menu",
      "aria-label": t("Go to segment"), "data-capture-wheel": "true",
    });
    let close = () => {};
    const rows = segments.map((segment, index) => el("button", {
      class: "mmc-tl-jump-option", type: "button", role: "menuitem", tabindex: "-1",
      text: `${index + 1} · ${this.cardLabel(segment)}`,
      title: `${index + 1} · ${this.cardLabel(segment)}`,
      onclick: () => {
        close();
        // A raw state replacement must not make a stale label target a new card.
        if (this.timeline.segments?.[index] === segment) this.jumpToSegment(index);
      },
    }));
    menu.replaceChildren(...rows);
    const focusRow = (index) => {
      const row = rows[(index + rows.length) % rows.length];
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    };
    menu.addEventListener("keydown", (event) => {
      const index = rows.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); event.stopPropagation();
        focusRow(index + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault(); event.stopPropagation();
        focusRow(event.key === "Home" ? 0 : rows.length - 1);
      } else if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close();
      } else if (event.key === "Tab") close();
    });
    document.body.appendChild(menu);
    placeNear(menu, anchor, { above: false });
    close = dismissable(menu, () => {
      anchor.setAttribute("aria-expanded", "false");
      if (this.jumpMenu?.menu === menu) this.jumpMenu = null;
      if (anchor.isConnected && (document.activeElement === document.body || rows.includes(document.activeElement))) {
        anchor.focus({ preventScroll: true });
      }
    });
    this.jumpMenu = { anchor, menu, close };
    anchor.setAttribute("aria-expanded", "true");
    focusRow(last ? rows.length - 1 : 0);
  }

  /** Navigation and whole-strip locks belong by the cards, not the settings. */
  renderNavigation() {
    this.jumpMenu?.close();
    const navigation = this.segmentNavigator();
    const locks = this.holdAllPills();
    const preview = this.timeline.segments.length ? el("button", {
      class: `mmc-pill mmc-tl-individual-preview${this.previewMode ? " on" : ""}`,
      type: "button", "aria-pressed": this.previewMode,
      title: t("Expand ready cards with hover previews. This does not render or export."),
      onclick: (event) => {
        const focused = document.activeElement === event.currentTarget;
        this.previewMode = !this.previewMode;
        patchViewPrefs("timeline:preview", { preview: this.previewMode ? "on" : "off" });
        this.renderNavigation();
        this.renderStrip();
        if (focused && this.navigationHost.isConnected) this.navigationHost.querySelector(".mmc-tl-individual-preview")?.focus({ preventScroll: true });
      },
    }, [svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>', 13),
      el("span", { text: t("Ready preview") })]) : null;
    this.navigationHost.replaceChildren(...(navigation ? [navigation] : []), ...(preview ? [preview] : []), ...locks,
      ...(locks.length ? [el("span", { class: "mmc-tl-navigation-divider", "aria-hidden": true })] : []));
    this.navigationHost.hidden = !navigation && !preview && !locks.length;
  }

  jumpToSegment(index) {
    if (!Number.isInteger(index) || !this.timeline.segments?.[index]) return false;
    const card = this.stripHost?.querySelector(`[data-mmc-segment-index="${index}"]`);
    if (!card) return false;
    clearTimeout(this.jumpTimer);
    this.jumpTarget?.classList.remove("mmc-tl-jump-target");
    this.jumpTarget = card;
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest", inline: "center" });
    card.classList.add("mmc-tl-jump-target");
    if (this.jumpStatus) this.jumpStatus.textContent = t("Segment {number} is in view", { number: index + 1 });
    this.jumpTimer = setTimeout(() => {
      card.classList.remove("mmc-tl-jump-target");
      if (this.jumpTarget === card) this.jumpTarget = null;
    }, 1800);
    return true;
  }

  renderBar() {
    const single = S.isSingle(this.timeline);
    probeAspectSizes(this.timeline, () => this.renderBar(), { all: true });
    const geometry = this.geometry();
    const { width, height, ratio, fromInput } = geometry;
    const rules = rulesFor(S.pieceFamily(this.timeline));
    const res = resolutionPillText(this.timeline, geometry);
    const count = this.timeline.segments.length;
    // What the queue costs and what a seam sits between: the generations, not
    // the cards. They are the same number until a pass holds more than one.
    const passes = S.passes(this.timeline);
    const active = S.activeGlobalLoras(this.timeline).length;
    const idle = (this.timeline.loras?.length ?? 0) - active;
    const refined = this.timeline.segments.some((segment) => segment.refined?.body
      || Object.keys(segment.refined?.sections ?? {}).length);
    const problem = S.stripProblem(this.timeline);
    this.renderNavigation();

    this.barHost.replaceChildren(
      // Ahead of the mode, which leads everything else: the family decides what
      // a mode can even be — the routes, the frame step the cut times round to,
      // the checkpoints a pass may chain between. See `familyPill`.
      familyPill({ piece: this.timeline, onChange: () => this.commit() }),
      this.renderMode(),
      el("button", {
        class: "mmc-pill",
        title: fromInput
          ? t("Aspect ratio, shared by every segment — taken from a picture the strip holds. Click to take it from another input, or force a preset.")
          : t("Aspect ratio, shared by every segment — they are joined end to end and have to match."),
        onclick: (event) => this.openAspect(event.currentTarget),
      }, fromInput
        ? [aspectGlyph(ratio, PILL_GLYPH),
           el("span", { text: describeRatio(ratio, rules) }),
           el("span", { class: "mmc-pill-sub", text: aspectSourceLabel(this.timeline) })]
        : [aspectGlyph(ratio, PILL_GLYPH),
           el("span", { text: this.timeline.aspect }),
           el("span", { class: "mmc-pill-sub", text: describeRatio(ratio, rules) })]),
      el("button", {
        class: "mmc-pill",
        // "every segment alike" is the strip's own footnote on the shared
        // answer: one canvas holds the whole piece, whichever way it reaches it.
        title: `${res.title} ${t("Every segment alike.")}`,
        onclick: (event) => openResolutionPopover(
          event.currentTarget, this.timeline, () => this.geometry(), () => this.commit()),
      }, [
        icon("res", 16),
        el("span", { text: `${this.timeline.short_edge}p` }),
        el("span", { class: "mmc-pill-sub", text: res.sub }),
      ]),
      // Global LoRAs sit on the bar with the canvas rather than inside a
      // segment, because that is what they are: patched onto every segment,
      // which is the whole reason to have them separately from a segment's own.
      el("button", {
        class: `mmc-pill${active ? " on" : ""}`,
        title: t("LoRAs patched onto every segment, in front of whatever that segment adds. "
             + "Where a turbo LoRA belongs."),
        onclick: () => this.openLoras(),
      }, [
        icon("effect", 16),
        el("span", { text: active
          ? t(active === 1 ? "{count} LoRA" : "{count} LoRAs", { count: active })
          : t("LoRAs") }),
        ...(idle ? [el("span", { class: "mmc-pill-sub", text: t("{idle} idle", { idle }) })] : []),
      ]),
      // The storyboard: what each shot is shown of the shots before it. On the
      // bar because it is the attach-once gesture, like the global prompt —
      // every seam's chip then says what its own card gets, and can differ.
      // Only where the family has the sheet, and only once there is a shot
      // before another: one pass over the whole strip has no "before".
      ...(S.canDo(this.timeline, "storyboard") && !single && passes.length > 1
        ? [this.storyboardPill()] : []),
      // Only once a seam actually carries sound *and* is the kind this governs:
      // a blended seam takes its tail from its blend, so a strip where every
      // sound seam is blended has nothing left for this to set. Until then it
      // is a control for a feature not in use — which includes all of one-pass
      // mode, where there are no seams to carry anything.
      ...(passes.slice(1).map((pass) => pass.segments[0]).some(
        (head) => S.continuesAudio(head) && !blendSetsTail(head, this.timeline)) ? [stepperPill({
        value: Number(this.timeline.audio_tail_s), min: 0.1, max: S.MAX_AUDIO_TAIL_S,
        step: 0.1, width: "52px", iconName: "audio",
        title: t("How much of the previous segment's sound an unblended seam inherits. "
             + "Longer costs sampling time. A blended seam takes its tail from its blend "
             + "instead, so its sound and its picture cross on the same instants."),
        format: (n) => t("{n}s tail", { n: n.toFixed(1) }),
        onChange: (next) => { this.timeline.audio_tail_s = next; this.commit(); },
      })] : []),
      // The mode belongs to a generation, and in one pass there is one for the
      // whole timeline rather than one per card.
      ...(single ? [el("span", {
        class: "mmc-pill mmc-pill-static",
        title: t("What the merged request compiles to — every shot's references and "
             + "keyframes are one pool, so this is asked of the whole timeline at once."),
      }, [el("span", { text: S.passMode(this.timeline.segments, this.timeline) })])] : []),
      // One call for the whole strip, not one per card: continuity across a cut
      // is only kept by a rewrite that wrote both sides of it.
      refineButton({
        run: async (options) => {
          try {
            await withRefineOwner(this.timeline, () => this.refineAll(options));
          } catch (error) {
            this.refineError = String(error.message || error);
            this.renderBar();
          }
        },
        family: () => S.pieceFamily(this.timeline),
        // Keep the broad operation explicit even after an individual rewrite.
        label: t("Refine all"),
        className: "mmc-pill mmc-tl-refine",
        title: t("Rewrite {what} into the "
             + "description this piece's model was trained to read, in one pass so the later "
             + "shots keep what the first establishes. The global prompt is rewritten too, in "
             + "its own box, and still stands in front of every shot. Everything you wrote is "
             + "kept and expanded. A rewrite is queued in place of the card's own prompt, not "
             + "alongside it.",
             { what: count === 1 ? t("the shot") : t("all {count} shots", { count }) }),
      }),
      // The way back from that one press. Without it, undoing a whole-strip
      // refine means opening every card in turn.
      ...(refined ? [el("button", {
        class: "mmc-pill mmc-tl-unrefine",
        title: t("Throw every rewrite away and go back to the prompts you typed. The global "
             + "prompt, soundscape and score the refiner wrote go with them."),
        onclick: () => this.revertAll(),
      }, [el("span", { text: t("Revert all") })])] : []),
    );
    // The header owns shared settings; the strip keeps its queue facts and
    // warnings here. Whole-strip locks are rendered beside card navigation.
    this.summaryHost.replaceChildren(
      timelineSummary(this.timeline),
      // A refusal the queue would raise, about the strip rather than about one
      // pass. Said here for the same reason the pass's own problems are said
      // under their rail: while the cards are still in front of you and it is
      // one click to make it right.
      ...(problem ? [el("div", { class: "mmc-tl-problem" }, [
        el("span", { class: "mmc-note-key", text: t("render") }),
        el("span", { text: problem }),
      ])] : []),
      // Whatever the last refine had to say — no text encoder is chosen, or it
      // wrote a label nothing backs. Shown on the bar rather than in a card,
      // because the call was about all of them.
      ...(this.refineError ? [el("div", { class: "mmc-warn", text: this.refineError })] : []),
    );
    this.summaryFit?.disconnect();
    this.summaryFit = observeTimelineSummary(this.summaryHost.querySelector(".mmc-tl-total"));
  }

  /**
   * The strip: one enclosure per pass, seams between them.
   *
   * A pass is what one queue generates, so it is what the strip is built out of
   * — usually one card, which is what the whole strip used to be. Every card
   * sits in an enclosure whether or not it shares one, so the cards line up
   * whatever the run lengths are; the enclosure only draws itself when it holds
   * more than one, and the head rails only take up room once the strip has a
   * pass in it at all.
   */
  renderStrip() {
    this.clearCardPreviews();
    this.stripHost.classList.toggle("individual-preview", this.previewMode);
    const parts = [];
    const passes = S.passes(this.timeline);
    // Which kept takes have stopped describing their cards. Asked once for the
    // strip rather than once per card: the answer is a comparison against the
    // serialized piece, and twenty cards would otherwise serialize it twenty
    // times to draw one mark.
    this.edited = S.editedSince(this.timeline);
    this.askTakes();
    passes.forEach((pass, position) => {
      if (position > 0) parts.push(this.renderJoin(pass.start));
      parts.push(this.renderPass(pass));
    });
    // An empty strip is just this tile: the two ways to begin, where they are
    // the rest of the time.
    const what = S.isSingle(this.timeline) ? "Shot" : "Segment";
    // The refusal is the tooltip when there is one: the button says why it is
    // dead rather than leaving the user to find out at queue time.
    const refusal = S.addSegmentRefusal(this.timeline);
    // Two things a card can be, so two buttons in one tile. A shot is written
    // and generated; a clip is footage that already exists and is played. They
    // sit together because they occupy the same place on the strip — the
    // choice is what the next stretch of the piece is made of, not which tool
    // to reach for.
    parts.push(el("div", { class: "mmc-tl-add-pair" }, [
      el("button", {
        class: "mmc-tl-add",
        title: refusal ?? t("Add a {what} to the end", { what: t(what.toLowerCase()) }),
        disabled: refusal ? true : undefined,
        onclick: () => this.add(),
      }, [el("span", { text: "+" }), el("span", { text: t(what) })]),
      el("button", {
        class: "mmc-tl-add mmc-tl-add-clip",
        title: refusal ?? t("Cut a video you already have into the piece. It is played as it "
                          + "is — scaled to the render's size, never generated."),
        disabled: refusal ? true : undefined,
        onclick: () => this.addClip(),
      }, [el("span", { text: "+" }), el("span", { text: t("Clip") })]),
    ]));
    this.stripHost.classList.toggle(
      "has-pass", passes.some((pass) => pass.segments.length > 1));
    this.stripHost.replaceChildren(...parts);
    // BEGIN looping card titles
    const fitTitle = (title) => {
      const track = title.firstElementChild;
      if (!track?.classList.contains("mmc-tl-title-track")) return;
      const width = track.getBoundingClientRect().width;
      title.classList.toggle("scrolling", width > title.clientWidth + 1);
      title.style.setProperty("--mmc-title-distance", `${width + 48}px`);
      title.style.setProperty("--mmc-title-duration", `${Math.max(10, (width + 48) / 28)}s`);
    };
    this.cardTitleFit = new ResizeObserver((entries) => {
      for (const { target } of entries) {
        const title = target.classList.contains("mmc-tl-title-track") ? target.parentElement : target;
        if (title?.isConnected) fitTitle(title);
      }
    });
    for (const title of this.stripHost.querySelectorAll(".mmc-tl-card-name-button, .mmc-tl-clip-name")) {
      if (title.classList.contains("mmc-tl-card-name-button")
          && !S.cardName(this.timeline.segments[Number(title.closest(".mmc-tl-card").dataset.mmcSegmentIndex)])) continue;
      const text = title.textContent;
      if (!title.hasAttribute("aria-label")) title.setAttribute("aria-label", text);
      const track = el("span", {
        class: "mmc-tl-title-track", text, "aria-hidden": true, "data-mmc-loop-title": text,
      });
      title.classList.add("mmc-tl-title-loop");
      title.replaceChildren(track);
      this.cardTitleFit.observe(title);
      this.cardTitleFit.observe(track);
      fitTitle(title);
    }
    // END looping card titles
  }

  /**
   * One pass: its cards, and — once there are several — the casing that says
   * they are one generation.
   *
   * The casing is the whole visual idea. Inside it the cards lose their own
   * borders and become panels of one strip of film, and the gaps between them
   * become the cut times the description will carry. What the rail says is
   * everything the pass can only have one of, which is exactly what merging
   * cost: one mode, one length, one generation.
   */
  renderPass(pass) {
    const cards = [];
    pass.segments.forEach((segment, offset) => {
      if (offset > 0) cards.push(this.renderCut(pass, offset));
      cards.push(this.renderCard(segment, pass.start + offset, pass));
    });
    if (pass.segments.length === 1) {
      return el("div", { class: "mmc-tl-pass" }, [
        el("div", { class: "mmc-tl-pass-head" }),
        el("div", { class: "mmc-tl-pass-cards" }, cards),
      ]);
    }

    const count = pass.segments.length;
    const passRules = rulesFor(S.pieceFamily(this.timeline));
    const frames = framesForSeconds(S.cutTimes(pass.segments).total, passRules);
    const seconds = secondsForFrames(frames, passRules);
    const problem = S.passProblem(this.timeline, pass);
    const manyShots = S.overAdvisedShots(this.timeline, pass);
    // A pass is one generation, so it is held or shot as one and its take is
    // the pass's. The casing wears the skin the card wears alone — solid
    // because the film exists, perforated because it does not — and the rail
    // carries the switch, alongside the other things a pass has one of.
    const chip = this.takeChip(pass.start);

    return el("div", { class: `mmc-tl-pass on${holdSkin(pass.segments[0], this.gone)}` }, [
      el("div", { class: "mmc-tl-pass-head" }, [
        el("span", { class: "mmc-tl-pass-name" }, [
          icon("timeline", 13), el("span", { text: t("one pass") }),
        ]),
        el("span", {
          class: `mmc-tl-pass-len${isTrainedLength(frames, passRules) && !manyShots
                                   ? "" : " off-distribution"}`,
          text: t("{count} shots · {s} s", { count, s: seconds.toFixed(1) }),
          // Two things put a pass outside what its weights like, and they are
          // different statements: how long it runs, and how many cuts are in
          // it. The length is checked for every family; the cut count only
          // where the family's own guidance gives a number to check against.
          title: !isTrainedLength(frames, passRules)
            ? t("{frames} frames in one generation — outside the ~5-15 s the weights "
              + "were trained on. Split the pass to bring each side back inside it.",
                { frames })
            : manyShots
            ? t("{count} cuts in one generation. This family's own guidance prefers at "
              + "most {advised} — past that each shot has fewer frames to establish "
              + "itself, and identity across the cuts holds less well. Split the pass, "
              + "or give each shot a shorter, clearer beat.",
                { count, advised: S.advisedShots(this.timeline) })
            : t("{frames} frames at {fps} fps, generated in one go.",
                  { frames, fps: rulesFor(S.pieceFamily(this.timeline)).fps }),
        }),
        el("span", { class: "mmc-tl-mode",
                     text: S.passMode(pass.segments, this.timeline) }),
        ...(chip ? [chip] : []),
        ...this.takeTools(pass.start, "mmc-ghost"),
        el("button", {
          class: "mmc-ghost mmc-tl-pass-split",
          text: t("Split"),
          title: t("Generate these {count} shots separately again. Every cut between "
               + "them becomes a seam you can set, and each shot gets its own mode, "
               + "checkpoint and length back — nothing written is lost either way.",
                 { count }),
          onclick: () => this.splitPass(pass),
        }),
        this.holdSwitch(pass.start, count),
      ]),
      el("div", { class: "mmc-tl-pass-cards" }, cards),
      ...(problem ? [el("div", { class: "mmc-tl-problem" }, [
        el("span", { class: "mmc-note-key", text: t("one pass") }),
        el("span", { text: problem }),
      ])] : []),
    ]);
  }

  /**
   * The seam between two segments, and the only control on it.
   *
   * Continuing means segment N starts on segment N-1's last frame, which makes
   * it a keyframe generation — so it cannot also carry references, and the
   * switch is refused rather than silently dropping them.
   */
  /**
   * The join inside a pass: a cut, and when it happens.
   *
   * No seam to switch, because there is no seam — a cut inside one generation
   * is a line of the description, `[Shot 3] At 00:09.000, ...`, and the model
   * draws it. So what there is to show is the timestamp the compiler will
   * write, which is the one number the shot durations decide that is not
   * visible anywhere else. Timed from the pass rather than from the timeline,
   * because that is what the description says: every pass opens at 00:00.
   *
   * Clicking splits the pass here, which is the way back out.
   */
  renderCut(pass, offset) {
    const { at } = S.cutTimes(pass.segments);
    const time = S.shotTime(at[offset]);
    const n = pass.start + offset + 1;
    return el("button", {
      class: "mmc-tl-cut",
      title: t("Shot {n} cuts in {time} into this pass. "
           + 'Write its prompt as the cut — "the camera cuts to…", "the shot transitions to…" — '
           + "and the timestamp is added for you. Click to split the pass here, so the two "
           + "sides are generated separately and this cut becomes a seam.",
           { n, time }),
      onclick: () => this.splitAt(pass.start + offset),
    }, [el("span", { text: "✂" }), el("span", { text: time })]);
  }

  /**
   * The seam in front of a supplied clip, which can only run the other way.
   *
   * Everywhere else the switches say what the card after the cut starts from.
   * A clip is not generated, so there is nothing to condition — what they say
   * here is what the card *before* the cut ends on: the clip's opening frame,
   * and its opening sound. The controls stay where the seam is, because that
   * is where the cut is; only their sentence changes.
   *
   * The picture switch pins the previous generation's last frame, which makes
   * it a keyframe generation — so a shot carrying references cannot have one,
   * and the control goes dead saying which shot and why rather than letting
   * the queue refuse it.
   */
  renderClipJoin(index) {
    const clip = this.timeline.segments[index];
    const on = S.continues(clip);
    const sound = S.continuesAudio(clip);
    const blocked = S.clipSeamBlocked(this.timeline, index, "continue");
    const soundBlocked = S.clipSeamBlocked(this.timeline, index, "continue_audio");
    const width = S.feather(clip, this.timeline);
    const rules = rulesFor(S.pieceFamily(this.timeline));

    return el("div", { class: "mmc-tl-seam mmc-tl-seam-clip" }, [
      seamGroup([el("button", {
        class: `mmc-tl-join${on ? " on" : ""}`,
        disabled: blocked ? true : undefined,
        title: blocked || (on
          ? t("Segment {n} ends on this clip's first frame, so the shot arrives where the "
            + "footage begins. Click for a hard cut.", { n: index })
          : t("Hard cut into this clip. Click to end segment {n} on the clip's first frame "
            + "instead, so the generated shot arrives where the footage begins.", { n: index })),
        onclick: blocked ? undefined : () => { clip.continue = !on; this.commit(); },
      }, [el("span", { text: on ? "↝" : "✂" }), el("span", { text: on ? t("runs in") : t("cut") })])]),
      seamGroup([el("button", {
        class: `mmc-tl-join mmc-tl-join-sound${sound ? " on" : ""}`,
        disabled: soundBlocked ? true : undefined,
        title: soundBlocked || (sound
          ? t("Segment {n}'s sound arrives on this clip's, so the room tone and the tempo "
            + "are already the footage's when it starts. Click to let it end on its own.",
              { n: index })
          : t("Segment {n} ends on its own sound and this clip starts on the footage's. "
            + "Click to carry the clip's opening back across the cut.", { n: index })),
        onclick: soundBlocked ? undefined : () => { clip.continue_audio = !sound; this.commit(); },
      }, [icon("audio", 13), el("span", { text: sound ? t("sound") : t("silent seam") })])]),
      // The blend is spent by the segment *behind* the clip — those frames are
      // re-generated at its tail and trimmed off it — so its width is bounded
      // by that card's length and not by the clip's.
      seamGroup(on && S.maxClipFeather(this.timeline, index) > 1 ? [el("button", {
        class: `mmc-tl-join mmc-tl-join-from${width > 1 ? " on" : ""}`,
        title: width > 1
          ? t("The clip's first {s} s are blended across the end of segment {n}, so its motion "
            + "runs into the footage instead of stopping at it. That blended moment is "
            + "re-generated and removed, so segment {n} plays about {s} s shorter.",
              { s: blendSeconds(width, rules), n: index })
          : t("Segment {n} arrives on the clip's first frame. Click to blend a moment of the "
            + "clip's opening across the end of it instead — a smoother handoff, in exchange "
            + "for segment {n} playing slightly shorter.", { n: index }),
        onclick: (event) => this.pickClipFeather(event.currentTarget, clip, index),
      }, [el("span", {
        text: width > 1 ? t("blend {s} s", { s: blendSeconds(width, rules) }) : t("no blend"),
      })])] : []),
    ]);
  }

  /** The blend into a clip. Same grid as any seam; the ceiling is the length of
   *  the segment that pays for it. */
  pickClipFeather(anchor, clip, index) {
    const max = S.maxClipFeather(this.timeline, index);
    const grid = S.featherGridOf(this.timeline);
    const rules = rulesFor(S.pieceFamily(this.timeline));
    const label = (f) => (f === 1 ? t("None — arrive on the clip's first frame")
      : t("{name} · {s} s of motion",
          { name: t(BLEND_NAMES[grid.indexOf(f)] ?? "Blend"), s: blendSeconds(f, rules) }));
    openChoicePopover(anchor, {
      title: t("Blend into this clip"),
      options: grid.filter((f) => f <= max).map(label),
      value: label(Math.min(S.feather(clip, this.timeline), max)),
      extra: seamPinRow(this.timeline, clip, S.feather(clip, this.timeline),
                        () => this.commit()),
      onPick: (choice) => {
        const width = grid.find((f) => label(f) === choice) ?? 1;
        if (width > 1) clip.feather = width;
        else { delete clip.feather; delete clip.feather_pin; }
        this.commit();
      },
    });
  }

  renderJoin(index) {
    const segment = this.timeline.segments[index];
    if (S.isClip(segment)) return this.renderClipJoin(index);
    const on = S.continues(segment);
    const blocked = on ? null : S.blockedReason(segment, "continue");

    const sound = S.continuesAudio(segment);
    const soundBlocked = sound ? null : S.blockedReason(segment, "continue_audio");

    // Which earlier segment a live seam inherits from — the previous one unless
    // the seam names another, which is what makes a circular narrative possible:
    // segment 3 can return to segment 1's hallway after an unrelated segment 2.
    // Resolved through the passes, because the frames that exist to inherit are
    // a generation's: a source merged into the middle of a pass means the pass,
    // which is what compile.py reaches for and so what this has to say.
    const stored = S.continueSource(segment, index);
    const from = this.earlierPasses(index)
      .find((pass) => stored > pass.start && stored <= pass.end)?.end ?? stored;

    // Two switches, not one control with three states. The picture and the sound
    // cross a seam independently: a hard cut whose score keeps playing is as
    // ordinary as a match cut that resets the room tone.
    return el("div", { class: "mmc-tl-seam" }, [
      seamGroup([el("button", {
        class: `mmc-tl-join${on ? " on" : ""}`,
        disabled: blocked ? true : undefined,
        title: blocked || (on
          ? t("Segment {n} starts on segment {from}'s last frame. Click for a hard cut.",
              { n: index + 1, from })
          : t("Hard cut into segment {n}. Click to start it on segment {prev}'s last frame.",
              { n: index + 1, prev: index })),
        onclick: blocked ? undefined : () => { segment.continue = !on; this.commit(); },
      }, [el("span", { text: on ? "↝" : "✂" }), el("span", { text: on ? t("continues") : t("cut") })])]),
      seamGroup([el("button", {
        class: `mmc-tl-join mmc-tl-join-sound${sound ? " on" : ""}`,
        disabled: soundBlocked ? true : undefined,
        title: soundBlocked || (sound
          ? t("Segment {n}'s sound carries on from segment {from}'s. "
            + "Click to let it start its own.", { n: index + 1, from })
          : t("Segment {n} generates its own sound from scratch. "
            + "Click to carry the last {tail}s of segment {from}'s into it.",
              { n: index + 1, tail: this.timeline.audio_tail_s, from })),
        onclick: soundBlocked ? undefined : () => { segment.continue_audio = !sound; this.commit(); },
      }, [icon("audio", 13), el("span", { text: sound ? t("sound") : t("silent seam") })])]),
      // Where the seam inherits from. Only on a live seam, and only once there
      // is a choice to make: the second pass can only continue from the first,
      // and a one-option picker would only raise the question it answers.
      seamGroup([
      ...((on || sound) && this.earlierPasses(index).length >= 2 ? [el("button", {
        class: `mmc-tl-join mmc-tl-join-from${from !== index ? " on" : ""}`,
        title: t("What continues across this seam is segment {from}'s last {what}. "
             + "Click to inherit from a different earlier segment — a story returning to "
             + "segment 1 after an unrelated shot continues from segment 1.",
             { from, what: t(on && sound ? "frame and sound" : on ? "frame" : "sound") }),
        onclick: (event) => this.pickContinueFrom(event.currentTarget, segment, index),
      }, [el("span", { text: t("from #{from}", { from }) })])] : []),
      // How much of the source's tail crosses the seam. Only on a live picture
      // seam: the width is a property of the inherited frames, and the classic
      // last-frame seam is what it says until widened. The chip and its picker
      // speak in seconds of motion — the frame counts are the encoder's
      // business, not the user's.
      ...(on ? [(() => {
        const width = S.feather(segment, this.timeline);
        const rules = rulesFor(S.pieceFamily(this.timeline));
        return el("button", {
        class: `mmc-tl-join mmc-tl-join-from${width > 1 ? " on" : ""}`,
        title: (width > 1
          ? t("The last {s} s of segment {from}'s motion "
            + "carries across this cut, so the movement flows through instead of restarting "
            + "from a still. That blended moment is redone at the start of segment {n} "
            + "and removed from the final video, so it plays about "
            + "{s} s shorter than its set length.",
              { s: blendSeconds(width, rules), from, n: index + 1 })
          : t("This cut picks up from segment {from}'s last frame. Click to blend a moment "
            + "of its motion across instead — a smoother handoff, in exchange for segment "
            + "{n} playing slightly shorter.", { from, n: index + 1 }))
          // The sound rides the same inherited instants as the frames, so the
          // blend sets the tail rather than the piece's setting. Said here
          // because this chip is where the number that wins is on screen.
          + (blendSetsTail(segment, this.timeline)
            ? " " + t("Its sound carries the same {s} s, so the soundtrack and the "
                    + "picture cross the seam on the same instants.",
                      { s: blendSeconds(width, rules) })
            : "")
          // Only when it is on: off is the default and the sentence above
          // already describes it.
          + (S.featherPin(segment, this.timeline)
            ? " " + t("The frame it lands on is named to the text encoder as well.")
            : ""),
        onclick: (event) => this.pickFeather(event.currentTarget, segment, index),
      }, [el("span", {
        text: width > 1
          ? t("blend {s} s", { s: blendSeconds(width, rules) }) : t("no blend"),
      })]);
      })()] : []),
      ]),
      // What this card is shown of the strip before it. Beside the seam's
      // chips because it is the same kind of fact — what reaches this shot
      // from the shots before it — and unlike them it is there on a hard cut
      // too, which is where a sheet earns most: nothing else crosses one.
      seamGroup(S.canDo(this.timeline, "storyboard") ? [(() => {
        const sheet = S.storyboardSheet(this.timeline, index);
        const shown = sheet.length > 0;
        return el("button", {
          class: `mmc-tl-join mmc-tl-join-board${shown ? " on" : ""}`,
          "data-storyboard-scope": S.storyboardCards(segment, index) === null ? "global" : "individual",
          title: this.storyboardScopeLines(index).join("\n") + "\n" + (shown
            ? t("Segment {n} is shown a storyboard of {which}: nine of their frames on one "
              + "sheet, in order, cited as a picture reference so the room, the light and "
              + "where things stand carry across this cut. It runs on the reference "
              + "checkpoint for it, and re-renders when those shots change. Click to "
              + "change which shots, or show it nothing.",
                { n: index + 1, which: passNumbers(sheet) })
            : t("Segment {n} is shown nothing of the shots before it. Click to show it a "
              + "storyboard of them — nine of their frames on one sheet, cited as a "
              + "picture reference.", { n: index + 1 })),
          onclick: (event) => this.pickStoryboard(event.currentTarget, segment, index),
        }, [icon("storyboard", 13),
            el("span", { text: shown ? t("sees {which}", { which: passNumbers(sheet) })
                                     : t("no storyboard") })]);
      })()] : []),
      // The third answer to what happens here, and the only structural one: no
      // seam at all, because the two sides are one generation. Kept apart from
      // the two switches above rather than folded in as a third state of the
      // picture one — those say how this seam behaves, this one says whether
      // there is a seam to behave.
      //
      // Absent behind supplied footage: a clip is played rather than
      // generated, so there is no generation on the far side of this cut for
      // this card to be folded into.
      ...(S.isClip(this.timeline.segments[index - 1]) ? [] : [el("button", {
        class: "mmc-tl-join mmc-tl-join-merge",
        title: t("Generate segment {n} in the same pass as the one before it: one "
             + "generation, with this cut written into its description for the model to "
             + "draw. Nothing is decoded and re-encoded here, so there is no seam to "
             + "cross — in exchange the two shots share one mode, one checkpoint and "
             + "one LoRA stack. Everything you set here is kept, and comes "
             + "back if you split the pass again.", { n: index + 1 }),
        onclick: () => this.mergeAt(index),
      }, [el("span", { text: "▤" }), el("span", { text: t("one pass") })])]),
    ]);
  }

  /** Fold the segment at `index` into the pass in front of it. */
  mergeAt(index) {
    if (index < 1) return;
    this.timeline.segments[index].merge = true;
    this.commit();
  }

  /** ...and back out again: the segment at `index` opens its own pass. */
  splitAt(index) {
    delete this.timeline.segments[index].merge;
    this.commit();
  }

  /** Every shot of a pass back to a generation of its own. */
  splitPass(pass) {
    for (let index = pass.start + 1; index < pass.end; index += 1) {
      delete this.timeline.segments[index].merge;
    }
    this.commit();
  }

  /** The bar's two ends: the whole strip as one pass, or none of it.
   *
   *  Written to `render` as well as to the flags, because the flags cannot say
   *  it on a strip of one: a merge flag is a statement about the seam in front
   *  of a card, and card 1 has no seam. `syncTimeline` re-derives `render` from
   *  the flags the moment there are two cards and agrees with what is set here,
   *  so the only strip this decides on its own is the one with no seam in it —
   *  where it is still a real choice, and the only thing that says whether the
   *  card is a shot of one pass or a pass of its own. */
  mergeAll(merge) {
    this.timeline.render = merge ? "single" : "chained";
    this.timeline.segments.forEach((segment, index) => {
      if (!index) return;
      if (merge) segment.merge = true;
      else delete segment.merge;
    });
    this.commit();
  }

  /** The seam's width. The options are the runs the video VAE can encode
   *  standalone (`state.featherGridOf`), named by what the user hears and sees:
   *  how long a moment of motion crosses the cut. */
  pickFeather(anchor, segment, index) {
    const max = S.maxFeather(segment, this.timeline);
    const grid = S.featherGridOf(this.timeline);
    const rules = rulesFor(S.pieceFamily(this.timeline));
    const label = (f) => (f === 1 ? t("None — start from the last frame")
      : t("{name} · {s} s of motion",
          { name: t(BLEND_NAMES[grid.indexOf(f)] ?? "Blend"), s: blendSeconds(f, rules) }));
    openChoicePopover(anchor, {
      title: t("Blend into segment {n}", { n: index + 1 }),
      options: grid.filter((f) => f <= max).map(label),
      value: label(Math.min(S.feather(segment, this.timeline), max)),
      extra: seamRows(
        seamPinRow(this.timeline, segment, S.feather(segment, this.timeline),
                   () => this.commit()),
        seamRestoreRow(this.timeline, segment, index, () => this.commit())),
      onPick: (choice) => {
        const width = grid.find((f) => label(f) === choice) ?? 1;
        if (width > 1) segment.feather = width;
        else { delete segment.feather; delete segment.feather_pin; }
        this.commit();
      },
    });
  }

  /** The passes that finish before the segment at `index` starts — the ones
   *  whose frames exist by the time this seam is crossed. */
  earlierPasses(index) {
    return S.passes(this.timeline).filter((pass) => pass.end <= index);
  }

  /** The piece's storyboard setting, as a pill. */
  storyboardPill() {
    const policy = S.storyboardPolicy(this.timeline);
    const sub = { previous: t("previous shot"), all: t("piece so far") }[policy];
    return el("button", {
      class: `mmc-pill${policy ? " on" : ""}`,
      "data-storyboard-policy": policy ?? "off",
      title: t("Whether each shot is shown a storyboard of the shots before it: nine of "
             + "their frames on one sheet, cited as a picture reference, so the room, the "
             + "light and where things stand carry across a cut. Made when the earlier "
             + "shots have rendered. A shot shown one runs on the reference checkpoint, "
             + "and re-renders when the shots it sees change. Each seam's chip can say "
             + "otherwise for its own shot."),
      onclick: (event) => this.pickStoryboardPolicy(event.currentTarget),
    }, [
      icon("storyboard", 16),
      el("span", { text: t("Global storyboard") }),
      ...(sub ? [el("span", { class: "mmc-pill-sub", text: sub })] : []),
    ]);
  }

  pickStoryboardPolicy(anchor) {
    if (this.storyboardClosed || this.overlay?.isConnected === false
        || !S.canDo(this.timeline, "storyboard")) return;
    const owner = this.timeline;
    // These two shared controls intentionally edit the same open menu. Their
    // latest values are retained; changes to policy, sources or cards still
    // invalidate its snapshot. The subsequent confirmation guards all fields.
    const menuStamp = () => S.serializeTimeline({ ...owner,
      storyboard_hold: undefined, storyboard_carries: undefined });
    const stamp = menuStamp();
    const options = [null, "previous", "all"];
    const label = (policy) => ({
      previous: t("Each shot sees the shot before it"),
      all: t("Each shot sees the piece so far"),
    }[policy] ?? t("No storyboard"));
    const sub = (policy) => ({
      previous: t("Nine frames of the previous shot. What the eye just saw."),
      all: t("Nine frames spread over earlier source passes by length; when there are more than nine, the most recent nine are used."),
    }[policy] ?? t("Each shot is described by its prompt, its seam and its own references."));
    openChoicePopover(anchor, {
      title: t("What each shot is shown of the shots before it"),
      options, label, sub,
      value: S.storyboardPolicy(this.timeline),
      extra: () => el("div", {}, [storyboardGuidance([
        t("This is the global storyboard default. Segments without an individual setting follow it."),
        t("Changing the global setting does not reset segments with individual settings."),
        t("The storyboard uses nine frames from earlier rendered videos as a picture reference. It does not combine their audio or edit the final cut."),
      ]), this.storyboardHold()]),
      onPick: (policy) => {
        if (this.storyboardClosed || this.overlay?.isConnected === false) return;
        if (this.timeline !== owner || menuStamp() !== stamp) {
          this.showStoryboardInfo(anchor, [t("Storyboard settings changed while this menu was open. Open it again to choose from the current sources.")]);
          return;
        }
        if (policy === S.storyboardPolicy(this.timeline)) return;
        const own = this.timeline.segments.filter((segment, index) =>
          S.storyboardCards(segment, index) !== null).length;
        const candidate = { ...this.timeline, storyboard: policy };
        const affected = S.passes(candidate).filter(pass => pass.start > 0
          && !S.isClip(pass.segments[0]) && S.storyboardCards(pass.segments[0], pass.start) === null)
          .map(pass => pass.start);
        this.confirmStoryboardEdit(anchor, [
          t("Global storyboard default: {setting}.", { setting: label(policy) }),
          t("This change applies to {count} generated pass heads that follow the global default.", { count: affected.length }),
          ...(own ? [t("The {count} cards with individual settings keep their settings.", { count: own })] : []),
          ...(policy ? [] : [t("Turning off the global default does not turn off individually enabled storyboards.")]),
          ...this.storyboardEffectLines(candidate, affected),
        ], () => {
          if (policy) this.timeline.storyboard = policy; else delete this.timeline.storyboard;
          this.commit();
        });
      },
    });
  }

  storyboardScopeLines(index) {
    const segment = this.timeline.segments[index];
    const policy = S.storyboardPolicy(this.timeline);
    const setting = policy === "all" ? t("piece so far") : policy === "previous" ? t("previous shot") : t("off");
    const own = S.storyboardCards(segment, index);
    return [
      t("Global storyboard default: {setting}.", { setting }),
      own === null
        ? t("This segment follows the global storyboard default, including future changes.")
        : own.length
        ? t("This segment uses an individual storyboard setting. It takes priority over the global default.")
        : t("The storyboard is off only for this segment. Future global changes will not enable it."),
    ];
  }

  storyboardEffectLines(piece, indices) {
    const lines = [t("Settings are saved now; this button does not render a video.")];
    const sheets = indices.map(index => ({ index, sheet: S.storyboardSheet(piece, index) }));
    if (sheets.some(row => row.sheet.length)) lines.push(
      t("The storyboard uses nine frames from earlier rendered videos as a picture reference. It does not combine their audio or edit the final cut."),
      t("A storyboard uses one image reference slot. Automatic routing normally uses reference-generation weights."),
    );
    lines.push(t("Changing storyboard references can require the affected generated pass to render again."));
    if (indices.some(index => S.isHeld(piece.segments[index]))) lines.push(
      t("A locked target is not regenerated. Unlock it and render again to use the new storyboard setting."));
    const unavailable = new Set(), pending = new Set();
    let skipsUnavailable = false, heldReady = false;
    for (const { index, sheet } of sheets) {
      for (const { pass } of sheet) {
        const head = pass.segments[0];
        if (S.isHeld(head)) {
          const take = S.takeOn(head);
          if (!take || this.gone?.has(take.filename)) {
            unavailable.add(pass.end);
            skipsUnavailable ||= S.storyboardCards(piece.segments[index], index) === null
              && S.storyboardPolicy(piece) === "all";
          } else heldReady = true;
        } else if (!S.isClip(head)) pending.add(pass.end);
      }
      const runs = S.passes(piece);
      const sourcePasses = new Set(S.storyboardIndices(piece, index).map(card =>
        runs.findIndex(pass => card >= pass.start && card < pass.end)));
      sourcePasses.delete(-1);
      if (sourcePasses.size > S.STORYBOARD_CELLS) lines.push(
        t("More than nine source passes were selected. The sheet uses the most recent nine source passes."));
    }
    if (pending.size) lines.push(t("Unlocked source passes render first; the storyboard is built from their new results afterward."));
    if (heldReady) lines.push(t("Locked source passes use their saved results. Editing their prompts does not update the storyboard until those sources are unlocked and rendered again."));
    if (unavailable.size) lines.push(t("Locked source passes {which} have no available result. Render or restore their source videos first.",
      { which: [...unavailable].map(number => `#${number}`).join(", ") }));
    if (skipsUnavailable) lines.push(t("The global piece-so-far setting skips locked sources without a result. An individual source selection can instead prevent generation until its sources are available."));
    return [...new Set(lines)];
  }

  confirmStoryboardEdit(anchor, lines, apply, segment = null, index = null) {
    if (this.storyboardClosed || this.overlay?.isConnected === false
        || !S.canDo(this.timeline, "storyboard")) return;
    this.storyboardNoticeClose?.();
    const owner = this.timeline, stamp = S.serializeTimeline(owner);
    const current = () => !this.storyboardClosed && this.overlay?.isConnected !== false
      && this.timeline === owner && S.serializeTimeline(owner) === stamp
      && (!segment || owner.segments[index] === segment && !S.isClip(segment)
        && S.canDo(owner, "storyboard") && S.passOf(owner, index)?.start === index);
    this.storyboardNoticeCurrent = current;
    this.storyboardNoticeClose = confirmStoryboardChange({ lines }, {
      returnFocus: anchor,
      onClose: () => { this.storyboardNoticeClose = null; this.storyboardNoticeCurrent = null; },
      onApply: () => {
        if (!current()) {
          this.showStoryboardInfo(anchor, [t("Storyboard settings changed while this window was open. Review the current settings and try again.")]);
          return;
        }
        apply();
      },
    });
  }

  showStoryboardInfo(anchor, lines) {
    if (this.storyboardClosed || this.overlay?.isConnected === false) return;
    this.storyboardNoticeClose?.();
    this.storyboardNoticeCurrent = null;
    this.storyboardNoticeClose = confirmStoryboardChange({ lines, confirmText: t("Close") }, {
      returnFocus: anchor,
      onClose: () => { this.storyboardNoticeClose = null; this.storyboardNoticeCurrent = null; },
    });
  }

  /**
   * How firmly the sheet holds, and what the prompt says carries over (issue
   * #96), under the storyboard pill's three answers.
   *
   * The default holds the room, its light and where things stand, which is
   * what makes objects and tone survive a cut, and also what stands a
   * knocked-over table back up. So the piece can loosen the retention marker,
   * and rewrite the line that goes with it.
   *
   * The box is drawn as the line the model reads, marker first: the marker and
   * the sentence are one statement in `retention_analysis`, and a box holding
   * only the sentence would hide which word it follows. The defaults are the
   * prompt's own words, served in the manifest, so the box starts from what
   * the render would say. Wording equal to the default is stored as nothing,
   * and a line survives changing the hold: it is the user's.
   *
   * Neither control closes the popover. A hold is often picked to be followed
   * by a rewrite, and the rows above close on pick because they are the whole
   * answer.
   */
  storyboardHold() {
    const cap = S.capabilityOf(this.timeline, "storyboard") || {};
    const holds = cap.holds || S.STORYBOARD_HOLDS;
    const defaults = cap.carries || {};
    const words = {
      fully_preserved: [t("Firm"), t("The room, its light and where everything stands. "
        + "Steady across cuts, but things go back to where the sheet shows them.")],
      partially_preserved: [t("Partial"), t("The room and its light. People and things "
        + "move and change as the prompt says.")],
      weak_reference: [t("Loose"), t("Only the broad look of the place and its light. "
        + "The prompt decides the rest, the camera included.")],
    };
    const hold = () => S.storyboardHold(this.timeline);
    const own = () => typeof this.timeline.storyboard_carries === "string"
      && this.timeline.storyboard_carries.trim() !== "";

    // Typing writes the piece at once and commits once it pauses: a commit
    // re-renders the node, which is not a thing to do per keystroke.
    let pending = null;
    const commitSoon = () => {
      clearTimeout(pending);
      pending = setTimeout(() => this.commit(), 400);
    };

    const box = el("textarea", {
      class: "mmc-board-line-text", rows: 4, spellcheck: "false",
      maxlength: cap.max || 400,
      "aria-label": t("What carries over from the storyboard"),
    });
    const marker = el("span", { class: "mmc-board-line-marker" });
    const note = el("span", { class: "mmc-opt-sub mmc-board-hold-note" });
    const reset = el("button", {
      class: "mmc-board-line-reset", text: t("Use the default"),
      title: t("Restore only the carry-over wording. The global policy, individual source selections and retention strength stay unchanged."),
      onclick: () => {
        delete this.timeline.storyboard_carries;
        draw();
        clearTimeout(pending);
        this.commit();
      },
    });
    const whose = el("span", { class: "mmc-opt-sub" });
    const picks = el("div", { class: "mmc-board-picks mmc-board-holds", role: "radiogroup",
                              "aria-label": t("How firmly the sheet holds") });

    const draw = () => {
      const now = hold();
      picks.replaceChildren(...holds.map((name, index) => el("button", {
        class: "mmc-board-pick mmc-board-hold",
        role: "radio", "aria-checked": name === now,
        title: name,
        onclick: () => {
          if (index === 0) delete this.timeline.storyboard_hold;
          else this.timeline.storyboard_hold = name;
          draw();
          clearTimeout(pending);
          this.commit();
        },
      }, [
        // Strength as bars, strongest first: three, two, one.
        el("span", { class: "mmc-board-hold-bars", "aria-hidden": "true" },
          [0, 1, 2].map((bar) => el("i", { class: bar < holds.length - index ? "on" : "" }))),
        el("span", { text: words[name]?.[0] ?? name }),
      ])));
      note.textContent = words[now]?.[1] ?? "";
      marker.textContent = `${now} -`;
      if (!own()) box.value = defaults[now] ?? "";
      else if (document.activeElement !== box) box.value = this.timeline.storyboard_carries;
      reset.hidden = !own();
      whose.textContent = own() ? t("Your wording") : "";
    };

    box.oninput = () => {
      const text = box.value;
      const same = text.split(/\s+/).join(" ").trim() === (defaults[hold()] ?? "");
      if (!text.trim() || same) delete this.timeline.storyboard_carries;
      else this.timeline.storyboard_carries = text;
      reset.hidden = !own();
      whose.textContent = own() ? t("Your wording") : "";
      commitSoon();
    };

    draw();
    return el("div", { class: "mmc-twopass mmc-board-hold-sect" }, [
      storyboardGuidance([t("Retention strength and carry-over wording are shared by all enabled storyboards, including individual source selections. Individual settings override only the source selection or on/off state.")]),
      el("div", { class: "mmc-opt-label mmc-opt-col mmc-board-hold-head" }, [
        el("span", { text: t("How firmly the sheet holds") }),
        note,
      ]),
      picks,
      el("label", { class: "mmc-board-line" }, [marker, box]),
      el("div", { class: "mmc-board-line-foot" }, [whose, reset]),
    ]);
  }

  /**
   * The storyboard a card is shown, chosen on its seam.
   *
   * The main switch controls inheritance, not exclusion. Explicit source sets
   * remain individual even when they happen to match the global default. The
   * existing false sentinel is reserved for the advanced exclusion control.
   */
  pickStoryboard(anchor, segment, index) {
    if (this.storyboardClosed || this.overlay?.isConnected === false) return;
    if (!S.canDo(this.timeline, "storyboard") || !index || S.isClip(segment)
        || this.timeline.segments[index] !== segment || S.passOf(this.timeline, index)?.start !== index) {
      this.showStoryboardInfo(anchor, [t("An individual storyboard applies only to a generated pass head with earlier source videos. The first card, supplied clips and interior cards of a merged pass do not use a separate storyboard.")]);
      return;
    }
    const earlier = this.earlierPasses(index);
    if (!earlier.length) return;
    const owner = this.timeline, stamp = S.serializeTimeline(owner);
    const policy = S.storyboardPolicy(this.timeline);
    const previous = earlier[earlier.length - 1];
    const all = earlier.map((pass) => pass.end);
    const own = S.storyboardCards(segment, index);
    const individual = own !== null;
    const excluded = individual && !own.length;
    const defaults = () => policy === "all" ? [...all] : [previous.end];
    // Use the requested sources, not just the most recent nine shown cells.
    // Older sources must remain selected even when the sheet cannot fit them.
    const runs = S.passes(owner);
    const selected = new Set((individual ? own : S.storyboardIndices(owner, index))
      .map(card => runs.find(pass => card >= pass.start && card < pass.end)?.end)
      .filter(number => number !== undefined));
    const options = ["previous", ...(earlier.length > 1 ? ["all"] : [])];
    const label = (choice) => ({
      previous: t("The shot before it (#{n})", { n: previous.end }),
      all: t("Every shot so far (#1–{n})", { n: previous.end }),
    }[choice]);
    const sub = (choice) => choice === policy || (choice === "previous" && policy === "all" && earlier.length === 1)
      ? t("Matches the global default, but remains an individual setting.")
      : t("Overrides the global default only for this segment.");
    const current = () => {
      if (!individual || excluded) return null;
      if (selected.size === earlier.length && earlier.length > 1) return "all";
      if (selected.size === 1 && selected.has(previous.end)) return "previous";
      return null;
    };
    const write = (next) => {
      if (this.storyboardClosed || this.overlay?.isConnected === false) return;
      if (this.timeline !== owner || S.serializeTimeline(owner) !== stamp
          || owner.segments[index] !== segment || S.passOf(owner, index)?.start !== index) {
        this.showStoryboardInfo(anchor, [t("Storyboard settings changed while this menu was open. Open it again to choose from the current sources.")]);
        return;
      }
      const inherit = next === undefined;
      if (JSON.stringify(segment.storyboard) === JSON.stringify(next)) return;
      const candidateSegment = { ...segment };
      if (inherit) delete candidateSegment.storyboard;
      else candidateSegment.storyboard = next;
      const candidate = { ...owner, segments: owner.segments.map((row, position) =>
        position === index ? candidateSegment : row) };
      const sourceNumbers = S.storyboardSheet(candidate, index).map(({ pass }) => `#${pass.end}`);
      const [globalScope, currentScope] = this.storyboardScopeLines(index);
      this.confirmStoryboardEdit(anchor, [
        t("Change storyboard setting for segment #{n}.", { n: index + 1 }),
        globalScope,
        t("Current segment setting: {setting}", { setting: currentScope }),
        inherit
          ? t("Removing the individual setting makes this segment follow the global storyboard setting again.")
          : next !== false
          ? t("Individual settings take priority over the global default.")
          : t("Turning the storyboard off only for this segment does not turn off the global setting."),
        sourceNumbers.length
          ? t("After this change, storyboard source videos: {which}.", { which: sourceNumbers.join(", ") })
          : t("After this change, the storyboard is off for this segment."),
        ...(inherit ? [] : [t("Future global changes will not change this segment’s individual setting.")]),
        ...this.storyboardEffectLines(candidate, [index]),
      ], () => {
        if (inherit) delete segment.storyboard;
        else segment.storyboard = next;
        this.commit();
      }, segment, index);
    };
    let close = () => {};
    const change = next => { close(); write(next); };
    const enabled = individual && !excluded;
    // A legal timeline can have 239 earlier sources. Page the source pills,
    // never the selected set, so even the largest picker needs no scrollbar.
    const typeScale = Number.parseFloat(window.getComputedStyle?.(document.documentElement)
      ?.getPropertyValue?.("--mmc-type")) || 1;
    const pageSize = typeScale > 1.25 ? 8 : 24;
    let sourcePage = Math.floor(Math.max(0, earlier.map(pass => selected.has(pass.end)).lastIndexOf(true)) / pageSize);
    const sourcePicks = el("div", { class: "mmc-board-picks" });
    const pageLabel = el("span");
    const previousPage = el("button", { class: "mmc-pill mmc-board-source-prev", text: t("Previous"),
      onclick: () => { if (sourcePage > 0) { sourcePage--; drawSources(); } } });
    const nextPage = el("button", { class: "mmc-pill mmc-board-source-next", text: t("Next"),
      onclick: () => { if ((sourcePage + 1) * pageSize < earlier.length) { sourcePage++; drawSources(); } } });
    const drawSources = () => {
      sourcePicks.replaceChildren(...earlier.slice(sourcePage * pageSize, (sourcePage + 1) * pageSize).map(pass => el("button", {
        class: "mmc-board-pick", role: "checkbox", "aria-checked": selected.has(pass.end),
        "data-storyboard-source": pass.end, disabled: !enabled,
        title: pass.segments.length > 1
          ? t("segments {first}-{last}, one pass", { first: pass.start + 1, last: pass.end })
          : t("segment {n}", { n: pass.end }),
        onclick: () => {
          if (!enabled) return;
          const next = new Set(selected);
          if (next.has(pass.end)) next.delete(pass.end); else next.add(pass.end);
          close();
          if (!next.size) {
            this.showStoryboardInfo(anchor, [t("Choose at least one source. To exclude this segment, use Advanced settings.")]);
            return;
          }
          write(all.filter(number => next.has(number)));
        },
      }, [el("span", { text: `#${pass.end}` })])));
      previousPage.disabled = sourcePage === 0;
      nextPage.disabled = (sourcePage + 1) * pageSize >= earlier.length;
      pageLabel.textContent = `${sourcePage + 1} / ${Math.ceil(earlier.length / pageSize)}`;
    };
    drawSources();
    const pop = el("div", { class: "mmc-pop mmc-board-local-pop", "data-capture-wheel": "true" }, [
      el("div", { class: "mmc-board-local-titlebar" }, [
        el("span", { text: t("This segment’s storyboard") + ` · #${index + 1}` }),
        el("button", { class: "mmc-close", "aria-label": t("Close"), onclick: () => close() }, [icon("close", 16)]),
      ]),
      el("div", { class: "mmc-board-local-header" }, [
        el("button", {
          class: "mmc-pill mmc-board-local-toggle mmc-board-individual-toggle",
          role: "switch", "aria-checked": individual,
          title: t("Turn off to follow the global storyboard. Turn on to choose sources only for this segment.")
            + "\n" + t("Turning on individual settings keeps these sources fixed even when the global setting changes."),
          onclick: () => change(individual ? undefined : defaults()),
        }, [el("span", { text: t("Individual setting") })]),
        el("p", { class: "mmc-board-local-status", text: excluded
          ? t("This segment is excluded in Advanced settings. Turn exclusion off to choose its sources.")
          : individual
          ? t("This segment uses an individual storyboard setting. It takes priority over the global default.")
          : t("This segment follows the global storyboard default, including future changes.") }),
      ]),
      el("div", { class: "mmc-board-local-layout" }, [
        el("div", { class: "mmc-board-local-sources" }, [
          el("div", { class: "mmc-opt-label", text: t("Storyboard sources") }),
          el("div", { class: "mmc-board-local-presets", role: "radiogroup", "aria-label": t("Storyboard sources") }, options.map(choice => el("button", {
            class: "mmc-opt", role: "radio", "aria-checked": current() === choice,
            "data-storyboard-choice": choice, disabled: !enabled,
            onclick: () => { if (enabled) change(choice === "all" ? [...all] : [previous.end]); },
          }, [el("span", { class: "mmc-opt-col" }, [
            el("span", { class: "mmc-opt-label", text: label(choice) }),
            el("span", { class: "mmc-opt-sub", text: sub(choice) }),
          ]), el("span", { class: "mmc-radio" })]))),
          el("div", { class: "mmc-board-local-custom" }, [
            el("div", { class: "mmc-opt-label", text: t("Or choose the shots") }),
            sourcePicks,
            ...(earlier.length > pageSize ? [el("div", { class: "mmc-board-local-pages" }, [previousPage, pageLabel, nextPage])] : []),
            ...(!individual ? [el("p", { class: "mmc-opt-sub", text: t("Individual setting is off. Source choices are available when it is on.") })] : []),
          ]),
        ]),
        el("div", { class: "mmc-board-local-detail" }, [
          ...(selected.size && !excluded ? [sheetDiagram(S.storyboardSheet(owner, index))] : []),
          storyboardGuidance([
            this.storyboardScopeLines(index)[0],
            t("Nine cells, shared out by how long each shot plays."),
            t("This setting only chooses source videos. Storyboard retention strength and carry-over wording remain shared for the whole piece."),
          ]),
        ]),
      ]),
      ...(individual ? [el("details", { class: "mmc-board-local-advanced", open: excluded }, [
        el("summary", { text: t("Advanced settings") }),
        el("button", {
          class: "mmc-pill mmc-board-exclude-toggle", role: "switch", "aria-checked": excluded,
          onclick: () => change(excluded ? defaults() : false),
        }, [el("span", { text: t("Exclude this segment regardless of the global setting") })]),
        el("p", { class: "mmc-opt-sub", text: t("Keep this segment off even if the global default changes later.") }),
      ])] : []),
    ]);
    document.body.appendChild(pop);
    placeNear(pop, anchor);
    close = dismissable(pop);
  }

  /**
   * The seam's source, chosen from the passes before this one.
   *
   * Passes rather than segments, because a pass is one generation and what it
   * leaves behind is one clip: a shot merged into the middle of one has no last
   * frame of its own to inherit. Stored as the number of the pass's last
   * segment, which is the frame it means and the card the user can point at.
   */
  pickContinueFrom(anchor, segment, index) {
    const earlier = this.earlierPasses(index);
    const options = earlier.map((pass, position) => {
      const previous = position === earlier.length - 1;
      if (pass.segments.length > 1) {
        return previous
          ? t("segments {first}-{last}, one pass — previous",
              { first: pass.start + 1, last: pass.end })
          : t("segments {first}-{last}, one pass", { first: pass.start + 1, last: pass.end });
      }
      return previous ? t("segment {n} — previous", { n: pass.end }) : t("segment {n}", { n: pass.end });
    });
    // Whatever is stored resolves to the pass that holds it, which is the frame
    // compile.py will actually reach for.
    const source = S.continueSource(segment, index);
    const current = earlier.findIndex((pass) => source > pass.start && source <= pass.end);

    openChoicePopover(anchor, {
      title: t("Segment {n} continues from", { n: index + 1 }),
      options,
      value: options[current >= 0 ? current : earlier.length - 1],
      onPick: (choice) => {
        const picked = earlier[options.indexOf(choice)];
        if (!picked) return;
        // The previous pass is the default, so choosing it is choosing to store
        // nothing — an absent key survives reordering with no bookkeeping.
        if (picked === earlier[earlier.length - 1]) delete segment.continue_from;
        else segment.continue_from = picked.end;
        this.commit();
      },
    });
  }

  /** The same localized view label is used on the card and its jump option. */
  cardLabel(segment) {
    return S.cardName(segment) || t(S.isClip(segment) ? "Clip" : "Segment");
  }

  /** Renaming writes only this card's view metadata, never its editor or prompt. */
  cardNameControl(segment, index) {
    const label = this.cardLabel(segment);
    const button = el("button", {
      class: "mmc-tl-card-name-button", type: "button", text: label,
      title: `${label}\n${t("Rename {name}", { name: label })}`,
      "aria-label": t("Rename {name}", { name: label }),
      onclick: (event) => {
        event.stopPropagation();
        if (this.timeline.segments?.[index] !== segment) return;
        let finished = false;
        const finish = (save, focus = false) => {
          if (finished) return;
          finished = true;
          const name = S.cardName({ extended_card_name: input.value });
          const current = host.isConnected && this.timeline.segments?.[index] === segment;
          if (save && current && name !== S.cardName(segment)) {
            if (name) segment.extended_card_name = name;
            else delete segment.extended_card_name;
            this.commit();
          } else host.replaceChildren(button);
          if (focus) {
            const target = this.stripHost?.querySelector(
              `[data-mmc-segment-index="${index}"] .mmc-tl-card-name-button`)
              ?? (host.isConnected ? button : null);
            target?.focus({ preventScroll: true });
          }
        };
        const input = el("input", {
          class: "mmc-tl-card-name-input", type: "text", maxlength: "80",
          value: S.cardName(segment), placeholder: t(S.isClip(segment) ? "Clip" : "Segment"),
          "aria-label": t("Rename {name}", { name: label }),
          // Removal can blur before the browser marks the host disconnected.
          // After this turn, the same identity/connection gate is authoritative.
          onblur: () => queueMicrotask(() => finish(true)),
          onkeydown: (key) => {
            key.stopPropagation();
            if (key.isComposing) return;
            if (key.key === "Enter" || key.key === "Escape") {
              key.preventDefault();
              finish(key.key === "Enter", true);
            }
          },
        });
        // The overlay already yields Escape to transient editing. This hidden
        // gate shares the input's lifetime, so no global listener can outlive it.
        const guard = el("span", {
          class: "mmc-pop mmc-tl-card-name-guard", "aria-hidden": "true",
          style: { display: "none" },
        });
        host.replaceChildren(input, guard);
        input.focus({ preventScroll: true });
        input.select();
      },
    });
    const host = el("span", {
      class: "mmc-tl-card-name",
      onpointerdown: (event) => event.stopPropagation(),
      onclick: (event) => event.stopPropagation(),
      ondblclick: (event) => event.stopPropagation(),
    }, [button]);
    return host;
  }

  /**
   * A supplied clip, as a card.
   *
   * The same shape as a shot's card and deliberately not the same skin: it is
   * not generated, so the things a shot's card carries — a prompt, a mode, a
   * reference count — have nothing to say here. What it shows instead is the
   * file, the window that plays, and whether its sound is on.
   */
  renderClipCard(segment, index) {
    const seconds = S.clipSeconds(segment);
    const name = (segment.filename || "").split("/").pop();
    const trimmed = Boolean(segment.trim);
    const scaled = this.geometry();

    return el("div", {
      class: "mmc-tl-card mmc-tl-clip",
      "data-mmc-segment-index": String(index),
      style: { width: `${cardWidth()}px` },
      ondblclick: () => this.editClip(index),
      onpointerleave: () => this.disarm(index),
    }, [
      el("div", { class: "mmc-tl-card-head" }, [
        el("span", { class: "mmc-tl-index", text: String(index + 1) }),
        this.cardNameControl(segment, index),
        el("button", { class: "mmc-tl-card-compiled mmc-pill",
          title: t("What the model reads"), "aria-label": t("What the model reads"),
          onclick: (event) => {
            event.stopPropagation();
            if (this.compiledView) return;
            this.compiledView = openCompiledPrompt(
              () => compiledFor(this.timeline, this.timeline.segments.indexOf(segment), this.pieceSeed(), () => this.onPromptCommit?.()),
              () => { this.compiledView = null; });
          },
        }, [icon("speech", 13)]),
        el("span", { class: "mmc-tl-mode mmc-tl-clip-tag", text: t("clip") }),
      ]),
      el("div", { class: "mmc-tl-card-prompt mmc-tl-clip-name", text: name, title: segment.filename }),
      el("div", { class: "mmc-tl-card-refs" }, [
        el("span", {
          class: "mmc-tl-dur",
          text: `${seconds.toFixed(1)} s`,
          // No off-distribution mark: nothing is sampled, so the trained
          // length has nothing to say about a clip.
          title: trimmed
            ? t("{s} s of {file}, from {start} s.",
                { s: seconds.toFixed(1), file: name, start: segment.trim.start.toFixed(2) })
            : t("All {s} s of {file}.", { s: seconds.toFixed(1), file: name }),
        }),
      ]),
      el("div", {
        class: "mmc-tl-card-meta",
        title: t("Supplied footage is played as it is — scaled to the render's size and "
               + "spliced in without being generated. It has not been through the model, "
               + "so its colour and grain will not match the shots around it."),
        text: [
          S.clipSize(segment) ? `${S.clipSize(segment).width}×${S.clipSize(segment).height} → ${scaled.width}×${scaled.height}` : null,
          S.clipSound(segment) ? t("sound") : t("silent"),
        ].filter(Boolean).join(" · "),
      }),
      el("div", { class: "mmc-tl-card-foot" }, [
        el("div", { class: "mmc-tl-card-transport" }, [
        el("button", {
          class: `mmc-ghost mmc-tl-clip-sound${segment.has_audio !== false && S.clipSound(segment) ? " on" : ""}`,
          "aria-pressed": segment.has_audio !== false && S.clipSound(segment),
          title: segment.has_audio === false
            ? t("This clip has no soundtrack.")
            : S.clipSound(segment) ? t("Playing with its own sound. Click to mute it.")
              : t("Playing silent. Click to use the clip's own sound."),
          disabled: segment.has_audio === false || undefined,
          onclick: () => {
            segment.sound = !S.clipSound(segment);
            this.commit();
          },
        }, [icon("audio", 13)]),
        el("button", {
          class: "mmc-ghost", text: "◀", title: t("Move earlier"),
          disabled: index === 0 || undefined,
          onclick: () => this.move(index, -1),
        }),
        el("button", {
          class: "mmc-ghost", text: "▶", title: t("Move later"),
          disabled: index === this.timeline.segments.length - 1 || undefined,
          onclick: () => this.move(index, 1),
        }),
        this.removeButton(index, t("Remove this clip")),
        ]),
        el("div", { class: "mmc-tl-card-edit-tools" }, [
          el("button", { class: "mmc-tl-edit", text: t("Trim"), onclick: () => this.editClip(index) }),
          el("button", {
            class: "mmc-tl-edit", text: t("Replace"),
            title: t("Put another file on this card. It keeps its place in the strip and its seams; "
                   + "the trim and crop go with the old file."),
            onclick: () => this.replaceClip(index),
          }),
          el("button", {
            class: `mmc-tl-edit${segment.crop ? " on" : ""}`, text: t("Crop"),
            title: cropLabel(segment.crop)
              || t("Crop the footage to part of the frame, or turn and mirror it, before it is scaled to the canvas"),
            onclick: () => this.editClipCrop(index),
          }),
        ]),
      ]),
      this.cardPreview(segment, index),
    ]);
  }

  /**
   * The one control on a card that says whether it is in the next render.
   *
   * One question with three answers, because what "not in it" means depends on
   * whether there is film: a card holding a take plays it, a card holding
   * nothing is simply not in this render and keeps everything set on it. There
   * is no second button for keeping a take — keeping *is* holding, and a take
   * that came back is kept by the same click that would have held the card
   * without one.
   *
   * `shots` is how many cards this one switch answers for. Past one it is a
   * whole pass and the switch is drawn on the rail rather than on a card: a
   * pass is one generation and there is no half of one to hold.
   */
  holdSwitch(index, shots = 1) {
    const segment = this.timeline.segments[index];
    const held = S.isHeld(segment);
    const take = S.takeOn(segment);
    const what = shots > 1 ? t("This pass") : t("This card");
    return el("button", {
      class: `mmc-ghost mmc-tl-hold${held ? (take ? " kept" : " unshot") : ""}`,
      title: held
        ? (take
          ? t("Locked: {what} plays the take it already has instead of being "
            + "generated. Unlock it to shoot it again — everything written on it "
            + "is still set.", { what })
          : t("Locked: {what} is not in the next render and has nothing to play "
            + "yet. Everything written on it is kept. Unlock it to shoot it.",
              { what }))
        : (take
          ? t("Unlocked: {what} is generated again by the next render. Lock it to "
            + "keep the take it just made — the cards after it go on continuing "
            + "from that file.", { what })
          : t("Unlocked: {what} is generated by the next render. Lock it to hold it "
            + "back and shoot the rest first — nothing written on it is lost.",
              { what })),
      onclick: (event) => {
        event.stopPropagation();
        if (held) delete segment.hold; else segment.hold = true;
        this.commit();
      },
    }, [icon(held ? "lock" : "lockOpen", 15)]);
  }

  /**
   * Lock the whole strip, or put all of it back.
   *
   * Two buttons rather than one that toggles: on a part-shot strip neither
   * "locked" nor "unlocked" is the state it is in, so a switch would have to
   * pick a side and would read as a lie half the time. Both stay in place and
   * go dead when they have nothing to do.
   *
   * Locking everything is how a shoot ends — nothing is generated and the
   * render writes the piece out of the takes it already has — so it goes dead
   * when there would be nothing to write with, which is the same thing the
   * strip would otherwise refuse a moment later.
   */
  holdAllPills() {
    const all = S.passes(this.timeline);
    const passes = all.filter((pass) => !S.isClip(pass.segments[0]));
    const loose = passes.filter((pass) => !S.isHeld(pass.segments[0]));
    const held = passes.length - loose.length;
    const nothingLeft = !passes.some((pass) => S.takeOn(pass.segments[0]))
      && !all.some((pass) => S.isClip(pass.segments[0]));
    return [
      el("button", {
        class: "mmc-pill mmc-tl-holdall",
        disabled: !loose.length || nothingLeft || undefined,
        title: !passes.length
          ? t("No generated cards to lock or unlock.")
          : !loose.length
          ? t("Every generated card is already locked.")
          : nothingLeft
          ? t("Nothing has been shot yet, so locking the strip would leave the next "
            + "render with nothing to make.")
          : t("Lock every card. Nothing is generated and the next render writes the "
            + "piece out of the takes it already has — which is how a piece shot a "
            + "card at a time is finished."),
        onclick: () => { if (S.holdAll(this.timeline, true)) this.commit(); },
      }, [icon("lock", 13), el("span", { text: t("Lock all") })]),
      // Every take whose file is gone, forgotten in one click: the strip a
      // cleared-out takes/ folder leaves behind is dead takes on every card.
      ...(passes.some((pass) => this.gone.has(S.takeOn(pass.segments[0])?.filename)) ? [el("button", {
        class: "mmc-pill mmc-tl-holdall mmc-tl-forget-gone",
        title: t("Forget every take whose file is no longer on disk. Those cards go "
               + "back to not shot — everything written on them is kept — and a "
               + "locked one stays out of the render until you unlock it."),
        onclick: () => { if (S.dropMissingTakes(this.timeline, this.gone)) this.commit(); },
      }, [el("span", { text: t("Forget missing takes") })])] : []),
      el("button", {
        class: "mmc-pill mmc-tl-holdall",
        disabled: !held || undefined,
        title: !passes.length
          ? t("No generated cards to lock or unlock.")
          : !held
          ? t("No generated cards are locked.")
          : t("Put every card back in the render. Takes are kept — a card that is "
               + "unlocked is simply shot again, and its take stands until the new "
               + "one lands."),
        onclick: () => { if (S.holdAll(this.timeline, false)) this.commit(); },
      }, [icon("lockOpen", 13), el("span", { text: t("Unlock all") })]),
    ];
  }

  /** The card's number is a readout. The explicit lock remains the control. */
  soloBadge(index) {
    return el("span", { class: "mmc-tl-index", text: String(index + 1) });
  }

  /**
   * What a locked card is locked *as*, in words.
   *
   * The lock says a card is out of the next render; it cannot also say whether
   * there is film. The skin draws that — solid because the take exists,
   * perforated because it has not been shot — and this names it, because a
   * picture nobody has been taught to read is not a label. Absent on a card
   * that is simply in the render with nothing rendered yet, which is the
   * ordinary state and the one a mark would only add noise to.
   */
  takeChip(index) {
    const segment = this.timeline.segments[index];
    const take = S.takeOn(segment);
    const held = S.isHeld(segment);
    if (!take) {
      return held ? el("span", {
        class: "mmc-tl-card-state",
        text: t("not shot"),
        title: t("Locked, with nothing rendered yet: this card is not in the next "
               + "render and nothing plays in its place. Everything written on it "
               + "is kept."),
      }) : null;
    }
    const [tone, name, why] = this.gone.has(take.filename)
      ? ["missing", held ? t("kept · file gone") : t("take · file gone"),
         t("The file this take was written to is not under output/ any more, so "
         + "there is nothing to play and the render would refuse this card by "
         + "name. Unlock the card to shoot it again, or forget the take.")]
      : this.edited?.has(index)
      ? ["stale", held ? t("kept · edited") : t("take · edited"),
         t("This take was made before you changed the card, so it is no longer "
         + "what the card describes. It still plays — shoot the card again to "
         + "replace it.")]
      : held
        ? ["kept", t("kept"),
           t("Locked, and playing the take it already has. The next render splices "
           + "this file in instead of generating it, and the cards after it go on "
           + "continuing from it.")]
        : ["ready", t("take ready"),
           t("This card rendered and the file is on disk. Lock the card to keep that "
           + "take and stop paying for it; leave it unlocked to shoot it again.")];
    // The chip names the take; the ✕ beside it is how the card stops having
    // one. Looking at a take and deciding against it is half of shooting a
    // piece in parts, and until now the only way to say so was to render over
    // it. Wearing the chip's own colour, because it acts on what the chip
    // says — and hidden until the card is under the pointer or the keyboard,
    // because a strip of takes is meant to read as film rather than as a row
    // of things to delete.
    return el("span", { class: `mmc-tl-card-state ${tone}`, title: why }, [
      el("span", { text: name }),
      el("button", {
        class: "mmc-tl-take-x",
        text: "✕",
        title: t("Forget this take. The card goes back to not shot; the file stays "
               + "under output/ — this only stops the card playing it."),
        onclick: (event) => {
          event.stopPropagation();
          if (S.dropTake(this.timeline, index)) this.commit();
        },
      }),
    ]);
  }

  renderCard(segment, index, pass) {
    if (S.isClip(segment)) return this.renderClipCard(segment, index);
    // Whether this card is a generation or a shot inside one. Everything below
    // that used to ask the timeline's render mode is really asking this.
    const shared = pass.segments.length > 1;
    // In a pass the shot does not snap to the grid on its own — the pass's
    // total does — so the card shows what the user set and the rail above it
    // shows the truth.
    const cardRules = rulesFor(S.pieceFamily(this.timeline));
    const frames = framesForSeconds(segment.duration_s, cardRules);
    const seconds = shared ? Number(segment.duration_s) || 0
      : secondsForFrames(frames, cardRules);
    // The segment's own references plus the piece references its text cites —
    // both ride into this generation, so the card counts both.
    // Whether this shot can be handed to the duration head, and whether it is.
    // Only alone: in a pass the length that is sampled is the pass's total, so
    // a per-shot switch would be offering the model a number nobody reads.
    const predicts = !shared && S.canDo(this.timeline, "duration");
    const autoLength = predicts && segment.auto_duration === true;
    const refs = S.references(segment).length + S.citedPool(segment).length;
    const loras = S.activeLoras(segment, S.pieceFamily(this.timeline),
      S.effectiveCheckpoints(segment, this.timeline)).length;
    const rewrite = segment.refined?.body?.trim() || Object.keys(segment.refined?.sections ?? {}).length;
    const using = rewrite && segment.refined.enabled !== false;

    const meta = [];
    // The sheet this card is shown counts as one of its pictures, and the
    // strip should say at a glance which cards see the piece.
    if (!shared && S.storyboardSheet(this.timeline, index).length) meta.push(t("storyboard"));
    if (loras) meta.push(t(loras === 1 ? "{count} LoRA" : "{count} LoRAs", { count: loras }));
    // A screen is set up inside the card and replaced after the render, so
    // nothing else on the strip would say this card has one.
    const screens = segment.screens?.length ?? 0;
    if (screens) meta.push(t(screens === 1 ? "{count} screen" : "{count} screens", { count: screens }));
    if (rewrite) meta.push(using ? t("refined") : t("refined (off)"));

    // Complete settings belong to this canonical generated card alone.
    const faceChip = S.canDo(this.timeline, "face") ? facesPill({
      target: segment, piece: this.timeline, className: "mmc-tl-card-face",
      valid: () => this.modal?.isConnected && this.timeline.segments?.includes(segment),
      commit: () => this.commit(),
    }) : null;
    // The card's motion fix: its own switch, not the piece's, because which
    // shots have a burst in them is a fact about the shots. Only a generated
    // shot on a family with the pass draws it.
    const fixable = !S.isClip(segment) && S.canDo(this.timeline, "motion_fix");
    const fixed = S.motionFix(segment, this.timeline);
    const motionChip = fixable ? el("button", {
      class: `mmc-tl-card-motion${fixed ? " on" : ""}`,
      text: fixed ? t("motion fix") : t("no motion fix"),
      title: fixed
        ? t("Where this shot moves too fast for the model, it is slowed down, re-drawn and put back on the clock after it renders — a second pass, about three times the shot's cost. Click to leave it as it renders.")
        : t("This shot is left as it renders. Click to have its fast motion slowed down, re-drawn and put back on the clock — a second pass, about three times the shot's cost."),
      onclick: (event) => {
        event.stopPropagation();
        if (fixed) delete segment.motion_fix;
        else segment.motion_fix = true;
        this.commit();
      },
    }) : null;

    // Which of the three things this card is: in the next render, playing the
    // take it already has, or not shot yet. The skin says which — solid because
    // the film exists, perforated because it does not — and the switch in the
    // head is where it is changed.
    // In a pass of several shots both are the pass's: it is one generation, so
    // it is held, kept and drawn as one piece of film. See `renderPass`.
    const skin = shared ? "" : holdSkin(segment, this.gone);
    const chip = shared ? null : this.takeChip(index);

    return el("div", {
      class: `mmc-tl-card${skin}`,
      "data-mmc-segment-index": String(index),
      style: { width: `${cardWidth()}px` },
      // Opening this editor is an explicit Edit action, never a background
      // double-click that can follow a missed status/delete control.
      onpointerleave: () => this.disarm(index),
    }, [
      el("div", { class: "mmc-tl-card-head" }, [
        this.soloBadge(index),
        this.cardNameControl(segment, index),
        // A text icon opens the actual generation prompt, not the raw card.
        el("button", { class: "mmc-tl-card-compiled mmc-pill", title: t("What the model reads"),
          "aria-label": t("What the model reads"), onclick: (event) => {
            event.stopPropagation();
            if (this.compiledView) return;
            this.compiledView = openCompiledPrompt(
              () => compiledFor(this.timeline, this.timeline.segments.indexOf(segment), this.pieceSeed(), () => this.onPromptCommit?.()),
              () => { this.compiledView = null; });
          } }, [icon("speech", 13)]),
        // The mode belongs to the generation; merged shots share their rail.
        ...(shared ? [] : [el("span", { class: "mmc-tl-mode",
                                       text: S.mode(segment, this.timeline) })]),
        // Whether this card is in the next render. On the head rather than in
        // the foot because it says what the card *is* to this queue, which is
        // the question the rest of this row answers — and because a pass of
        // several shots answers it once, on its rail, where a per-card switch
        // would be offering half a generation.
        ...(shared ? [] : [this.holdSwitch(index)]),
      ]),
      // Read-only size of the raw input, including all whitespace. Do not
      // expose a prompt excerpt or substitute an active generated rewrite.
      el("div", {
        class: "mmc-tl-card-count",
        text: t("{count} chars incl. spaces", {
          count: Array.from(String(segment.prompt ?? "")).length.toLocaleString("en-US"),
        }),
      }),
      el("div", { class: "mmc-tl-card-refs" }, [
        el("span", {
          class: "mmc-tl-card-ref-count",
          text: t(refs === 1 ? "{count} ref" : "{count} refs", { count: refs }),
        }),
        el("span", { class: "mmc-tl-card-frame-fact",
          text: `${shared || autoLength ? "~" : ""}${t("{fps} fps · {frames} frames", {
            fps: cardRules.fps,
            frames: (shared ? Math.round(seconds * cardRules.fps) : frames).toLocaleString("en-US"),
          })}`,
          ...(shared ? { title: t("{s} s of this pass — the frame count is the pass's.",
            { s: S.showSeconds(segment.duration_s) }) } : {}),
        }),
        // The off-distribution mark belongs to whatever is actually generated in
        // one go. Alone, that is this card; in a pass it is the pass, and
        // marking every card would say it about the wrong thing — the rail
        // carries it there instead.
        // The seconds, and on a family with a duration head the switch that
        // hands them over — the same control the shot's own editor carries,
        // in the one place a strip is actually laid out. A card on auto wears
        // the `~` for the same reason the strip's total does: the number is an
        // estimate until the render measures it, and it is still what the bar
        // and the queue guard count with. No off-distribution mark while it is
        // on, because that would be marking a length nobody has chosen yet.
        el(predicts ? "button" : "span", {
          class: `mmc-tl-dur${autoLength ? " auto" : ""}`
                 + (shared || autoLength || isTrainedLength(frames, cardRules)
                      ? "" : " off-distribution"),
          text: autoLength
            ? t("~{seconds} s", { seconds: S.showSeconds(segment.duration_s) })
            : t("{seconds} s", { seconds: S.showSeconds(segment.duration_s) }),
          title: shared
            ? t("{s} s of this pass — the frame count is the pass's.",
                { s: S.showSeconds(segment.duration_s) })
            : autoLength
              ? t("The model picks this shot's length when it renders, from its own "
                + "prompt. {seconds} s is the estimate the strip counts with until "
                + "then, and the length this card goes back to. Click to set it yourself.",
                  { seconds: S.showSeconds(segment.duration_s) })
              : (isTrainedLength(frames, cardRules)
                   ? t("{frames} frames at {fps} fps", { frames, fps: cardRules.fps })
                   : t("{frames} frames — outside the ~5–15 s the weights were trained on.",
                       { frames }))
                + (predicts
                     ? "\n" + t("Click to let the model pick this shot's length from its prompt.")
                     : ""),
          ...(predicts ? {
            onclick: (event) => {
              event.stopPropagation();
              segment.auto_duration = !autoLength;
              this.commit();
            },
          } : {}),
        }),
      ]),
      ...(meta.length || faceChip || motionChip || chip
        ? [el("div", { class: "mmc-tl-card-meta" }, [
            ...meta.map((text) => el("span", { text })),
            ...(chip || motionChip || faceChip ? [el("div", { class: "mmc-tl-card-status" }, [
              ...(chip ? [chip] : []),
              ...(motionChip ? [motionChip] : []),
              ...(faceChip ? [faceChip] : []),
            ])] : []),
          ])]
        : []),
      // The same per-shot override the editor exposed, now reachable from the
      // strip. A merged pass still samples on its first shot's seed; later
      // shots keep their own seed for prompt alternatives and for unmerging.
      el("div", {
        class: "mmc-tl-card-seed",
        onpointerdown: (event) => event.stopPropagation(),
        onclick: (event) => event.stopPropagation(),
        ondblclick: (event) => event.stopPropagation(),
      }, [segmentSeedPill({
        own: S.segmentSeed(segment),
        piece: this.pieceSeed(),
        taken: S.takeOn(segment)?.seed ?? null,
        onChange: (seed) => {
          if (seed === null) delete segment.seed; else segment.seed = seed;
          this.commit();
        },
      })]),
      el("div", { class: "mmc-tl-card-foot" }, [
        el("div", { class: "mmc-tl-card-transport" }, [
          el("button", {
            class: "mmc-ghost", text: "◀", title: t("Move earlier"),
            disabled: index === 0 || undefined,
            onclick: () => this.move(index, -1),
          }),
          el("button", {
            class: "mmc-ghost", text: "▶", title: t("Move later"),
            disabled: index === this.timeline.segments.length - 1 || undefined,
            onclick: () => this.move(index, 1),
          }),
          // Weighed against this card's own length, not a fresh card's: a copy of
          // a twenty-second shot costs twenty seconds of the budget.
          el("button", {
            class: "mmc-ghost", text: "⧉",
            title: S.addSegmentRefusal(this.timeline, segment.duration_s) ?? t("Duplicate"),
            disabled: S.addSegmentRefusal(this.timeline, segment.duration_s) ? true : undefined,
            onclick: () => this.duplicate(index),
          }),
          this.removeButton(index, t("Remove this segment")),
        ]),
        // The DOM follows the transport row / editing row layout so native
        // keyboard navigation visits controls in the same order as the eye.
        // Temporal Trim and spatial Crop remain in the same group, with the
        // explicit card editor last at its stable rightmost edge.
        el("div", { class: "mmc-tl-card-edit-tools" }, [
          ...(shared ? [] : this.takeTools(index, "mmc-tl-edit")),
          el("button", { class: "mmc-tl-edit mmc-tl-card-edit-action", text: t("Edit"), onclick: () => this.edit(index) }),
        ]),
      ]),
      this.cardPreview(segment, index, pass),
    ]);
  }

  /** Players are UI resources, not takes. Every rebuild/close releases them. */
  clearCardPreviews() {
    this.cardTitleFit?.disconnect();
    this.cardTitleFit = null;
    this.cardPreviewClose?.();
    this.cardPreviewClose = null;
    for (const player of this.cardPreviews ?? []) player.destroy();
    this.cardPreviews?.clear();
  }

  cardPreview(segment, index, pass = null) {
    if (!this.previewMode) return null;
    const source = cardPreviewSource({ timeline: this.timeline, segment, index, pass, gone: this.gone });
    if (!source) return el("div", { class: "mmc-card-preview-unavailable", role: "status",
      text: t("No ready video for this card.") });
    const label = this.cardLabel(segment);
    const player = createCardPreview(source, {
      key: segment.card_id || segment,
      label: t("Card preview — {name}", { name: label }),
      onOpen: (controller) => {
        this.cardPreviewClose?.();
        pauseCardPreviews();
        for (const inline of this.cardPreviews) inline.suspend();
        this.cardPreviewClose = openReferencePreview([{ kind: "video", filename: source.filename }], {
          caption: t("Card preview — {name}", { name: label }),
          returnFocus: controller.root.querySelector(".mmc-card-preview-stage"),
          playback: { source, key: segment.card_id || segment, label },
          onClose: () => {
            this.cardPreviewClose = null;
            for (const inline of this.cardPreviews) inline.resume();
          },
        });
      },
    });
    this.cardPreviews.add(player);
    return player.root;
  }

  // ---- actions ---------------------------------------------------------------

  add() {
    if (S.addSegmentRefusal(this.timeline)) return;
    this.timeline.segments.push(S.continuingSegment(this.timeline));
    this.commit();
  }

  /**
   * Cut a video already on disk into the piece.
   *
   * The same picker every other attachment goes through, so there is one asset
   * store and no second way to name a file. What is asked of the file after
   * that is its length and its shape — the length because the strip has to
   * price the card without opening it, the shape because the timeline's aspect
   * may come from it — and whether it has a soundtrack at all, which decides
   * what the card's sound switch is allowed to say.
   */
  async addClip() {
    if (S.addSegmentRefusal(this.timeline)) return;
    const segment = await this.pickClip(this.timeline);
    if (!segment) return;
    this.timeline.segments.push(segment);
    this.commit();
  }

  /**
   * Put another file on the clip card at `index`, where it stands.
   *
   * Removing a clip and adding one lands the new card at the end and loses
   * every seam that named the old one, so a clip in the middle of a continued
   * run had to be rebuilt by hand. Here the card keeps its place and its seam
   * — whether the shot before it runs in, the blend it spends, whether it
   * plays its sound — and so does every seam and storyboard that names it by
   * number. What belonged to the old file goes with it: its window and its
   * framing were set against that footage, and mean nothing on another.
   */
  async replaceClip(index) {
    const old = this.timeline.segments[index];
    // Priced without the card it replaces, which is giving its seconds back.
    const without = { ...this.timeline,
                      segments: this.timeline.segments.filter((_, i) => i !== index) };
    const fresh = await this.pickClip(without);
    if (!fresh) return;
    const kept = {};
    for (const key of ["continue", "continue_audio", "feather", "feather_pin", "sound"]) {
      if (key in old) kept[key] = old[key];
    }
    // A silent file cannot honour a sound switch left on by the one before it.
    if (fresh.has_audio === false) delete kept.sound;
    this.timeline.segments[index] = { ...fresh, ...kept };
    this.commit();
  }

  /**
   * One video from the picker, read into a clip card — or nothing, with the
   * reason on the strip. `budget` is the timeline the card is priced against.
   *
   * The window and framing chosen in the picker's own segment and crop editors
   * come through on the card: cutting a segment there is how you say which
   * seconds you want, and a card that played the whole file anyway would be
   * ignoring the one thing asked.
   */
  async pickClip(budget) {
    const chosen = await openPicker({
      selectionPurpose: "timeline-clip-source",
      kinds: ["video", "renders"], kind: "video", single: true,
      capacity: () => ({ used: 0, max: 1, filesLeft: 1 }),
    });
    if (!chosen?.length) return null;
    const picked = chosen[0];

    const probed = await probe(picked.path).catch(() => ({}));
    const segment = S.clipSegment({
      filename: picked.path,
      duration: probed.duration ?? 0,
      width: probed.width ?? 0,
      height: probed.height ?? 0,
      // null means the probe could not answer; the switch stays available and
      // the backend refuses a clip that turns out to be silent, which is a
      // better failure than greying out a control on a guess.
      hasAudio: probed.hasAudio !== false,
    });
    if (picked.trim) segment.trim = picked.trim;
    if (picked.crop) segment.crop = picked.crop;
    if (!segment.duration_s) {
      this.refineError = t("Could not read how long {file} is — a clip card needs its length.",
                           { file: picked.path });
      this.render();
      return null;
    }
    // Asked again with the card's real length — the window's if one was cut,
    // else the file's — rather than a default: a ten-minute clip and a
    // two-second one are not the same ask of the frame budget.
    const refusal = S.addSegmentRefusal(budget, S.clipSeconds(segment));
    if (refusal) {
      this.refineError = refusal;
      this.render();
      return null;
    }
    return segment;
  }

  /** The clip's window, through the same trim editor a reference video uses. */
  editClip(index) {
    const segment = this.timeline.segments[index];
    return this.trimFile(segment, segment.filename);
  }

  /** The clip's framing, through the same editor a reference picture uses. */
  editClipCrop(index) {
    const segment = this.timeline.segments[index];
    return this.cropFile(segment, segment.filename);
  }

  /** A kept take's window and framing. The take is spliced as a clip card —
   *  see `compile.take_spec` — so these are a clip's settings, held on the take
   *  rather than the card: a retake replaces the take and they go with it. */
  editTake(index) {
    const take = S.takeOn(this.timeline.segments[index]);
    return take && this.trimFile(take, take.filename);
  }

  editTakeCrop(index) {
    const take = S.takeOn(this.timeline.segments[index]);
    return take && this.cropFile(take, take.filename);
  }

  /** Writes `holder.trim`, a clip card or a take. */
  async trimFile(holder, path) {
    const picked = await openTrim({
      path,
      kind: "video",
      trim: holder.trim ?? null,
      // A clip card *is* the picture — its sound rides with it and is switched
      // on the card — so there is no track to choose here, unlike a reference
      // clip, which can be cited for one stream or the other.
      showTrack: false,
    });
    if (!picked) return;
    if (picked.trim) holder.trim = picked.trim;
    else delete holder.trim;
    this.commit();
  }

  /** Writes `holder.crop`. The canvas is offered as the lock; the holder's own
   *  trim bounds the scrub. */
  async cropFile(holder, path) {
    const { width, height } = this.geometry();
    const picked = await openPicture({
      path,
      kind: "video",
      crop: holder.crop ?? null,
      trim: holder.trim ?? null,
      aspect: width && height ? { ratio: width / height, label: t("canvas") } : null,
    });
    if (!picked) return;
    if (picked.crop) holder.crop = picked.crop;
    else delete holder.crop;
    this.commit();
  }

  /** Trim and Crop for a kept take, in the skin of the row they sit in. None
   *  for a card that is not kept, or whose file is gone: there is nothing on
   *  disk to scrub. */
  takeTools(index, skin) {
    const take = S.takeOn(this.timeline.segments[index]);
    if (!S.isKept(this.timeline.segments[index]) || this.gone.has(take.filename)) return [];
    return [
      el("button", {
        class: `${skin}${take.trim ? " on" : ""}`, text: t("Trim"),
        title: take.trim
          ? t("Plays {window} of the take. Click to change it.", { window: trimLabel(take) })
          : t("Play only part of the take"),
        onclick: () => this.editTake(index),
      }),
      el("button", {
        class: `${skin}${take.crop ? " on" : ""}`, text: t("Crop"),
        title: cropLabel(take.crop)
          || t("Crop the take to part of the frame, or turn and mirror it, before it is scaled to the canvas"),
        onclick: () => this.editTakeCrop(index),
      }),
    ];
  }

  duplicate(index) {
    if (S.addSegmentRefusal(this.timeline, this.timeline.segments[index].duration_s)) return;
    const copy = S.cloneSegment(this.timeline.segments[index]);
    // The take is not copied and neither is the hold. A take is the film one
    // card made, and a copy of the card has not been shot — carrying it over
    // would put the same seconds of picture on the strip twice under two
    // numbers, and the second one would claim to be done.
    delete copy.take;
    delete copy.hold;
    this.timeline.segments.splice(index + 1, 0, copy);
    // Every segment after the insertion moved down one card; a seam naming one
    // of them follows it. Nothing pointed at the clone a moment ago, and a seam
    // naming the original still does.
    S.remapContinueFrom(this.timeline, (n) => (n > index + 1 ? n + 1 : n));
    this.commit();
  }

  /**
   * The card's ✕, which asks twice. The first press turns it into the
   * question, in words, where the ✕ was; the second answers it. Anything else
   * — the pointer leaving the card, the strip redrawing for another reason —
   * puts the ✕ back, so a card is never left standing armed.
   */
  removeButton(index, title) {
    const stop = (event) => event.stopPropagation();
    if (this.armed === index) {
      return el("button", {
        class: "mmc-asset-x armed", type: "button", text: t("Really remove?"),
        title: t("Press again to remove it. Leave the card to keep it."),
        onpointerdown: stop,
        ondblclick: stop,
        onclick: (event) => { event.stopPropagation(); this.remove(index); },
      });
    }
    return el("button", {
      class: "mmc-asset-x", type: "button", text: "✕", title,
      onpointerdown: stop,
      ondblclick: stop,
      onclick: (event) => { event.stopPropagation(); this.armed = index; this.renderStrip(); },
    });
  }

  disarm(index) {
    if (this.armed !== index) return;
    this.armed = null;
    this.renderStrip();
  }

  remove(index) {
    this.armed = null;
    // The cast's pictures first, off the card and into the pool: they are the
    // members', and the members are staying.
    S.rescueCastFiles(this.timeline, this.timeline.segments[index]);
    this.timeline.segments.splice(index, 1);
    // A seam that named the removed segment falls back to the previous one;
    // one naming a later segment follows it up a card.
    S.remapContinueFrom(this.timeline,
      (n) => (n === index + 1 ? null : n > index + 1 ? n - 1 : n));
    this.commit();
  }

  /**
   * Reorder. A segment carries its continuation flag with it, and `syncTimeline`
   * clears it off whatever ends up first — a segment moved to the front has
   * nothing left to continue from. A named seam source follows the card it
   * points at, and `syncTimeline` likewise drops any source the swap carried
   * to or past its own seam.
   */
  move(index, delta) {
    const target = index + delta;
    const segments = this.timeline.segments;
    if (target < 0 || target >= segments.length) return;
    [segments[index], segments[target]] = [segments[target], segments[index]];
    S.remapContinueFrom(this.timeline,
      (n) => (n === index + 1 ? target + 1 : n === target + 1 ? index + 1 : n));
    this.commit();
  }

  /**
   * The LoRA manager, editing the timeline's own list.
   *
   * Handed the checkpoints the segments actually route to rather than one: a
   * global LoRA is patched onto every segment and the segments need not agree,
   * so "idle" here means it lands on none of them, not on the wrong one.
   */
  async openLoras(entry = null) {
    await openLoras({
      ...globalLoraOptions(this.timeline),
      // A legacy caller can still ask for one entry in the manager.
      reveal: entry?.name ?? null,
      onChange: () => this.commit(),
    });
    this.render();
  }

  /**
   * The fields a rewrite writes that belong to the piece rather than a shot:
   * the global prompt, the soundscape and the score.
   *
   * Straight into the timeline's own textareas, which are the ones the user is
   * looking at — a refined soundscape hidden inside a card would be invisible
   * and would then disagree with the box above it. The global prompt lands in
   * its own box the same way, and stays a live input: compile joins it in
   * front of every shot-scoped rewrite exactly as it joins it in front of
   * typed text, so editing it here keeps meaning something. An empty `music`
   * is left alone rather than written: the refiner returns one only when the
   * request asked for music, and clearing a score the user typed is not what
   * "the model had nothing to add" means.
   */
  takePiece(result) {
    // What was in them first, so `revertAll` can put them back. Taken once and
    // then left alone: refining again must not record the last rewrite's prose
    // as the thing the user typed. The prompt joins the snapshot the first
    // time a rewrite actually moves it — older snapshots simply lack the key,
    // and reverting one leaves the prompt exactly where it stands.
    const replaced = this.timeline.refined?.replaced
      ?? { soundscape: this.timeline.soundscape ?? "", music: this.timeline.music ?? "" };

    if (result.piece) {
      if (replaced.prompt === undefined) replaced.prompt = this.timeline.prompt ?? "";
      this.setGlobalPrompt(result.piece);
    }
    if (result.soundscape) {
      this.audioEdited("soundscape");
      this.timeline.soundscape = result.soundscape;
    }
    if (result.music) {
      this.audioEdited("music");
      this.timeline.music = result.music;
    }
    this.timeline.refined = {
      ...(this.timeline.refined || {}),
      replaced,
      // Only the reference form has these, and in one pass they describe the one
      // merged generation, so they are the timeline's. Chained, each reference
      // card carries its own set and they live on the card instead.
      ...(result.sections && S.isSingle(this.timeline) ? { sections: result.sections } : {}),
    };
    if (result.field === "all") delete this.timeline.refined.sections;
    this.soundscapeBox.value = this.timeline.soundscape ?? "";
    this.musicBox.value = this.timeline.music ?? "";
    this.updateSectionSummaries();
    this.onCommit?.();
  }

  /**
   * Throw away every rewrite in the strip and everything written alongside them.
   *
   * The counterpart of `refineAll`, and the only way back from it: a strip
   * refined in one press was queueing prose in place of every card's own
   * sentence, and undoing that card by card means opening every one of them.
   * The timeline's soundscape, score and reference sections go too — they were
   * written by the same call and describe rewrites that no longer exist.
   */
  revertAll() {
    for (const segment of this.timeline.segments) segment.refined = null;
    this.dropTimelineRewrite();
    this.commit();
  }

  /**
   * Drop what the refiner left on the timeline itself, once no card uses it.
   *
   * Reached from `revertAll` and from a single card's own Revert: the audio
   * fields and the reference analysis belong to the rewrite as a whole, so the
   * moment the last one is gone they are prose describing nothing. A card
   * reverted while others stay refined leaves them exactly as they are.
   */
  dropTimelineRewrite() {
    if (this.timeline.segments.some((segment) => segment.refined?.body
        || Object.keys(segment.refined?.sections ?? {}).length)) return;
    const replaced = this.timeline.refined?.replaced;
    if (replaced) {
      this.audioEdited("soundscape");
      this.audioEdited("music");
      this.timeline.soundscape = replaced.soundscape ?? "";
      this.timeline.music = replaced.music ?? "";
      // Only when a rewrite actually moved it — see `takePiece` — so reverting
      // an audio-only rewrite cannot blank a global prompt the user typed.
      if (replaced.prompt !== undefined) this.setGlobalPrompt(replaced.prompt);
      if (this.soundscapeBox) this.soundscapeBox.value = this.timeline.soundscape;
      if (this.musicBox) this.musicBox.value = this.timeline.music;
    }
    this.timeline.refined = null;
    this.updateSectionSummaries();
  }

  /**
   * Rewrite every card in one call.
   *
   * The point of doing the whole strip at once rather than card by card is that
   * a rewrite of shot 4 can only keep what shot 1 established if the same call
   * wrote both — the look, the people, the light and the speakers carry because
   * the model saw them, not because anything here copied them forward.
   */
  async refineAll(options) {
    this.refineError = null;
    const owner = this.timeline;
    const snapshot = S.serializeTimeline(owner);
    const structured = S.hasPromptSections(owner);
    const modal = this.modal;
    const fresh = () => this.timeline === owner && this.modal === modal
      && (!modal || modal.isConnected) && S.serializeTimeline(owner) === snapshot;
    try {
      const result = await refine({
        ...(structured ? { kind: "field", scope: "timeline", field: "all" } : { kind: "timeline" }),
        data: JSON.parse(snapshot),
      }, options);
      if (!fresh()) {
        if (this.timeline === owner && this.modal === modal && (!modal || modal.isConnected)) {
          this.refineError = t("The prompt changed while refining. No fields were changed.");
          this.renderBar();
        }
        return;
      }
      const seen = new Set();
      if (structured && (result.target_scope !== "timeline" || result.field !== "all" || result.scope !== "shot"
          || !Array.isArray(result.shots) || Object.hasOwn(result, "sections")
          || ["piece", "soundscape", "music"].some((key) => typeof result[key] !== "string"))) {
        throw new Error(t("the refiner returned an invalid result for this field"));
      }
      for (const shot of result.shots ?? []) {
        if (!Number.isInteger(shot.index) || !owner.segments[shot.index]
            || S.isClip(owner.segments[shot.index]) || seen.has(shot.index)
            || typeof shot.body !== "string") {
          throw new Error(t("the refiner returned an invalid result for this field"));
        }
        if (structured && (!Array.isArray(shot.fields) || [...shot.fields].sort().join(",") !== "prompt,retention_analysis,summary"
            || !shot.sections || Object.keys(shot.sections).sort().join(",") !== "retention_analysis,summary"
            || Object.values(shot.sections).some((value) => typeof value !== "string"))) {
          throw new Error(t("the refiner returned an invalid result for this field"));
        }
        seen.add(shot.index);
      }
      if (structured && seen.size !== owner.segments.filter((segment) => !S.isClip(segment)).length) {
        throw new Error(t("the refiner returned an invalid result for this field"));
      }
      for (const shot of result.shots ?? []) {
        const segment = this.timeline.segments[shot.index];
        if (!segment || (!shot.body && !structured)) continue;
        segment.refined = {
          body: shot.body,
          // The rewrite is the shot alone: compile joins the (rewritten) global
          // prompt in front of it, exactly as it joins it in front of typed
          // text, which is what keeps the global box live after refining.
          ...(result.scope ? { scope: result.scope } : {}),
          // Chained, a segment is its own generation over its own references,
          // so each reference card carries its own analysis sections in its
          // shot entry. In one pass there is one merged pool and the one
          // top-level set goes on the timeline instead — see `takePiece`.
          ...(shot.sections ? { sections: shot.sections } : {}),
          ...(structured ? { fields: [...shot.fields], sources: refineSources(segment) } : {}),
          ...(result.template ? { template: result.template, forced: !!result.forced } : {}),
          source: segment.prompt ?? "",
          model: refineModel(),
          enabled: true,
        };
      }
      this.takePiece(result);
      this.refineError = (result.problems ?? []).join(" · ") || null;
    } catch (error) {
      if (!fresh()) return;
      this.refineError = String(error.message || error);
    }
    this.commit();
  }


  /** The segment editor: the node's own body, over the strip. */
  edit(index) {
    const segment = this.timeline.segments[index];
    const cacheKey = segment.card_id || `segment-${index}`;
    const pass = S.passOf(this.timeline, index);
    const binding = JSON.stringify([index, S.pieceFamily(this.timeline), pass.start,
      pass.segments.map((card) => card.card_id)]);
    const cached = this.segmentEditors.get(cacheKey);
    if (cached?.state === segment && !cached.destroyed && cached.mmcSegmentBinding === binding) {
      cached.refreshReferences();
      this.showSegmentEditor(cached, index);
      return;
    }
    if (cached) {
      cached.destroy();
      this.segmentEditors.delete(cacheKey);
    }
    const shared = pass.segments.length > 1;
    const editor = new CreatorEditor({
      state: segment,
      structuredPrompt: S.hasPromptSections(this.timeline),
      // Which piece this card belongs to — the same answer the lone shot's
      // editor gets (`faceBody`). Without it the editor fell back to the card
      // itself, a segment carries no `family`, and every family-derived control
      // in the window was drawn as the default family: no auto-duration switch
      // on a family that has a duration head, H3's mode names over LTX's cards,
      // a weights pill for routes LTX does not have, and attach tools for
      // references the compiler would then refuse. The strip underneath had all
      // of it right, because it asks `this.timeline`.
      piece: this.timeline,
      // The shelf as well as the strip: writing `@ref-1` in this card is what
      // makes the pool chip say "in segment 3", and the shelf is the only place
      // that fact is ever shown. Redrawn on the card's own commits rather than
      // waiting for the window to close, because a readout that lags the thing
      // it reports on reads as one that does not work — the chip sat on "cited
      // nowhere yet" for the whole of the edit that cited it. It holds no caret
      // and nothing focusable, so rebuilding it under an open window costs
      // nothing. See `renderPool` and `S.poolCitations`.
      onCommit: (options) => {
        S.syncTimeline(this.timeline);
        this.onCommit?.(); this.renderStrip(); this.renderPool(); this.renderCast();
        this.refreshReferences(options);
      },
      onPromptCommit: () => {
        this.onPromptCommit?.();
        this.renderBar(); this.renderStrip(); this.renderPool(); this.renderCast();
        this.renderReferenceWarnings();
      },
      // A member typed into this card's prose is cast into the *piece* — where
      // the cast lives — and their files land in the piece's pool. The card is
      // where they are written, not where they are kept.
      castFromLibrary: (member) => this.castFromLibrary(member),
      // ...and the same answer to "whose cast is this". Without it the editor
      // looked the piece's subjects up on the segment, found none, and a name
      // clicked in a card opened nothing while deleting one took nobody out.
      castPiece: this.timeline,
      // The shelf is this window's, a few rows down — a card draws none of its
      // own, and a name pressed in it opens the member there.
      openCast: (handle) => this.openCastMember(handle),
      compiledPrompt: () => compiledFor(this.timeline, index, this.pieceSeed(), () => this.onPromptCommit?.()),
      // What a `{day|night}` in this card is chosen on: the card's own seed
      // where it was retaken on one, the piece's otherwise — the sampler's
      // rule — and the card's number, so two cards holding the same sentence
      // choose apart. See `compile.varied_piece`.
      varies: () => ({ seed: S.segmentSeed(segment) ?? this.pieceSeed(), card: index + 1 }),
      // Both belong to the timeline rather than to one shot: the canvas because
      // the segments are joined, the continuation because it describes the seam
      // in front of this segment and so does not exist for the first one.
      canvasPills: false,
      // The route belongs to the timeline, like the canvas: a clip whose shots
      // ran on different checkpoints per the same setting would not be one
      // setting. Read here, set from the node body's weights control.
      routeOf: () => this.timeline.models?.route ?? "auto",
      // Only where there is a seam to switch. A shot inside a pass has none —
      // it is a cut inside one generation, and continuity there is the model's
      // to keep rather than a wiring decision — and neither has shot 1.
      continuePill: index > 0 && S.passOf(this.timeline, index).start === index,
      // The card's seed is edited on the strip; the generic editor's optional
      // seedTarget stays unset here so the control has only one location.
      // One card, refined against the whole timeline: the server compiles the
      // strip to build this segment's payload, so the rewrite is written knowing
      // the global prompt, the canvas and whether this shot continues the last.
      refineTarget: () => ({
        kind: "segment",
        index,
        data: JSON.parse(S.serializeTimeline(this.timeline)),
      }),
      // Audio is edited/refined in its own timeline field, not this card.
      refineAudioFields: false,
      // This card, as a preset — the scope that makes the library worth opening
      // mid-edit. A card has no stage of its own and the piece's last render is
      // the whole piece rather than this shot, so there is nothing to take as a
      // cover automatically: one is set by hand from the gallery or not at all.
      presetTarget: () => ({
        scope: "shot",
        label: t(shared ? "Shot {n}" : "Segment {n}", { n: index + 1 }),
        // The piece's family: a card has no row and no weights of its own.
        family: () => S.pieceFamily(this.timeline),
        capture: () => ({
          data: P.captureShot(this.timeline, index, this.io()),
          defaultName: (segment.prompt || "").trim().split("\n")[0].slice(0, 48),
        }),
        apply: (body, keys, from) => {
          P.applyToShot(body, keys, segment, this.io(),
                        { from, piece: this.timeline });
          this.onCommit?.();
          this.renderStrip();
        },
      }),
      // Plain Refine and its Revert own this prompt only. Whole-piece audio
      // and global rewrite metadata belong exclusively to Refine all/Revert all.
    });

    editor.mmcSegmentBinding = binding;
    editor.mmcRetainRefineWhileHidden = true;
    this.segmentEditors.set(cacheKey, editor);
    this.showSegmentEditor(editor, index);
  }

  showSegmentEditor(editor, index) {
    const shared = S.passOf(this.timeline, index).segments.length > 1;
    // The same window the Creator's face opens: one shot's body over whatever
    // it was opened from. It was already this window in all but the code.
    this.editors.set(editor, openEditorSheet({
      title: t(shared ? "Shot {n}" : "Segment {n}", { n: index + 1 }),
      subtitle: t("of {count}", { count: this.timeline.segments.length }),
      headerTools: editor.structuredPrompt ? [editor.headerTools] : [],
      content: [editor.root],
      onClose: () => {
        this.editors.delete(editor);
        // Closing the sheet only hides this view. Keep its refine state with
        // the card so reopening it does not make an active request look idle.
        if (!this.storyboardClosed) this.render();
      },
    }));
  }
}

/** After-generate modes, in the order ComfyUI lists them. */

/**
 * The Timeline node's body in the graph: the piece at a glance, the way in, and
 * the sampler settings.
 *
 * The strip itself lives in the modal — it needs room the node does not have,
 * and drawing an editable one here would be a second implementation to keep in
 * step. What the node shows is the global prompt, the segments at their real
 * relative lengths, and the numbers.
 *
 * The sampler row is drawn as pills like everything else, and its values are in
 * the blob like everything else — `piece.sampling`, read and written through
 * `sampling.blobIO`. It was thirteen stock widgets until a second model family
 * made a static widget list untenable; those widgets are still declared, still
 * hidden, and now only the fallback that carries a workflow saved before the
 * move. The seed alone is still really a widget.
 */
export class TimelineBody {
  /** `preStage` and `face` are wiring the node supplies — see creator.js.
   *  `face` is where the piece-view pin is kept, which is a preference about
   *  this node rather than anything the render reads, so it lives on the node
   *  and not in the blob. */
  constructor({ read, write, widgets = {}, onWidgetChange, nodeId, runtimeKey = null,
                preStage = null, face = null, fullscreen = null, sections = null,
                tools = null }) {
    this.read = read;
    this.write = write;
    this.widgets = widgets;
    this.onWidgetChange = onWidgetChange;
    this.nodeId = nodeId;
    this.runtimeKey = runtimeKey;
    this.preStage = preStage;
    this.face = face;
    this.sections = sections;
    this.soundSnaps = new Set();
    // The way *into* the shell. The way out is the shell's own corner, and the
    // command and its keybinding have always existed — but a keystroke nobody
    // has been told about is not a door, and the setting in ComfyUI's own page
    // only decides what a *new* node opens as. So the face grows one.
    this.fullscreen = fullscreen;
    // A second way into the same shell, already turned to its existing tools
    // dashboard. Kept on the strip face only, not lent to shot editors.
    this.tools = tools;
    this.timeline = S.parseTimeline(read());
    // Persist identities before graphToPrompt reads the widget, including
    // migration of an old strip. They identify UI cards, not render content.
    if (S.ensureCardIds(this.timeline)) {
      // Add only ids here. Serializing all defaults before reload() adopts a
      // legacy node's sampling widgets would overwrite its actual settings.
      let raw;
      try { raw = JSON.parse(read()); } catch { raw = null; }
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        let migrated = false;
        if (Array.isArray(raw.segments)
            && raw.segments.length === this.timeline.segments.length) {
          raw.segments = raw.segments.map((card, index) => ({
            ...card, card_id: this.timeline.segments[index].card_id,
          }));
          migrated = true;
        } else if (!Array.isArray(raw.segments) && this.timeline.segments.length === 1) {
          raw.card_id = this.timeline.segments[0].card_id;
          migrated = true;
        }
        if (migrated) this.write(JSON.stringify(raw, null, 2));
      }
    }
    // The face's editor, when the piece is one shot and the face is wearing
    // one. Null the rest of the time — see `loneShot`.
    this.faceEditor = null;

    // The same stage the Creator has, showing the same thing: a timeline is one
    // clip, and what it is making is one picture whatever the strip looks like.
    // attach() floats it beside the node in a Satellite; it never mounts here.
    this.root = el("div", { class: "mmc-root" });
    this.queued = new Map();
    this.queueLookups = new Map();
    this.takeArrivals = new Map();
    this.takeSequence = 0;
    this.offSubmitted = watchSubmittedPrompts(
      (output) => this.submittedCards(output),
      (promptId, snapshot) => this.rememberQueued(promptId, snapshot));
    this.stage = new Stage({
      nodeId,
      runtimeKey,
      // A look for the finished render, where the family has the pass.
      onRestyle: S.canDo(this.timeline, "guide_lora") ? () => this.restyle() : null,
      // Which generation the queue is on, said over the preview: the strip runs
      // for minutes and a bare step count says nothing about where in the
      // piece the sampler is. Counted in passes, because that is what the
      // announcing node is one of. Read late — the strip may grow between
      // queueing and the announce.
      segmentLabel: (index) => t("Pass {n} of {count}",
        { n: index, count: S.passes(this.timeline).length }),
      // Every pass this render wrote, back onto the card that made it. The card
      // is not held by it: what came back is a take, and whether to keep it is
      // the point of looking at it. See `takeTakes`.
      onTakes: (reported, context) => this.takeTakes(reported, context),
      // View-only: a timeline's references live on its segments, so a pick from
      // here would have no card to land on. The Creator attaches; this browses.
      onGallery: () => openPicker({
        kinds: ["renders"],
        kind: "renders",
        viewOnly: true,
        capacity: () => ({ used: 0, max: 0, filesLeft: 0 }),
      }),
    });
    loadCatalog(() => this.adoptWeights());
    // ...and again behind the settings, which carry the other half of the
    // rescue: this machine's remembered picks. See `CreatorEditor`.
    primeSettings(() => this.adoptWeights());
    this.render();
  }

  destroy() {
    this.destroyed = true;
    this.offSubmitted?.();
    this.stage?.destroy();
    this.nodeSummaryFit?.disconnect();
    this.dropFaceEditor();
  }

  /** Only this node's submitted blob, not the strip currently on screen. */
  submittedCards(output) {
    const inputs = output?.[String(this.nodeId())]?.inputs;
    // The unified Creator and the legacy Timeline mount this same body.
    const raw = inputs?.creator_data ?? inputs?.timeline_data;
    if (typeof raw !== "string") return null;
    try {
      const parsed = JSON.parse(raw);
      const cards = S.asPiece(parsed)?.segments;
      // A mixed old/new blob must not turn off known ownership merely because
      // a *different* card has no id. Legacy recovery is per submitted slot.
      const legacy = Array.isArray(cards)
        ? cards.map((card) => typeof card?.card_id !== "string" || !card.card_id) : false;
      return S.queuedCards(S.parseTimeline(raw), { legacy });
    } catch { return null; }
  }

  rememberQueued(promptId, snapshot) {
    this.queued.set(String(promptId), snapshot);
    // Snapshots contain only ids/stamps. Old entries can be recovered from
    // history if a very large pending batch outlives this bounded notebook.
    while (this.queued.size > 128) this.queued.delete(this.queued.keys().next().value);
  }

  async takeTakes(reported, { promptId, prompt = null } = {}) {
    if (!promptId || this.destroyed) return;
    const id = String(promptId);
    const arrival = ++this.takeSequence;
    let snapshot = this.queued.get(id);
    if (!snapshot) {
      if (!this.queueLookups.has(id)) {
        this.queueLookups.set(id, (async () => {
          const output = prompt?.[2] ?? await submittedPrompt(id);
          return this.submittedCards(output);
        })().catch(() => null));
      }
      snapshot = await this.queueLookups.get(id);
      this.queueLookups.delete(id);
      snapshot = this.queued.get(id) ?? snapshot;
      if (!snapshot || this.destroyed) return; // Keep unowned results in history.
      this.rememberQueued(id, snapshot);
    }
    const applicable = reported.filter((report) => {
      const card = snapshot.ids[Number(report.segment) - 1];
      if (!card || (this.takeArrivals.get(card) ?? 0) > arrival) return false;
      // An older history lookup finishing after a newer report must not
      // overwrite that card's newer take. Other cards may still land normally.
      this.takeArrivals.set(card, arrival);
      return true;
    });
    if (S.attachTakes(this.timeline, applicable, snapshot)) this.commit();
    const live = new Set(this.timeline.segments.map((card) => card.card_id));
    for (const card of this.takeArrivals.keys()) {
      if (!live.has(card)) this.takeArrivals.delete(card);
    }
  }

  /** See `CreatorEditor.adoptWeights` — same rescue, same reason. */
  adoptWeights() {
    if (adoptWeights(this.timeline)) this.commit();
    else this.render();
  }

  /** Re-read the widget. Loading a saved workflow assigns widget values after
   *  the node is created, so the body built in `nodeCreated` saw the default. */
  reload() {
    // The sampler row moved off the widgets into the blob, and this is where a
    // workflow saved before that crosses over — here rather than in the
    // constructor, because that is the point at which both halves are final.
    // See `sampling.adopted`.
    const adopted_ = adopted(this.read(), this.widgets, S.parseTimeline, S.serializeTimeline);
    if (adopted_) this.write(adopted_);
    this.timeline = S.parseTimeline(this.read());
    if (S.ensureCardIds(this.timeline)) this.write(S.serializeTimeline(this.timeline));
    // The face editor closes over the segment object it was handed, and this is
    // a different one. Dropped rather than re-pointed: `render` builds another
    // against whatever the strip now holds.
    this.dropFaceEditor();
    this.render();
  }

  /**
   * Whether this piece is one shot and nothing else — the rule that picks the
   * face.
   *
   * **The face is the smallest one that can show everything this piece has
   * set.** One segment is not enough on its own: a piece can carry a global
   * prompt, a reference pool, LoRAs patched onto every shot and the two
   * Context-IR audio fields, and none of those has anywhere to live on a face
   * that is one shot's editor. A face that cannot draw a field it still queues
   * is a trap, so the presence of any of them takes the strip face instead.
   *
   * That is also why there is no way back other than emptying them: collapsing
   * is what setting them does, run backwards. Nothing is stored and nothing is
   * toggled — this is asked on every render.
   *
   * A supplied clip is not a shot. A piece of one clip has no generation to put
   * on the face at all, so it keeps the strip.
   */
  /**
   * Which face this node is actually wearing.
   *
   * The content rule below decides what the face *can* be; this is what it is.
   * A piece of one shot can be shown either way and the pin says which — asked
   * for, because a piece holds things a shot does not and there would otherwise
   * be no way to reach them: you would need a second shot before you could set
   * the standing prompt that the second shot is for.
   *
   * The pin only ever adds the strip. It cannot take one away, so the guarantee
   * the content rule makes — that a face never hides a field it still queues —
   * is not something a preference can switch off.
   */
  showsStrip() {
    return !this.loneShot() || !!this.face?.pinned();
  }

  loneShot() {
    const piece = this.timeline;
    return piece.segments.length === 1
      && !S.isClip(piece.segments[0])
      && !(piece.prompt || "").trim()
      && !(piece.soundscape || "").trim()
      && !(piece.music || "").trim()
      && !(piece.assets?.length)
      && !this.heldLoras().length;
  }

  /** The piece LoRAs the shot face has no slot for. The turbo entry is not one
   *  of them: it lives on the piece because turbo is a run-level switch, but
   *  the shot face wears it in full — the lit turbo pill names the file, the
   *  quality picker sets its steps, the weights popover picks it. Counting it
   *  here made throwing turbo on the Creator face flip the node onto the strip
   *  and hold it there, which read as a face that could not be left. */
  heldLoras() {
    const turboFile = this.timeline.turbo?.lora;
    return (this.timeline.loras ?? []).filter((entry) => entry.name !== turboFile);
  }

  /** The editor this body is currently wearing, if it is wearing one. Named to
   *  match `PreStageBody.editor`: both are a body that sometimes *is* a
   *  `CreatorEditor` and sometimes holds one. */
  get editor() { return this.faceEditor; }

  /** The piece-view toggle's wiring, for whichever face is drawing it. Null when
   *  the piece has more than one shot: there is no shot face for it to go back
   *  to, so a control offering one would be a lie. */
  pieceView() {
    if (!this.face) return null;
    if (this.emptyPiece()) {
      // Nothing on the strip is a shot not yet written: going back to the shot
      // face starts the blank one it edits.
      return {
        shown: () => true,
        toggle: () => { this.firstShot(); this.face.pin(false); this.commit(); },
      };
    }
    if (!this.loneShot()) return null;
    return {
      shown: () => this.showsStrip(),
      toggle: () => { this.face.pin(!this.face.pinned()); this.render(); },
    };
  }

  /** A strip with every card deleted and nothing set on the piece either. It
   *  stays empty — the strip window shows its add tile — until the face is
   *  turned back to a shot, which is the one thing that puts a card on it. */
  emptyPiece() {
    return !this.timeline.segments.length && !this.pieceHolds().length;
  }

  dropFaceEditor() {
    this.faceEditor?.destroy();
    this.faceEditor = null;
  }

  /**
   * The one shot's editor, on the node's face.
   *
   * The Creator node's body, unchanged, because it *is* the Creator node's body
   * — the same class the strip opens a card with, mounted on the face instead of
   * in a window. What it is told that a card is not: it owns the node (so it
   * draws the sampler row, the weights pill and the stage), and its canvas and
   * weights live one level up on the piece.
   *
   * Built once per segment object and kept, because it holds a contenteditable
   * with a caret in it: rebuilding it on every commit would take the caret away
   * mid-sentence, which is the whole reason `CreatorEditor` refills hosts rather
   * than re-rendering itself.
   */
  faceBody() {
    const segment = this.timeline.segments[0];
    if (this.faceEditor?.state === segment) return this.faceEditor;
    this.dropFaceEditor();
    this.faceEditor = new CreatorEditor({
      state: segment,
      // The canvas, the weights and the turbo switch are the piece's, exactly as
      // they are for a strip of twenty. Being the only shot changes nothing
      // about where they live — which is what makes growing a second one a
      // matter of adding a card and not of moving any settings.
      piece: this.timeline,
      // The face's rail is the family's stack — it is where a pin is made.
      pinFamily: () => S.pieceFamily(this.timeline),
      // The face is wearing the piece's only card, and the piece is what a cast
      // member is cast into — see the window's own hook of the same name.
      castFromLibrary: (member) => {
        const subject = P.addSubjectToPiece(member, this.timeline);
        if (!subject) return null;
        this.commit();
        return subject.handle;
      },
      onCommit: () => this.commit(),
      onPromptCommit: () => this.commitPrompt(),
      // The face wears the piece's first card, so that is the pass it shows.
      compiledPrompt: () => compiledFor(this.timeline, 0, this.pieceSeed(), () => this.commitPrompt()),
      // The face wears card 1, and a `{day|night}` on it chooses as card 1.
      varies: () => ({ seed: S.segmentSeed(segment) ?? this.pieceSeed(), card: 1 }),
      samplingWidgets: this.widgets,
      onWidgetChange: this.onWidgetChange,
      nodeId: this.nodeId,
      // The node's, so a render lands in the satellite the body already owns
      // rather than in a second stage listening for the same previews.
      stage: this.stage,
      setRoute: (route) => { this.timeline.models.route = route; this.commit(); },
      preStage: this.preStage,
      fullscreen: this.fullscreen,
      pieceView: this.pieceView(),
      // The piece's, not this shot's: the face is wearing the only card, but
      // what you save from a node is the node. Growing a second shot changes
      // nothing about it, which is the same promise the canvas and the weights
      // already make.
      presetTarget: () => this.presetTarget(),
      // The piece's, for the same reason: the face is wearing the only card,
      // but what Clear empties is the node.
      clearTool: () => [this.clearTool()],
      // One card's prompt, with the piece supplied as read-only context.
      refineTarget: () => ({
        kind: "segment",
        index: 0,
        data: JSON.parse(S.serializeTimeline(this.timeline)),
      }),
      // Manual audio fields remain available. Plain Refine never writes them.

      // The next shot, as a pill in the row that already carries the piece's
      // other two controls. See `CreatorEditor.renderGrowPill`.
      growShot: {
        full: () => this.timeline.segments.length >= S.MAX_SEGMENTS,
        fullTitle: () => t("This piece is at its limit of {count} shots.",
                           { count: S.MAX_SEGMENTS }),
        add: () => this.growIntoStrip(),
      },
    });
    // Whether the view this body is drawn in starts with the cast shelf
    // folded, carried onto the editor that was just built for it — see
    // `Fullscreen.setCastDefault`. Undefined on the canvas, which is the
    // answer the face wants anyway.
    this.faceEditor.castDefaultOpen = this.castDefaultOpen;
    return this.faceEditor;
  }

  /**
   * One shot becomes two, and the strip opens over it.
   *
   * The face does not mutate behind the user. They have been writing in the box
   * on it, and replacing that box with a summary at the moment they ask for more
   * room would be taking the writing surface away as a reward for wanting one.
   * So the window arrives instead: card 1 is the shot they wrote, card 2 is the
   * new one, open and ready. They watch the promotion happen in the place the
   * new thing lives, and the face has changed by the time they close it.
   *
   * The new card is `continuingSegment` — a live seam on both tracks with a
   * medium blend — because that is already what appending to the strip gives
   * you, and the face must not be a second answer to a question the strip has
   * answered.
   */
  growIntoStrip() {
    if (this.timeline.segments.length >= S.MAX_SEGMENTS) return;
    this.timeline.segments.push(S.continuingSegment(this.timeline));
    this.commit();
    this.open({ edit: this.timeline.segments.length - 1 });
  }

  /** The library as a look picker, this render's frame in the wipe; a pick
   *  writes the guide-LoRA block and queues the node — see `restyle.js`. */
  restyle({ queue = true } = {}) {
    const source = stageSource(this.stage?.result);
    return openRestyle({
      target: this.timeline, family: S.pieceFamily(this.timeline),
      frame: source ? stillUrl(source) : null,
      commit: () => this.commit(),
      nodeId: queue ? this.nodeId : null,
    }).then(() => this.render());
  }

  commit() {
    S.syncTimeline(this.timeline);
    S.ensureCardIds(this.timeline);
    // Removing or disabling the turbo LoRA anywhere — the global stack's
    // manager included — is switching turbo off, and the sampler row has to
    // come back before the blob is written with `on` still in it.
    Turbo.sync(this.timeline, this.widgetIO());
    this.write(S.serializeTimeline(this.timeline));
    this.render();
  }

  /** A prompt-only change must not settle seams, pins or sampler settings. */
  commitPrompt() {
    this.write(S.serializeTimeline(this.timeline));
    // A strip summary is read-only. The shot face's editor has already refreshed
    // its own prompt panel, and a full editor render would settle unrelated pins.
    if (this.showsStrip()) this.render();
    else this.onRender?.();
  }

  /**
   * What the preset library can save from this node and apply back to it.
   *
   * The cover comes off the stage rather than being asked for: the `executed`
   * message stamped with this node's id is already sitting in `stage.result`, so
   * the render this preset was saved from is the render on the card. Nothing to
   * guess and no best frame to pick — and it only ever fills a cover, never
   * replaces one somebody chose.
   *
   * Apply goes through `commit`, which is what runs `syncTimeline`: a restored
   * strip whose durations can no longer afford their seams has them pruned on
   * the way in, rather than failing at queue time.
   */
  presetTarget() {
    return {
      scope: "piece",
      label: t("this piece"),
      family: () => S.pieceFamily(this.timeline),
      vae: () => this.timeline.models?.vae ?? "",
      families: () => castFamilies(S.pieceFamily(this.timeline), this.timeline.models?.vae ?? "",
                                  rememberedWeights()),
      // See `Timeline.pieceTarget`: the scissors in the library's attach flow.
      // Built here rather than borrowed — `poolPlate` is the window's, and
      // this target is the node body's.
      plate: () => {
        const spec = S.plateSpec(this.timeline, this.frame());
        return spec ? { ...spec, sheet: false } : null;
      },
      capture: () => ({
        data: P.capturePiece(this.timeline, this.widgetIO()),
        cover: P.coverFromResult(this.stage?.result),
        defaultName: (this.timeline.prompt || this.timeline.segments[0]?.prompt || "")
          .trim().split("\n")[0].slice(0, 48),
      }),
      apply: (body, keys, from) => {
        P.applyToPiece(body, keys, this.timeline, this.widgetIO(), { from });
        this.commit();
      },
    };
  }

  /** The strip, over the node. `edit` opens a card's window with it — what the
   *  face does on the way from one shot to two, so the new card is where the
   *  writing already is. */
  open({ edit = null } = {}) {
    openTimeline({
      timeline: this.timeline,
      onCommit: () => this.commit(),
      onPromptCommit: () => this.commitPrompt(),
      sections: this.sections,
      soundSnaps: this.soundSnaps,
      edit,
      // Lent so a card's preset can carry the sampler row — see `Timeline.io`.
      io: () => this.widgetIO(),
    });
  }

  value(name, fallback) {
    return this.widgetIO().value(name, fallback);
  }

  /** The number the node will queue — the modal's `pieceSeed`, on the body:
   *  the seed is the one sampler setting that is still a widget, and this is
   *  the class that holds the widgets. */
  pieceSeed() {
    return Number(this.value("seed", 0)) || 0;
  }

  /** The sampler row's `{value, set}` pair.
   *
   *  Still called `widgetIO` everywhere that draws the row, and still answers to
   *  the same names, but the values live in the piece now rather than on the
   *  node — see `sampling.blobIO`. The seed is the exception and stays a widget.
   */
  widgetIO() {
    return blobIO(
      () => this.widgets,
      () => this.timeline.sampling,
      // Written straight out rather than through `commit`: commit calls
      // `Turbo.sync`, which sets pills, which would come back here — and the
      // pair would bounce between them. Nothing else in commit applies to a
      // sampler setting anyway; `syncCanvas` is about the strip.
      (block) => { this.timeline.sampling = block; this.write(S.serializeTimeline(this.timeline)); },
      () => this.onWidgetChange?.());
  }

  /** Write the row. Through the same pair as the turbo switch and the preset
   *  menu — the values are in the blob, and the seed rides on to its widget from
   *  there. `blobIO` does not redraw on write; this body does. */
  set(name, value) {
    this.widgetIO().set(name, value);
    this.render();
  }

  render() {
    // One shot wears its own editor; anything more wears the strip's summary.
    // Which of them, on every render, off `loneShot` — there is no mode stored
    // anywhere and nothing to get out of step with the piece.
    if (!this.showsStrip()) {
      const editor = this.faceBody();
      editor.render();
      // The editor's root *is* the body here — it brings its own rail, panel
      // and sampler row, and its `growShot` puts the next shot in the tail of
      // the pill row.
      if (this.root.firstChild !== editor.root) this.root.replaceChildren(editor.root);
      // The editor's root is a body in its own right, padding and all. Hosting
      // it inside another one would inset the face twice — which is a narrower
      // face than the strip's on a node of the same width, and it showed as the
      // sampler pills wrapping a row earlier here than there.
      this.root.classList.add("hosting");
      this.nodeSummaryFit?.disconnect();
      // A host drawing something derived from this piece — the editor's empty
      // frame — has no other way to hear that the canvas or the length changed.
      this.onRender?.();
      return;
    }
    this.root.classList.remove("hosting");
    this.dropFaceEditor();
    // Same order as the Creator: the rail, what you are asking for, then how it
    // is run. The picture is beside the node, in the satellite.
    this.root.replaceChildren(this.renderRail(), this.renderPanel(),
                              // Wrapped rather than mounted bare: the fullscreen shell folds
                              // the sampler away in its simple view by this class, and a bar
                              // parented straight to the root gave it nothing to fold.
                              el("div", { class: "mmc-sampling-host" }, [this.renderSampling()]));
    this.nodeSummaryFit?.disconnect();
    this.nodeSummaryFit = observeTimelineSummary(this.summaryStats);
    this.onRender?.();
  }

  /**
   * The picture this piece is about to make: the canvas, and how long it runs.
   *
   * For a host that has to draw the frame before there is anything in it — the
   * fullscreen shell's dock, which is a column of nothing until the first
   * render lands. A lone shot answers through the editor on its face, because
   * that shot's canvas can be a reference's rather than the piece's; a strip
   * answers from the geometry its summary already prints.
   */
  frame() {
    if (!this.showsStrip()) return this.faceBody().frame();
    const { width, height } = timelineGeometry(this.timeline);
    return { width, height, seconds: S.timelineSeconds(this.timeline) };
  }

  /**
   * The Creator's rail, on the Timeline node.
   *
   * The same two clusters and the same reading: everything on the left acts on
   * this piece, the pair on the right belongs to the machine. What differs is
   * only what "a reference" means here — a Timeline has no single generation to
   * attach one to, so the three add tools fill the *piece's* reference pool,
   * the one the modal's shelf shows. A pool asset rides into exactly the
   * segments whose text cites its @handle, so attaching one here is the first
   * half of the job and the citation is the second; the tools say so rather
   * than leaving a file attached to nothing with no hint of what is missing.
   *
   * The LoRA tool manages the timeline's own stack, which is patched onto every
   * segment — the same stack the modal's LoRAs pill opens.
   */
  renderRail() {
    const tool = (label, iconName, title, onclick, props = {}) =>
      el("button", { class: "mmc-tool", title, onclick, ...props },
         [el("span", { class: "mmc-tool-icon" }, [icon(iconName)]), el("span", { text: t(label) })]);

    // The pool is references, so it is gone on a family that reads none — see
    // `CreatorEditor.renderRail` for why gone rather than greyed. The sound
    // lane is not affected and is not here: a track is laid on the piece's
    // clock, not attached to a shot.
    const takesRefs = S.takesReferences(this.timeline);

    return el("div", { class: "mmc-rail" }, [
      el("div", { class: "mmc-rail-group" }, [
        // The strip face's view controls belong to the rail, not among the
        // generation's numeric readouts. The same callbacks and capability
        // gates as their former pills, dressed as the surrounding tools.
        ...(this.fullscreen ? [tool("Fullscreen", "expand",
          t("Draw this piece over the whole window. The node stays in the graph "
            + "and is queued exactly as it is now; Escape brings you back."),
          () => this.fullscreen(), { class: "mmc-tool mmc-tool-expand" }),
          el("span", { class: "mmc-tool-view-divider", "aria-hidden": "true" })] : []),
        // Per kind — see `CreatorEditor.renderRail`. A family whose references
        // are a sheet of stills offers the image tool alone.
        ...(takesRefs ? [["image", "Add image", "image"], ["video", "Add video", "video"],
                         ["audio", "Add audio", "audio"]]
                          .filter(([kind]) => S.takesKind(this.timeline, kind))
                      : []).map(([kind, label, iconName]) =>
          tool(label, iconName,
               t("Attach a {kind} to the whole piece. Cite its @handle in a segment's "
               + "prompt — or in the global one, for every segment — to use it there.",
                 { kind: t(kind) }),
               () => this.addPoolAssets(kind))),
        tool("Add LoRA", "effect",
             t("Manage the LoRAs patched onto every segment of this timeline"),
             () => this.manageLoras()),
        // End of the cluster, and the end of the piece: everything above it
        // adds to the scene, and this is the one that takes the scene back.
        this.clearTool(),
        ...(this.preStage ? [this.renderPreStageTool()] : []),
        ...(this.tools ? [tool("Tools", "panel", t("Tools"),
          () => this.tools(), { class: "mmc-tool mmc-tool-expand mmc-tool-tools" })] : []),
      ]),
      el("div", { class: "mmc-rail-group" }, [
        tool("Presets", "star",
             t("Save this setup so you can put it back, or apply one you saved before"),
             () => openPresetLibrary({ target: this.presetTarget() }).then(() => this.render())),
        tool("Gallery", "gallery",
             t("Browse, organize and attach finished renders and pre-stage stills"),
             () => openPicker({
               kinds: ["renders"], kind: "renders", viewOnly: true,
               capacity: () => ({ used: 0, max: 0, filesLeft: 0 }),
             })),
        tool("Settings", "gear",
             t("Preferences for this ComfyUI — output quality. Not saved into the workflow."),
             // Re-rendered on close: the page can change what the sampler row
             // draws (the shift pills' visibility), and Done should look done.
             () => openSettings().then(() => this.render())),
      ]),
    ]);
  }

  /**
   * Start the next scene: empty what was written, keep the machine.
   *
   * Built here for both faces — the strip's rail draws it directly, and the
   * lone shot's is handed the same factory — because what it empties is the
   * piece either way, and the shot editor holds one card of one.
   */
  clearTool() {
    return clearButton({
      written: S.pieceWritten(this.timeline),
      // Nothing else to do about the hosted editor: the strip is a new array of
      // new cards, and `faceBody` rebuilds off exactly that identity.
      run: () => { S.clearPiece(this.timeline); this.commit(); },
    });
  }

  /** The piece's reference pool, filled from the node body. The same entry the
   *  modal's own "+ Add" builds — see `Timeline.addPoolAssets`, which this is
   *  the node-side twin of. */
  async addPoolAssets(kind) {
    const chosen = await openPicker({
      selectionPurpose: "timeline-node-pool-files",
      kinds: [kind, "renders", "refmods"],
      kind,
      referenceOptions: {},
      capacity: () => ({ used: 0, max: S.refCaps(this.timeline).files, filesLeft: S.refCaps(this.timeline).files }),
      // `sheet` off, as on the modal's pool picker: the pool serves many
      // segments, so loose pictures stay loose and Connect builds a sheet.
      ...(kind === "image" && S.plateSpec(this.timeline, this.frame())
        ? { plate: { ...S.plateSpec(this.timeline, this.frame()), sheet: false } } : {}),
    });
    if (!chosen?.length) return;
    for (const picked of chosen) {
      // As on the modal's own "+ Add": a sheet is one pool reference, numbered
      // the pool's way. See `Timeline.addPoolAssets`.
      if (picked.plate) {
        this.timeline.assets.push(S.plateEntry(
          picked, S.takenHandles(this.timeline), { plate: "ref", panel: "ref" }));
        continue;
      }
      const entry = {
        handle: S.nextPoolHandle(this.timeline),
        kind: picked.kind,
        role: "reference",
        filename: picked.path,
        ref_size: picked.ref_size ?? "max",
      };
      if (picked.kind === "video") entry.track = S.trackFor(picked);
      if (picked.takes) entry.takes = S.takes({ ...entry, takes: picked.takes });
      if (picked.trim) entry.trim = picked.trim;
      if (picked.crop) entry.crop = picked.crop;
      this.timeline.assets.push(entry);
    }
    this.commit();
  }

  async manageLoras(entry = null) {
    await openLoras({
      ...globalLoraOptions(this.timeline),
      reveal: entry?.name ?? null,
      onChange: () => this.commit(),
    });
    this.commit();
  }

  renderPanel() {
    const segments = this.timeline.segments;
    const single = S.isSingle(this.timeline);
    const passes = S.passes(this.timeline);
    probeAspectSizes(this.timeline, () => this.render());
    const { width, height, ratio, fromInput } = timelineGeometry(this.timeline);
    const rules = rulesFor(S.pieceFamily(this.timeline));
    const prompt = (this.timeline.prompt || "").trim();
    const globalLoras = S.activeGlobalLoras(this.timeline);
    const audio = [
      ...(this.timeline.soundscape?.trim() ? [t("soundscape")] : []),
      ...(this.timeline.music?.trim() ? [t("music")] : []),
    ];

    this.summaryStats = timelineSummary(this.timeline);
    this.summaryStats.classList.add("mmc-tl-node-stats");
    return el("div", { class: "mmc-panel mmc-tl-summary" }, [
      // The prompt's room, not the prompt: the text is clamped to six lines
      // (see the stylesheet for why), so this wrapper is what soaks up the
      // panel's free height on a tall node — the stats and the pills dock to
      // the bottom, beside the sampler rows, the way the shot face's writing
      // box already pushes its controls down. All of it opens the strip.
      el("div", { class: "mmc-tl-summary-room", onclick: () => this.open() }, [
        el("div", {
          class: `mmc-tl-summary-prompt${prompt ? "" : " empty"}`,
          text: prompt || (single
            ? t("No global prompt yet — the standing description that opens Shot 1.")
            : t("No global prompt yet — the standing description every segment inherits.")),
        }),
      ]),
      this.summaryStats,
      el("div", { class: "mmc-pills" }, [
        // The model leads even the render mode, which is the one thing about
        // this node that changes what all the other numbers mean — because the
        // family is what decides which modes there are. The one control in a row
        // of readouts, and deliberately: it is the same slot in the same place
        // as on the strip's bar and on a shot's face, so switching architecture
        // never depends on which of the three you happen to be looking at.
        familyPill({ piece: this.timeline, onChange: () => this.commit() }),
        el("span", {
          class: "mmc-pill mmc-pill-static",
          title: single
            ? t("One generation: the segments are the shots of a single description, cut times and all.")
            : passes.length === segments.length
              ? t("One generation per segment, joined end to end.")
              : t("One generation per pass, joined end to end. A pass holding several "
                + "shots generates them at once, with the cuts written into its description."),
        }, [
          icon("timeline", 16),
          el("span", { text: single ? t("one pass")
              : passes.length === segments.length ? t("chained")
                : t("{count} passes", { count: passes.length }) }),
          el("span", {
            class: "mmc-pill-sub",
            text: single
              ? t(segments.length === 1 ? "{count} shot" : "{count} shots", { count: segments.length })
              : t(segments.length === 1 ? "{count} segment" : "{count} segments", { count: segments.length }),
          }),
        ]),
        el("span", {
          class: "mmc-pill mmc-pill-static",
          title: single
            ? t("The canvas the one generation runs at.")
            : t("Shared by every segment — they are joined end to end and have to match."),
        }, [
          el("span", { text: fromInput ? describeRatio(ratio, rules) : this.timeline.aspect }),
          el("span", { class: "mmc-pill-sub", text: `${width} × ${height}` }),
        ]),
        // Only when there are any: an empty pill would say the timeline has a
        // LoRA feature, which is the modal's job to say, not the node's.
        ...(globalLoras.length ? [el("span", {
          class: "mmc-pill mmc-pill-static",
          title: (single
            ? t("Patched onto the one generation, in front of whatever the shots add.")
            : t("Patched onto every segment, in front of whatever that segment adds."))
            + "\n" + globalLoras.map((entry) => entry.name).join("\n"),
        }, [
          icon("effect", 16),
          el("span", { text: t(globalLoras.length === 1 ? "{count} LoRA" : "{count} LoRAs",
                               { count: globalLoras.length }) }),
          // Which ones, not just how many. The face has no room for the chips
          // the strip window draws, and a bare count is a stack you have to
          // open two things to identify.
          el("span", { class: "mmc-pill-sub", text: globalLoras.map(loraBase).join(", ") }),
        ])] : []),
        // Only when there are any, like the LoRAs: the modal introduces the
        // feature, the node only reports what this timeline uses.
        ...(this.timeline.assets?.length ? [el("span", {
          class: "mmc-pill mmc-pill-static",
          title: t("References attached to the piece itself, cited by @handle from "
               + "the segments where they appear."),
        }, [
          icon("image", 16),
          el("span", { text: t(this.timeline.assets.length === 1
            ? "{count} piece ref" : "{count} piece refs",
            { count: this.timeline.assets.length }) }),
        ])] : []),
        ...(audio.length ? [el("span", {
          class: "mmc-pill mmc-pill-static",
          title: t("The Context-IR audio fields this timeline sets for every segment."),
        }, [icon("audio", 16), el("span", { text: audio.join(" · ") })])] : []),
        ...(this.pieceView() ? [this.renderPieceViewPill()] : this.renderHeldPieceViewPill()),
      ]),
    ]);
  }

  /** The way back to the shot, on the strip face. Drawn only while there is one
   *  shot to go back to, or none and a blank one to start — see `pieceView`. Deliberately the pill the shot face
   *  draws, in the same place and with the same words: one control with two
   *  states, not two controls that happen to be opposites. */
  renderPieceViewPill() {
    const view = this.pieceView();
    return el("button", {
      class: "mmc-pill mmc-piece-toggle on",
      "aria-pressed": "true",
      title: t("Showing the whole piece. Click to go back to the shot."),
      onclick: () => view.toggle(),
    }, [icon("timeline", 16), el("span", { text: t("Timeline") })]);
  }

  /** What a one-shot piece has set that a shot's face has no slot for — the
   *  fields whose presence keeps this node on the strip. */
  pieceHolds() {
    const piece = this.timeline;
    return [
      ...((piece.prompt || "").trim() ? [t("the global prompt")] : []),
      ...((piece.soundscape || "").trim() ? [t("the soundscape")] : []),
      ...((piece.music || "").trim() ? [t("the music")] : []),
      ...(piece.assets?.length ? [t("the reference pool")] : []),
      ...(this.heldLoras().length ? [t("the piece's LoRAs")] : []),
    ];
  }

  /**
   * The same pill, dead, when the piece is one shot but cannot wear its face.
   *
   * The rule is the face never hides a field it still queues, so a piece
   * carrying a global prompt has no shot face to go back to — but a control
   * that simply vanishes reads as a way back that is broken. Drawn dead
   * instead, naming exactly what holds the strip open, which is also the
   * instruction for getting back: empty those fields and the toggle wakes.
   * A piece of several shots draws nothing — there is no shot to go back to
   * and nothing a user could empty to make one.
   */
  renderHeldPieceViewPill() {
    const segments = this.timeline.segments;
    if (!this.face || segments.length > 1 || S.isClip(segments[0])) return [];
    const holds = this.pieceHolds();
    if (!holds.length) return [];
    return [el("button", {
      class: "mmc-pill mmc-piece-toggle on",
      "aria-pressed": "true",
      disabled: true,
      title: t("Showing the whole piece. The shot face has no place for {fields}, "
             + "so the way back opens when they are emptied.",
             { fields: holds.join(" · ") }),
    }, [icon("timeline", 16), el("span", { text: t("Timeline") })])];
  }


  /** The strip face's pre-stage toggle, with its original action and wording. */
  renderPreStageTool() {
    const on = this.preStage.active();
    return el("button", {
      class: `mmc-tool mmc-prestage-toggle${on ? " on" : ""}`,
      "aria-pressed": String(on),
      title: on
        ? t("The pre-stage node on the left generates stills for this timeline — the opening "
          + "frame, the closing frame, references. Click to remove it.")
        : t("Add a pre-stage: an image node (Krea 2 / Ideogram 4) at this node's left edge whose "
          + "stills land on the timeline's shots with one click."),
      onclick: () => { this.preStage.toggle(); this.render(); },
    }, [el("span", { class: "mmc-tool-icon" }, [icon("image")]),
        el("span", { text: t("Pre-stage") })]);
  }

  /**
   * Shot one, started if the strip is empty. A file handed to this node from
   * outside lands on the first card, and a piece whose cards were all deleted
   * still takes it — onto a new shot, which is what attaching it there asks for.
   */
  firstShot() {
    if (!this.timeline.segments.length) {
      this.timeline.segments.push(S.emptySegment());
      S.syncTimeline(this.timeline);
      S.ensureCardIds(this.timeline);
    }
    return this.timeline.segments[0];
  }

  /**
   * A finished pre-stage still, pushed into the timeline by the neighbour's
   * result chips. The roles land where one pass would put them — a start frame
   * opens shot 1, an end frame closes the last shot, a reference joins shot 1 —
   * under each shot's own capacity and exclusivity rules. Returns a refusal
   * message, or null on success.
   */
  attachFromPreStage({ role, filename }) {
    this.firstShot();
    const shots = this.timeline.segments;
    const index = role === "last_frame" ? shots.length - 1 : 0;
    const segment = shots[index];
    const where = t("segment {n}", { n: index + 1 });
    if (role === "reference") {
      const blocked = S.blockedReason(segment, "reference");
      if (blocked) return t("{where}: {blocked}", { where, blocked });
      const { used, max, filesLeft } = S.capacity(segment, "image", this.timeline);
      if (used >= max || filesLeft <= 0) {
        return t("{where}: no image slots left ({used}/{max} used).", { where, used, max });
      }
      segment.assets.push({
        handle: S.nextHandle(segment, "image"),
        kind: "image", role: "reference", filename, ref_size: "max",
      });
      this.commit();
      return null;
    }
    const blocked = S.blockedReason(segment, role);
    if (blocked) return t("{where}: {blocked}", { where, blocked });
    const existing = S.frameAsset(segment, role);
    if (existing) segment.assets = segment.assets.filter((a) => a.handle !== existing.handle);
    segment.assets.push({
      handle: S.nextHandle(segment, "image"),
      kind: "image", role, filename,
    });
    this.commit();
    return null;
  }

  /**
   * Shot one, started if the strip is empty. A file handed to this node from
   * outside lands on the first card, and a piece whose cards were all deleted
   * still takes it — onto a new shot, which is what attaching it there asks for.
   */
  firstShot() {
    if (!this.timeline.segments.length) {
      this.timeline.segments.push(S.emptySegment());
      S.syncTimeline(this.timeline);
      S.ensureCardIds(this.timeline);
    }
    return this.timeline.segments[0];
  }

  /**
   * A drawing off the ControlNet bench, attached to the shot it aims.
   *
   * On the body, not on the editor, because the body is what a caller outside
   * this node can reach: `mmcBody` is a `TimelineBody`, and the door the bench
   * looks for has to be on the object it is looking at. The editor version was
   * on `CreatorEditor` and on the strip window, and neither of those is what
   * `node.mmcBody` is — so the bench asked for a door that was never there and
   * drew the row without it, which is how a piece with a ControlNet came to
   * offer nowhere to send a clip.
   *
   * Shot one, which is where every other hand-off from outside this node lands
   * — see `attachFromPreStage`. A piece is a strip of cards and a file arriving
   * without a card named has to pick one; picking the first is the same answer
   * the pre-stage's chips already give.
   */
  takeGuide({ path, kind = "video", op = "", opId = null, trim = null }) {
    const segment = this.firstShot();
    // Through the editor where one is already built for this shot, so the
    // caret, the chips and the redraw are the editor's own. Straight onto the
    // blob otherwise: on a strip there is no card editor to route through, and
    // `commit` redraws whatever is in front.
    if (this.faceEditor?.state === segment) {
      return this.faceEditor.takeGuide({ path, kind, op: op || opId || "", trim });
    }
    if (!S.attachGuide(segment, this.timeline, { path, kind, op: op || opId || "", trim })) return;
    this.commit();
  }

  /**
   * A file handed to this node from outside, attached as a reference.
   *
   * Shot one for the same reason `takeGuide` uses it. Through the editor where
   * there is one, because `attachAssets` is what settles a clip's sound track
   * with the server — a reference video pushed onto the blob by hand would land
   * silent where a picked one lands with its audio on.
   */
  async takeReference(picked) {
    const segment = this.firstShot();
    if (this.faceEditor?.state === segment) {
      return this.faceEditor.attachAssets([picked]);
    }
    const blocked = S.blockedReason(segment, "reference");
    if (blocked) return;
    const entry = {
      handle: S.nextHandle(segment, picked.kind),
      kind: picked.kind,
      role: "reference",
      filename: picked.path,
      ref_size: "max",
    };
    if (picked.kind === "video") entry.track = S.trackFor(picked);
    if (picked.trim) entry.trim = picked.trim;
    if (picked.crop) entry.crop = picked.crop;
    segment.assets.push(entry);
    this.commit();
  }

  /**
   * The sampler row, shared with the Creator node — see `sampling.js`. Both
   * nodes own their sampler and declare the same widgets, so neither draws its
   * own version of this.
   */
  renderSampling() {
    return samplingBar({
      // See the Creator's own call: which controls the row has is the family's.
      family: S.pieceFamily(this.timeline),
      widgets: this.widgets,
      value: (name, fallback) => this.value(name, fallback),
      set: (name, value) => this.set(name, value),
      // Several generations mean the seed and the step count are asked of each
      // of them; one generation means they are asked once. The passes are the
      // generations, whatever the cards look like.
      perSegment: S.passes(this.timeline).length > 1,
      // The turbo switch, on the timeline's global stack: a speed-up belongs to
      // the run, which is the whole reason the global stack exists. Only where
      // the family declares a distillation at all — every number the switch
      // throws (the step counts, euler + beta, the flow shifts a distill was
      // trained against) is that family's, and a pill offering H3's on another
      // family's row is a shortcut into weights nobody has.
      // The VDN-H3 pill throws the switch too — the same container.
      container: this.timeline,
      turbo: S.turboOf(S.pieceFamily(this.timeline)) ? Turbo.turboPills({
        container: this.timeline,
        ...this.widgetIO(),
        onCommit: () => this.commit(),
      }) : [],
      // The guide switch, on the timeline's own block. Global for a reason of
      // its own rather than by analogy with the stack above: a guide is a clip
      // laid along the piece, and each pass takes its own seconds out of it —
      // so a per-card one would be asking the user to cut the drawing up by
      // hand along boundaries the strip already knows.
      guide: Guide.guidePills({
        container: this.timeline,
        onCommit: () => this.commit(),
      }),
      // A chained timeline legitimately runs some shots on one checkpoint and
      // some on the other, so the pill is asked about the set rather than
      // about one — a Ref2VA it never reaches for is not missing.
      //
      // The family that decides which files these are leads the bar above
      // instead of standing here — see `familyPill`.
      trailing: [
        // Only where the family has the pass, or where one is already on —
        // see the same gate, and the same reason, on the Creator's own row.
        // The DLSS 5 refiner, family-neutral: it runs over decoded frames.
        neuralPill({ target: this.timeline, commit: () => this.commit(),
                     // TimelineBody has no geometry() method; the modal does.
                     geometry: () => timelineGeometry(this.timeline),
                     picture: () => stageSource(this.stage?.result) }),
        // The guide-LoRA pass, only where the family has it.
        ...(S.canDo(this.timeline, "guide_lora")
          ? [guideLoraPill({ target: this.timeline, commit: () => this.commit(),
                             onPickLook: () => this.restyle({ queue: false }) })] : []),
        weightsPill({
          piece: this.timeline,
          models: this.timeline.models,
          checkpoints: S.timelineCheckpoints(this.timeline),
          // Only when a shot on the strip actually runs the pass: a piece with
          // it on and every card opted out loads no detector, and a weights
          // pill saying one is missing would be reporting a file nothing opens.
          face: S.faceAnywhere(this.timeline),
          onChange: () => this.commit(),
          turbo: { container: this.timeline, widgetIO: this.widgetIO() },
        }),
      ],
    });
  }
}
