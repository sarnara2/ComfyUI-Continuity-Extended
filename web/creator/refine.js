// The refine button, its settings, and the panel the rewrite lands in.
//
// No video model reads a one-line request the way its own guide says a prompt
// should be written — one wants an expanded, sectioned description whose
// skeleton alone can be assembled mechanically, another wants a flowing
// present-tense caption with the shot established before the scene. Expanding
// what the user typed into either is what a local vision model is for, and
// `refine_routes.py` is the half of this that talks to it.
//
// Which of those a press produces is the piece's family's answer, and this
// file never decides it: the templates the settings popover offers come off
// the family's manifest, and the server resolves the same field to pick the
// refiner that writes the prose. Everything below is about the button, the
// panel and the draft.
//
// The rewrite is fetched here, on a click, and stored in the blob. It is not
// done at queue time on purpose: what the model will actually read has to be
// visible and editable *before* five minutes of sampling rather than after, and
// a rewrite generated inside `execute` would differ between two runs of the same
// queue and miss ComfyUI's cache every time.
//
// So the panel below is deliberately an editor and not a readout. The rewrite is
// a draft: it can be corrected, switched off without being thrown away, and
// reverted to the sentence it came from.

import { el, icon, spinner, dismissable, keepScroll, placeNear } from "./dom.js";
import { stepperPill } from "./pills.js";
import { t } from "./i18n.js";
import { DEFAULT_VIDEO_FAMILY, pieceFamily, templatesOf } from "./state.js";
import { api } from "../../../scripts/api.js";
import { uiSetting, patchSettings, primeSettings, settingsPrimed } from "./api.js";
import { busy as queueBusy, run as runJob } from "./queue.js";

// Machine-level, not workflow-level. Which text encoder is on this disk is a
// fact about this computer; putting it in `creator_data` would ship it to
// whoever opens the workflow next and would invalidate the node's cache every
// time the temperature moved.
//
// And machine-level means the settings file, not localStorage: the browser's
// own store is per profile, so the model the chat room was set up with in one
// browser was no model at all in the next one, on the same machine, against
// the same server. `settings.refiner` is where the choices live now; the two
// keys below are what an install wrote before, read as a fallback while the
// file holds nothing and never written again.
const SETTING = "refiner";
const STORE = "continuity.refiner";
const LEGACY_STORE = "minimax_creator.refiner";
// A bundled alternative, not a new default. Keep its stored id stable while
// giving this experimental option a readable name in the user's language.
const FAITHFUL_BETA_SKILL = "minimax-h3-faithful-beta";

const DEFAULTS = {
  // A text encoder in ComfyUI's own process, managed and evicted like any other
  // model — which on a machine already offloading H3's own encoder is the
  // difference between a rewrite and a coffee break.
  model: "",
  // Or a server the user already runs — LM Studio, Ollama, a hosted API —
  // reached through one OpenAI-compatible client. "local" is the default for
  // the reason `refine_local.py` states; "remote" is for the machine where
  // that argument runs the other way. Only the word travels: the URL and the
  // key live server-side (see `refine_remote.py`), so neither this store nor
  // the workflow blob ever holds an address or a credential.
  backend: "local",
  // The server's model, kept apart from the text encoder's name so switching
  // backends and back loses neither choice.
  remoteModel: "",
  // Ask the server to drop the model once the rewrite is in. A server the user
  // keeps warm for other work should stay warm, which is why this is off; a
  // server that only ever answers this button is holding VRAM the sampler is
  // about to want, which is why it is here. Remote only — the in-process
  // backend already hands its weights back after every generation.
  eject: false,
  // Cold by default: refining is a fidelity task, and at 0.7 a small model
  // paraphrases the very words it was told to keep. Raise it for variety.
  temperature: 0.3,
  seed: -1,
  language: "English",
  // Refiner input only; generation keeps the piece's references unchanged.
  reference_images: true,
  // Which skill package or prompt file writes the rewrite instead of the
  // built-in prompts. Empty is the built-in harness; a name is a `.skill` or a
  // `.md` under the node's skills/ folder.
  skill: "",
  // What a chosen file does to the built-in prompting, by name: "replace"
  // hands it over as the model's only instruction, "add" joins it onto the
  // family's own system prompt and keeps the harness — its guides, its handle
  // checks, its reply contract — standing. Keyed by name because the answer is
  // the file's, and absent means "whatever the file itself asks for", which is
  // the server's default and what makes a switch-free install behave.
  skillModes: {},
  // Which of the built-in per-mode templates writes the rewrite, per family.
  // "auto" — the absent value — follows the request's derived mode exactly as
  // the weights pill's route does; a pinned name overrides everywhere, and a
  // pin the family thinks costs something comes back as a hint in the reply's
  // problems rather than as a refusal.
  //
  // Keyed by family because a template name only means anything to the family
  // that declares it: pinning `REF2VA` and then moving the piece's model pill
  // would otherwise send a name the new family's refiner has never heard of.
  templates: {},
  // How long the reply may run, in tokens — not a context size. There is no
  // context setting on this backend: ComfyUI's Qwen3-VL tokenizer never
  // truncates, so the prompt is embedded whole however long it gets, and the
  // only budget that exists is the one on the answer. A whole-timeline rewrite
  // of a dozen cards is the case that needs it raised.
  maxTokens: 6144,
};

// What the reply-length pill may be moved between. Mirrors `refine.MIN_PREDICT`
// and `refine.MAX_PREDICT`, which clamp it again server-side.
const TOKENS = { min: 1024, max: 32768, step: 1024 };

// The eleven the guide's `<d>[Language]` tag is documented against.
export const LANGUAGES = [
  "English", "Chinese", "Spanish", "French", "German", "Portuguese",
  "Russian", "Japanese", "Korean", "Italian", "Arabic",
];

/** What the browser stored before the choices moved to the settings file. */
function legacyStored() {
  try {
    return JSON.parse(localStorage.getItem(STORE)
                      || localStorage.getItem(LEGACY_STORE) || "{}");
  } catch {
    return {};
  }
}

export function settings() {
  // The file's block once it holds anything; the browser's until then. Read
  // through the settings cache, which every node primes on mount — before it
  // lands this answers the browser's copy or the defaults, and repaints after.
  const filed = uiSetting(SETTING, null);
  let stored = filed && Object.keys(filed).length ? filed : legacyStored();
  // Settings written while there were two backends hold two model names under
  // two keys. The text encoder is the one that still means something; the
  // Ollama tag under `model` names nothing that can be loaded.
  if (stored.localModel !== undefined) {
    const { localModel, backend, url, ...rest } = stored;
    stored = { ...rest, model: localModel };
  }
  // A pin written while the template was one setting rather than one per
  // family. It was made against the only family there was, so that is the one
  // it is kept for; every other family reads "auto" and is offered its own list.
  if (typeof stored.template === "string") {
    const { template, ...rest } = stored;
    stored = { ...rest, templates: { [DEFAULT_VIDEO_FAMILY]: template,
                                     ...(stored.templates ?? {}) } };
  }
  return { ...DEFAULTS, ...stored };
}

/** Write a patch onto the file's block. The whole block goes, including what
 *  the browser's copy held: the first save on an install that upgraded is the
 *  moment its old choices become the machine's. Painted first and written
 *  after, the deal every `patchSettings` caller has — the return is what the
 *  next `settings()` reads. */
export function saveSettings(patch) {
  const next = { ...settings(), ...patch };
  // The whole block is written, so it must be written over the file's copy
  // and not over the browser's: a save that beat the settings fetch to the
  // wire waits for it, then merges the patch onto what actually landed.
  //
  // Waits for the fetch, not for the block: a file that has landed and holds
  // no refiner block yet is the first save on any install, and this used to
  // defer that one too — so the chip repainted off the old answer and the
  // first pin looked as if it had not taken.
  if (settingsPrimed()) patchSettings({ [SETTING]: next });
  else primeSettings(() => patchSettings({ [SETTING]: { ...settings(), ...patch } }));
  return next;
}

/** Forget every refiner choice: the model, the temperature, the pinned
 *  templates, the skill and its mode. The endpoint and the key are not here —
 *  they live server-side and are cleared through `/continuity/refine/remote`,
 *  which is the only thing that has ever been able to touch them. The
 *  browser's old copy goes too, or it would come straight back as the fallback. */
export function resetSettings() {
  for (const key of [STORE, LEGACY_STORE]) {
    try { localStorage.removeItem(key); } catch { /* nothing to remove */ }
  }
  return patchSettings({ [SETTING]: {} });
}

/** Whether anything has been chosen here at all — what the danger zone asks
 *  before offering to forget it. */
export function settingsStored() {
  const filed = uiSetting(SETTING, null);
  if (filed && Object.keys(filed).length) return true;
  return Object.keys(legacyStored()).length > 0;
}

/** The model the active backend would use. Empty means nothing is chosen.
 *  Backend-aware on purpose: this is what the button's tooltip names and what
 *  the panel stores as the rewrite's author, and both should say the model
 *  that actually wrote it. */
export function chosenModel(current = settings()) {
  return (current.backend === "remote" ? current.remoteModel : current.model) || "";
}

/**
 * Which template writes this family's rewrites — "auto" unless one is pinned.
 *
 * Resolved against what the family actually offers rather than trusted: a pin
 * survives in localStorage across an update that renamed a template, and a name
 * the family no longer declares would come back from the server as an error on
 * every press. Falling through to "auto" is the same answer that name meant
 * when it was pinned, minus the pin.
 */
export function chosenTemplate(family, current = settings()) {
  const pinned = current.templates?.[family];
  const offered = templatesOf(family).some((entry) => entry.name === pinned);
  return offered ? pinned : "auto";
}

/** Pin a template for one family, leaving the other families' pins alone. */
export function saveTemplate(family, name) {
  return saveSettings({ templates: { ...settings().templates, [family]: name } });
}

// ---- the server -------------------------------------------------------------

// The providers people actually mean, each one click to its base URL —
// nobody knows by heart that Anthropic's compatibility endpoint is
// api.anthropic.com/v1. Names are brands and stay untranslated; the tooltip
// is the URL itself, which is also what clicking writes. The two loopback
// ones are what `refine_remote.LOCAL_SERVERS` knocks on for the chat room's
// first run.
export const PROVIDERS = [
  ["LM Studio", "http://localhost:1234/v1"],
  ["Ollama", "http://localhost:11434/v1"],
  ["Anthropic", "https://api.anthropic.com/v1"],
  ["OpenAI", "https://api.openai.com/v1"],
  ["OpenRouter", "https://openrouter.ai/api/v1"],
  ["Gemini", "https://generativelanguage.googleapis.com/v1beta/openai"],
];

/** Servers that take no seed. Claude's API has no such parameter, so its
 *  OpenAI-compatible door drops one silently: a fixed seed would read as
 *  fixed and change nothing. A server that refuses the word outright is
 *  `refine_remote.adapt`'s to shed, and needs no entry. */
const SEEDLESS = ["api.anthropic.com"];

/** Whether the seed means anything on the backend `current` points at. The
 *  in-process one always takes it; a server by its host, as `remoteStatus`
 *  last read it — before that is known, it is assumed to. */
export function takesSeed(current = settings()) {
  if (current.backend !== "remote" || !remoteCache?.url) return true;
  try {
    return !SEEDLESS.includes(new URL(remoteCache.url).hostname);
  } catch {
    return true;
  }
}

/**
 * The seed as a pill: the die fixes a new number, the number itself toggles
 * between that and "new every time" (-1). One setting, read by the Refiner
 * and the chat's *Thinks with* alike, so the pill is drawn by one function;
 * `titles` is what the number's tooltip says in each state, in the words of
 * whatever the seed is steering.
 */
export function seedControl(changed, titles) {
  const random = settings().seed < 0;
  return el("div", { class: "mmc-pill mmc-pill-group" }, [
    el("button", {
      class: "mmc-step mmc-seed-dice",
      title: random ? t("Fix the seed at a number") : t("Roll a new seed now"),
      onclick: () => {
        saveSettings({ seed: Math.floor(Math.random() * 0x7fffffff) });
        changed();
      },
    }, [icon("dice", 15)]),
    el("button", {
      class: "mmc-ghost mmc-refine-seed",
      text: random ? t("new every time") : String(settings().seed),
      title: random ? titles.random : titles.fixed,
      onclick: () => {
        saveSettings({ seed: random ? Math.floor(Math.random() * 0x7fffffff) : -1 });
        changed();
      },
    }),
  ]);
}

let modelCache = { at: 0, names: [] };

/** The text encoders on disk. Empty means the folder is bare — which the
 *  settings popover says, rather than showing a blank list. */
export async function listModels({ force = false } = {}) {
  if (!force && Date.now() - modelCache.at < 20000) return modelCache.names;
  try {
    const response = await api.fetchApi("/continuity/refine/models");
    const body = await response.json();
    modelCache = { at: Date.now(), names: body.models ?? [] };
  } catch {
    modelCache = { at: Date.now(), names: [] };
  }
  return modelCache.names;
}

// What the browser may know about the remote endpoint: the URL, and *whether*
// a key is set. The key itself is write-only — it goes up in `saveRemote` and
// never comes back down, so nothing on this side can leak it. See
// `refine_remote.py` for the whole security model.
let remoteCache = null;

export async function remoteStatus({ force = false } = {}) {
  if (!force && remoteCache) return remoteCache;
  try {
    const response = await api.fetchApi("/continuity/refine/remote");
    remoteCache = await response.json();
  } catch {
    remoteCache = { url: "", key_set: false };
  }
  return remoteCache;
}

/** Store the endpoint. `key` null means "none arrived in this save" — the
 *  server keeps the stored one only while the URL stands still; an empty
 *  string is the explicit "forget it". */
export async function saveRemote(url, key = null) {
  const response = await api.fetchApi("/continuity/refine/remote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(key === null ? { url } : { url, key }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || t("the refiner settings could not be saved"));
  remoteCache = result;
  return result;
}

let remoteModelCache = { at: 0, names: [], error: "" };

/** The models the stored server offers, with the failure alongside — an
 *  unreachable server is a state the panel shows, not an empty list. */
export async function listRemoteModels({ force = false } = {}) {
  if (!force && Date.now() - remoteModelCache.at < 20000) return remoteModelCache;
  try {
    const response = await api.fetchApi("/continuity/refine/remote/models");
    const body = await response.json().catch(() => ({}));
    remoteModelCache = {
      at: Date.now(), names: body.models ?? [],
      error: response.ok ? "" : (body.error || t("the server could not be reached")),
    };
  } catch {
    remoteModelCache = { at: Date.now(), names: [], error: t("the server could not be reached") };
  }
  return remoteModelCache;
}

let skillCache = { at: 0, entries: [] };

/** The skills and prompt files under the node's skills/ folder, each as
 *  `{name, kind, mode}` — what it is called, whether it is a package or a
 *  plain file, and the mode the file itself asks for. */
export async function listSkills({ force = false } = {}) {
  if (!force && Date.now() - skillCache.at < 20000) return skillCache.entries;
  try {
    const response = await api.fetchApi("/continuity/refine/skills");
    const body = await response.json();
    skillCache = { at: Date.now(), entries: body.entries ?? [] };
  } catch {
    skillCache = { at: Date.now(), entries: [] };
  }
  return skillCache.entries;
}

/** Replace the built-in prompting, or add to it — the user's pick for this
 *  file, else the mode the file declares. Empty when nothing is chosen: the
 *  built-in prompting has no such switch. */
export function chosenSkillMode(name, entries = skillCache.entries, current = settings()) {
  if (!name) return "";
  return current.skillModes?.[name]
    || entries.find((entry) => entry.name === name)?.mode
    || "replace";
}

/**
 * Ask for a rewrite.
 *
 * `payload` is `{kind, data, index}` — the blob the caller is already holding,
 * because the server has to compile it to find out what the request is: the
 * mode, the reference slots, and which ordinal each handle will be given.
 *
 * @returns {Promise<{mode, shots: {index, body, sections?}[], soundscape, music,
 *                    sections: object|null, piece: string|null,
 *                    scope: string|null, seen: string, problems: string[],
 *                    skill?: string}>}
 *   `piece` is the rewritten global prompt (whole-timeline refines only);
 *   `scope: "shot"` marks bodies that compile joins the global prompt onto,
 *   like typed text; chained reference cards carry their own `sections`.
 */
/**
 * The refiner's half of a refine request: which backend, which model, and the
 * dials. Shared by individual fields, a segment and the whole timeline.
 * The chat room's thinker request is separate from these rewrite settings.
 */
export function refineRequest(current = settings()) {
  const { temperature, seed, language, maxTokens, skill } = current;
  // Only a mode the user actually picked travels. Absent, the server reads the
  // file's own `mode:` — so a prompt file that says what it wants behaves the
  // same on a fresh install as it does here.
  const skillMode = skill ? (current.skillModes?.[skill] || "") : "";
  // One word says which half of the server holds the model; the model is the
  // active backend's. The URL and the key are already there — nothing about
  // the endpoint rides in the request.
  const backend = current.backend === "remote" ? "remote" : "local";
  return {
    model: chosenModel(current), backend, temperature, seed, language,
    max_tokens: maxTokens, skill, skill_mode: skillMode,
    reference_images: current.reference_images !== false,
    // Meaningless to the in-process backend, which frees its weights after
    // every generation regardless.
    eject: backend === "remote" && current.eject === true,
  };
}

export async function refine(payload, options) {
  const current = settings();
  // Read off the blob being sent rather than passed in, because it is a fact
  // about that blob: the server resolves the same field to decide which
  // family's refiner writes the rewrite, and a template pinned for another
  // one must not ride along with it.
  const template = chosenTemplate(pieceFamily(payload.data), current);
  try {
    if (current.reference_images === false) {
      // An older live Python process ignores unknown request fields. Never
      // silently send images when this browser explicitly asked not to.
      let supported = false;
      try {
        const response = await api.fetchApi("/continuity/refine/capabilities");
        supported = response.ok && (await response.json()).reference_images === true;
      } catch { /* A failed probe cannot establish text-only support. */ }
      if (!supported) throw new Error(t("Restart ComfyUI to enable text-only refining. No fields were changed."));
    }
    return await runJob("/continuity/refine", {
      ...payload, ...refineRequest(current), template,
    }, options);
  } catch (error) {
    if (error instanceof Error) error.message = t(payload.kind === "field" && payload.field === "all"
      && /unknown refine field target/.test(error.message)
      ? "Restart ComfyUI to enable field-only refining. No fields were changed." : error.message);
    throw error;
  }
}

/** A field owns one input; `segment` owns the three inputs of one card. */
export async function refineField(target, field = "prompt", options) {
  const scope = target.kind === "timeline" ? "timeline" : "segment";
  const fields = scope === "segment" ? ["prompt", "summary", "retention_analysis", "segment"]
    : ["prompt", "soundscape", "music"];
  if (!["creator", "segment", "timeline"].includes(target.kind)
      || !fields.includes(field)) {
    throw new Error(t("the refiner returned an invalid result for this field"));
  }
  const index = scope === "segment" ? (target.kind === "creator" ? 0 : target.index) : null;
  let result;
  try {
    // A new kind is intentional: an older, still-running Python server must
    // reject this request rather than rewrite the piece and discard its output.
    result = await refine({ kind: "field", scope, field, index, data: target.data }, options);
  } catch (error) {
    if (/unknown refine target ['"]field['"]/.test(String(error.message || error))) {
      throw new Error(t("Restart ComfyUI to enable field-only refining. No fields were changed."));
    }
    throw error;
  }
  if (result?.scope !== "field" || result.target_scope !== scope || result.field !== field
      || (scope === "segment" && result.index !== index)
      || typeof result.body !== "string"
      || (field !== "segment" && !result.body.trim() && result.unchanged !== true)
      || (field === "segment" && (!result.sections || typeof result.sections !== "object"
        || Object.keys(result.sections).sort().join(",") !== "retention_analysis,summary"
        || Object.values(result.sections).some((value) => typeof value !== "string")))
      || (field === "segment" && ["piece", "soundscape", "music", "shots"]
        .some((key) => Object.hasOwn(result, key)))) {
    throw new Error(t("the refiner returned an invalid result for this field"));
  }
  return result;
}

export async function refineSegment(target, options) {
  if (!["creator", "segment"].includes(target.kind)) {
    throw new Error(t("the refiner returned an invalid result for this field"));
  }
  return await refineField(target, "segment", options);
}

// A whole-piece reply arriving after a newer field rewrite would erase the
// user's scoped result. Serialize refiners per live owner, never in its blob.
const refineOwners = new WeakSet();
const refineActivities = new WeakMap();

/** One transient activity per source field, shared by every view of it. */
export function refineActivity(owner, field) {
  if (!refineActivities.has(owner)) refineActivities.set(owner, new Map());
  const fields = refineActivities.get(owner);
  if (!fields.has(field)) fields.set(field, { busy: false, waiting: false, progress: null, views: new Set() });
  return fields.get(field);
}

export async function withRefineOwner(owner, run) {
  if (refineOwners.has(owner)) {
    throw new Error(t("Another refine is running for this piece. Wait until it finishes. No fields were changed."));
  }
  refineOwners.add(owner);
  try { return await run(); }
  finally { refineOwners.delete(owner); }
}

// File inventories stay one continuous vertical list. Only the list may scroll;
// the containing popover and the non-file settings stay fully visible.
function choiceList(choices, className = "", maxHeight = 210) {
  const root = el("div", { class: "mmc-refine-choice-list " + className });
  const rows = el("div", { class: "mmc-refine-choice-rows" }, choices);
  const selected = choices.find(row => row.getAttribute("aria-checked") === "true");
  let limit = maxHeight, pendingReveal = true;
  rows.style.maxHeight = `${limit}px`;
  root.mmcRefineList = {
    shrink() {
      if (limit <= 48) return false;
      limit = Math.max(48, limit - 24); rows.style.maxHeight = `${limit}px`; return true;
    },
    reset() { limit = maxHeight; rows.style.maxHeight = `${limit}px`; pendingReveal = true; },
    reveal() {
      if (!pendingReveal || !rows.clientHeight) return;
      pendingReveal = false;
      if (selected) rows.scrollTop += selected.getBoundingClientRect().top - rows.getBoundingClientRect().top;
    },
  };
  root.append(rows);
  requestAnimationFrame(() => root.mmcRefineList.reveal());
  return root;
}

/**
 * The server as one card with a state: provider presets, URL and Connect on a
 * line, the write-only key box under it, and a status line whose dot says
 * whether the endpoint answered — connected, unreachable, or not set up yet.
 * The model list hangs below the card. Redrawn only on save, switch or
 * refresh — the inputs hold carets.
 *
 * Module-level rather than the popover's own, because the chat room's
 * *Thinks with* popover (`chatmodel.js`) draws the same card over the same
 * settings: one server, set up once, whichever door it was set up from.
 *
 * @param {HTMLElement} modelHost  where the card and the model list go
 * @param {() => void} changed  a setting moved; the caller repaints its own
 */
export async function drawRemoteCard(modelHost, changed, force = false) {
  const status = await remoteStatus({ force });

  // One line owns the card's condition: config errors, transport errors and
  // "connected — N models" all land here, so the eye has one place to check.
  const stateText = el("span", { class: "mmc-refine-status-text" });
  const state = el("div", { class: "mmc-refine-status" }, [
    el("span", { class: "mmc-dot" }),
    stateText,
  ]);
  const say = (kind, text) => {
    state.className = "mmc-refine-status " + kind;
    stateText.textContent = text;
  };
  const urlBox = el("input", {
    class: "mmc-shelf-input mmc-refine-field", type: "text",
    placeholder: "http://localhost:1234/v1", value: status.url,
    spellcheck: "false", autocomplete: "off",
  });
  // Chips fill the URL box; nothing is stored until Connect. Checked marks
  // follow whatever the box holds, typed or clicked.
  const presets = el("div", { class: "mmc-chips mmc-refine-providers" },
    PROVIDERS.map(([name, url]) => el("button", {
      class: "mmc-chip", text: name, title: url,
      "aria-checked": status.url === url,
      onclick: (event) => {
        urlBox.value = url;
        for (const chip of presets.children)
          chip.setAttribute("aria-checked", String(chip === event.currentTarget));
        urlBox.focus();
      },
    })));
  urlBox.addEventListener("input", () => {
    for (const chip of presets.children)
      chip.setAttribute("aria-checked", String(chip.title === urlBox.value.trim()));
  });
  // Write-only on purpose: the placeholder says a key exists, the value never
  // comes back to fill it. Typing replaces; the button beside it forgets.
  const keyBox = el("input", {
    class: "mmc-shelf-input mmc-refine-field", type: "password",
    placeholder: status.key_set ? t("key saved — type to replace") : t("API key — hosted providers only"),
    autocomplete: "new-password",
  });
  const store = async (key) => {
    try {
      await saveRemote(urlBox.value, key);
      await listRemoteModels({ force: true });
      drawRemoteCard(modelHost, changed);
    } catch (error) {
      say("bad", String(error.message || error));
    }
  };
  const connect = () => store(keyBox.value || null);
  urlBox.addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
  keyBox.addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
  const rows = el("div", { class: "mmc-refine-remote-rows" });
  modelHost.replaceChildren(
    el("div", { class: "mmc-refine-server" }, [
      presets,
      el("div", { class: "mmc-refine-row" }, [
        urlBox,
        el("button", { class: "mmc-refine-connect", text: t("Connect"), onclick: connect }),
      ]),
      el("div", { class: "mmc-refine-row" }, [
        keyBox,
        status.key_set
          ? el("button", { class: "mmc-ghost mmc-refine-forget", text: t("Forget key"),
                           title: t("Delete the stored key from this machine."),
                           onclick: () => store("") })
          : null,
      ]),
      state,
      el("div", { class: "mmc-refine-hint",
                  text: t("The key stays on this machine — never in the browser or a workflow.") }),
      // Under the card because it is a fact about this server, not about the
      // model: whether the refiner is allowed to hand the memory back when
      // it is done with it.
      el("div", { class: "mmc-chips mmc-refine-eject" }, [
        el("button", {
          class: "mmc-chip", "aria-checked": settings().eject === true,
          text: t("eject when done"),
          title: t("Ask the server to unload the model as soon as the rewrite is in, "
                 + "so the sampler gets the memory back. LM Studio and Ollama can do "
                 + "this; a server that cannot is left alone. Leave it off if you keep "
                 + "the model loaded for other work."),
          // Toggled in place rather than by redrawing the card: the card owns
          // two inputs holding carets and a model list it would refetch.
          onclick: (event) => {
            const on = !(settings().eject === true);
            saveSettings({ eject: on });
            event.currentTarget.setAttribute("aria-checked", String(on));
            changed();
          },
        }),
      ]),
    ]),
    rows,
  );
  if (!status.url) {
    say("", t("Not connected"));
    return;
  }
  say("", t("Looking for models…"));
  const { names, error } = await listRemoteModels({ force });
  if (error) {
    say("bad", error);
    rows.replaceChildren();
    return;
  }
  if (!names.length) {
    say("bad", t("The server lists no models — load one there first."));
    rows.replaceChildren();
    return;
  }
  say("ok", t("Connected — {n} models", { n: names.length }));
  const chosen = settings().remoteModel;
  rows.replaceChildren(choiceList(names.map((name) => el("button", {
    type: "button",
    class: "mmc-opt",
    "aria-checked": name === chosen,
    title: name,
    onclick: () => { saveSettings({ remoteModel: name }); changed(); drawRemoteCard(modelHost, changed); },
  }, [
    el("span", { class: "mmc-opt-label mmc-refine-name", text: name }),
    el("span", { class: "mmc-radio" }),
  ])), "", 420));
}

// ---- settings popover -------------------------------------------------------

let settingsSequence = 0;

/**
 * Where the model and the sampling live.
 *
 * Related controls share two columns on a normal screen. On smaller screens
 * the same sections become explicit pages. Only file inventories scroll.
 * Built out of the same
 * option rows and pills as the aspect and resolution popovers rather than as a
 * form — a `<select>` and two number inputs would be the only browser chrome in
 * the entire node.
 */
export function openSettings(anchor, onChange, family = DEFAULT_VIDEO_FAMILY, onClose = null) {
  const pageId = `mmc-refiner-${++settingsSequence}`;
  const pop = el("div", { class: "mmc-pop mmc-refine-pop", role: "dialog", "aria-label": t("Refiner") });
  const backendHost = el("div", { class: "mmc-refine-seg" });
  const modelHost = el("div", { class: "mmc-refine-models" });
  const noteHost = el("div", { class: "mmc-refine-hint mmc-refine-note" });
  const referenceHost = el("div", { class: "mmc-refine-section mmc-refine-visual" });
  const skillHost = el("div", { class: "mmc-refine-section" });
  const templateHost = el("div", { class: "mmc-refine-section" });
  const moreHost = el("div", { class: "mmc-refine-more-body" });
  const pages = [
    el("section", { class: "mmc-refine-settings-page mmc-refine-model-page" }, [modelHost, noteHost]),
    el("section", { class: "mmc-refine-settings-page mmc-refine-prompt-page" }, [referenceHost, skillHost, templateHost]),
    el("section", { class: "mmc-refine-settings-page mmc-refine-sampling-page" }, [
      el("span", { class: "mmc-note-key", text: t("Language and sampling") }), moreHost,
    ]),
  ];
  let currentPage = 0;
  const tabLabels = ["Model", "prompting", "Language and sampling"];
  const tabs = el("div", { class: "mmc-refine-settings-tabs", role: "tablist", "aria-label": t("Refiner") });
  const showPage = index => {
    currentPage = index;
    [...tabs.children].forEach((button, n) => {
      button.setAttribute("aria-selected", String(n === index));
      button.tabIndex = n === index ? 0 : -1;
      pages[n].classList.toggle("active", n === index);
    });
  };
  tabLabels.forEach((label, index) => {
    pages[index].id = `${pageId}-page-${index}`;
    pages[index].setAttribute("role", "tabpanel");
    pages[index].setAttribute("aria-labelledby", `${pageId}-tab-${index}`);
    tabs.append(el("button", {
    type: "button", id: `${pageId}-tab-${index}`, class: "mmc-chip", role: "tab", text: t(label),
    "aria-controls": pages[index].id,
    onclick: () => showPage(index),
    onkeydown: event => {
      const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      showPage((currentPage + direction + pages.length) % pages.length);
      tabs.children[currentPage].focus();
    },
  }));
  });
  showPage(0);

  const changed = () => { onChange?.(); drawTemplate(); drawMore(); };

  /** In-process, or a server the user already runs. A segmented switch in the
   *  header, because it is the popover's first decision and everything drawn
   *  below it is that word's consequence. */
  function drawBackend() {
    const chosen = settings().backend === "remote" ? "remote" : "local";
    const half = (label, value, help) => el("button", {
      class: "mmc-refine-seg-btn",
      "aria-checked": value === chosen,
      text: t(label),
      title: t(help),
      onclick: () => {
        if (value === chosen) return;
        saveSettings({ backend: value });
        changed(); drawBackend(); drawNote(); drawModels();
      },
    });
    backendHost.replaceChildren(
      half("this ComfyUI", "local",
           "A text encoder in ComfyUI's own process, loaded and evicted like any other model."),
      half("a server", "remote",
           "An OpenAI-compatible endpoint you already run — LM Studio, Ollama, "
           + "llama.cpp, vLLM — or a hosted API."),
    );
  }

  function drawNote() {
    // The remote face carries its facts inside the server card; a second
    // paragraph under it would be the old wall of text coming back.
    noteHost.textContent = settings().backend === "remote"
      ? ""
      : settings().reference_images !== false
        ? t("A Qwen3-VL text encoder, loaded and evicted like any other model. "
            + "It also reads your attached images.")
        : t("A Qwen3-VL text encoder, loaded and evicted like any other model. Image analysis is off.");
  }

  function drawReferenceInputs() {
    const enabled = settings().reference_images !== false;
    referenceHost.replaceChildren(
      el("div", { class: "mmc-refine-row" }, [
        el("span", { class: "mmc-refine-visual-title", text: t("Reference image analysis") }),
        el("button", {
          type: "button", class: "mmc-chip", role: "switch",
          "aria-label": t("Reference image analysis"), "aria-checked": String(enabled),
          "aria-describedby": `${pageId}-visual-help`, text: t(enabled ? "on" : "off"),
          onclick: () => {
            saveSettings({ reference_images: !enabled });
            drawReferenceInputs(); drawNote(); changed();
            referenceHost.querySelector("button").focus();
          },
        }),
      ]),
      el("div", { class: "mmc-refine-hint", id: `${pageId}-visual-help`, text: enabled
        ? t("On: also sends reference images and video frames to the refiner.")
        : t("Off: sends text, handles, reference descriptions and usage rules only.") }),
      el("div", { class: "mmc-refine-hint", text:
        t("Applies to the next refine. Generation references and existing rewrites are unchanged.") }),
    );
  }

  // What this family's templates are and what each is for — the family's own
  // strings, travelling in its manifest and translated like any other copy.
  const TEMPLATES = templatesOf(family);

  /** Which per-mode template writes the rewrite. Hidden while a file is set to
   *  replace the built-in prompting — that replaces the templates with it, and
   *  a dial that does nothing should not be shown doing it. A file that only
   *  adds to the prompting leaves the templates writing the rewrite, so the
   *  chips stay. */
  function drawTemplate() {
    const { skill } = settings();
    if ((skill && chosenSkillMode(skill) === "replace") || !TEMPLATES.length) {
      templateHost.replaceChildren();
      return;
    }
    const chosen = chosenTemplate(family);
    templateHost.replaceChildren(
      el("span", { class: "mmc-note-key", text: t("template") }),
      el("div", { class: "mmc-chips" }, TEMPLATES.map(({ name, help }) => el("button", {
        class: "mmc-chip",
        "aria-checked": name === chosen,
        text: name === "auto" ? "auto" : name.toLowerCase(),
        // The chip's own help carries what the old paragraph said; the
        // paragraph itself is gone — this popover was mostly prose.
        title: t(help),
        onclick: () => { saveTemplate(family, name); changed(); },
      }))),
    );
  }

  /** Built-in prompts, or one of the files under skills/. Only drawn when one
   *  exists on disk: with a bare skills/ folder there is no choice to show,
   *  and a one-option radio group would only raise the question it answers. */
  async function drawSkills(force = false) {
    const entries = await listSkills({ force });
    const names = entries.map((entry) => entry.name);
    let chosen = settings().skill;
    // A setting pointing at a package since deleted would silently refine with
    // it and 400 on every press; forget it instead.
    if (chosen && !names.includes(chosen)) {
      saveSettings({ skill: "" });
      chosen = "";
    }
    if (!names.length) {
      skillHost.replaceChildren();
      return;
    }
    // What the chosen file does to the built-in prompting. Drawn only when one
    // is chosen, because "built-in" is what the switch would otherwise be
    // asking about, and only ever two answers wide.
    const modes = () => {
      if (!chosen) return null;
      const mode = chosenSkillMode(chosen, entries);
      const chip = (label, value, help) => el("button", {
        class: "mmc-chip", "aria-checked": value === mode, text: t(label), title: t(help),
        onclick: () => {
          saveSettings({ skillModes: { ...settings().skillModes, [chosen]: value } });
          changed(); drawSkills();
        },
      });
      return el("div", { class: "mmc-refine-group mmc-refine-modes" }, [
        el("div", { class: "mmc-chips" }, [
          chip("add to the built-in", "add",
               "Use the node's writing instructions together with the selected file. "
               + "Conflicting instructions can make the result less reliable."),
          chip("replace it", "replace",
               "Use the selected file instead of the node's writing instructions. "
               + "The node still controls which fields to rewrite and the reply format."),
        ]),
        el("div", { class: "mmc-refine-hint", text: chosen === FAITHFUL_BETA_SKILL
          ? mode === "replace"
            ? t("Beta: translate and clarify supplied facts without adding scenes or details. The button still controls which inputs are rewritten.")
            : t("Beta: use its own instructions to reduce invented details. Combining it with creative built-in instructions can weaken that goal.")
          : mode === "replace"
          ? t("The selected file guides the wording. The button you press determines "
              + "the scope: one field, one segment, or the whole timeline.")
          : t("The node's instructions and the selected file are both applied. "
              + "The button you press determines which inputs are rewritten.") }),
      ]);
    };
    // Each row says what kind of thing it is, because they behave nothing
    // alike: the built-in is the node's harness with the format assembled
    // around the model, a skill is a package the model follows on its own, and
    // a prompt is whatever the user wrote in a file next to them.
    const row = (label, value, kind, title, beta = false) => el("button", {
      class: "mmc-opt",
      "data-refine-skill": value,
      "aria-checked": value === chosen,
      title,
      onclick: () => { saveSettings({ skill: value }); changed(); drawSkills(); },
    }, [
      el("span", { class: "mmc-opt-label mmc-refine-name", text: label }),
      ...(beta ? [el("span", { class: "mmc-refine-beta", text: t("Beta") })] : []),
      el("span", { class: "mmc-opt-kind", text: t(kind) }),
      el("span", { class: "mmc-radio" }),
    ]);
    skillHost.replaceChildren(
      el("span", { class: "mmc-note-key", text: t("prompting") }),
      choiceList([row(t("built-in"), "", "node",
          t("Refine the selected inputs using the node's built-in writing instructions.")),
      // The tag says whose the instructions are — the node's, a package's, or
      // the user's own — which is the distinction that decides how the row
      // behaves. "prompt" is the server's word for a plain file; on screen the
      // useful thing about it is that the user wrote it.
      ...entries.map(({ name, kind }) => row(name === FAITHFUL_BETA_SKILL ? t("Faithful refine") : name,
        name, kind === "skill" ? "skill" : "yours",
        name === FAITHFUL_BETA_SKILL
        ? t("Experimental minimal rewriting: translate and clarify your input without inventing scenes, actions or appearance. Recommended: use this skill's own instructions. The node still controls scope and reply format.")
        : kind === "skill"
        ? t("Send the instructions in '{name}' to the refiner. Choose below whether "
          + "to combine them with the node's writing instructions or use them instead.", { name })
        : t("Your own instructions, from {name} in the node's skills/ folder.", { name }),
        name === FAITHFUL_BETA_SKILL))]),
      // Nothing is chosen, so there is no switch — and `replaceChildren` would
      // write the word "null" into the panel if it were handed one.
      ...[modes()].filter(Boolean),
    );
    // Which templates are offered depends on the mode this just settled.
    drawTemplate();
  }

  const drawRemote = (force = false) => drawRemoteCard(modelHost, changed, force);

  async function drawModels(force = false) {
    if (settings().backend === "remote") return drawRemote(force);
    modelHost.replaceChildren(el("div", { class: "mmc-refine-hint", text: t("Looking for models…") }));
    const names = await listModels({ force });
    if (!names.length) {
      // An empty list is a state with an action in it, not a blank panel: where
      // to put a model is the whole of the answer.
      modelHost.replaceChildren(el("div", { class: "mmc-refine-empty" }, [
        el("div", { text: t("No text encoders found.") }),
        el("code", { text: "models/text_encoders/qwen3vl_4b.safetensors" }),
        el("button", { class: "mmc-ghost", text: t("Look again"), onclick: () => drawModels(true) }),
      ]));
      return;
    }
    const chosen = settings().model;
    modelHost.replaceChildren(choiceList(names.map((name) => el("button", {
      type: "button",
      class: "mmc-opt",
      "aria-checked": name === chosen,
      // The full name, because the row ellipsises it — a folder-qualified
      // `qwen3vl/qwen3vl_4b_instruct_fp8.safetensors` is not a width any
      // popover should be.
      title: name,
      onclick: () => { saveSettings({ model: name }); changed(); drawModels(); },
    }, [
      el("span", { class: "mmc-opt-label mmc-refine-name", text: name }),
      el("span", { class: "mmc-radio" }),
    ])), "mmc-refine-list", 420));
  }

  /** The language chips and the two sampling pills. Redrawn whole on every
   *  change — it is a dozen elements and none of them holds a caret. */
  function drawMore() {
    const current = settings();
    const chip = (name) => el("button", {
      class: "mmc-chip",
      "aria-checked": name === current.language,
      text: t(name),
      onclick: () => { saveSettings({ language: name }); changed(); },
    });

    // A labelled column per dial, side by side: three controls do not need
    // three paragraph-bearing rows. What the paragraphs said rides on each
    // pill's own title.
    const dial = (label, control, wide = false) => el("div", {
      class: "mmc-refine-dial" + (wide ? " wide" : ""),
    }, [el("span", { class: "mmc-note-key", text: label }), control]);
    moreHost.replaceChildren(
      el("div", { class: "mmc-refine-group" }, [
        el("span", { class: "mmc-note-key", text: t("language") }),
        el("div", { class: "mmc-chips" }, LANGUAGES.map(chip)),
        el("div", { class: "mmc-refine-hint",
                    text: t("The prose and the dialogue. Field names, labels and camera terms stay English.") }),
      ]),
      el("div", { class: "mmc-refine-dials" }, [
        dial(t("reply length"), stepperPill({
          value: Number(current.maxTokens), ...TOKENS, width: "62px",
          title: t("Maximum output length, not a target length. 6k means 6,144 tokens. "
               + "The model can stop earlier. A larger limit can reserve more memory."),
          format: (n) => t("{n}k tokens", { n: Math.round(n / 1024) }),
          onChange: (next) => { saveSettings({ maxTokens: next }); changed(); },
        })),
        dial(t("temperature"), stepperPill({
          value: Number(current.temperature), min: 0, max: 2, step: 0.05, width: "58px",
          title: t("Controls randomness when choosing words. Lower values reduce variation; "
               + "0 chooses the most likely next token. This does not guarantee accuracy or instruction following."),
          format: (n) => n.toFixed(2),
          onChange: (next) => { saveSettings({ temperature: next }); changed(); },
        })),
        dial(t("seed"), takesSeed(current)
          ? seedControl(changed, {
            random: t("Every refine comes out differently. Click to fix it."),
            fixed: t("Refining the same prompt gives the same rewrite. Click to vary it again."),
          })
          : el("span", { class: "mmc-refine-hint", text: t("this server takes none") }), true),
      ]),
    );
  }

  pop.append(
    // The first decision shares the header: the title names the tool, the
    // switch says where it runs, and everything under the line follows from
    // that word.
    el("div", { class: "mmc-refine-head" }, [
      el("span", { class: "mmc-pop-title", text: t("Refiner") }),
      backendHost,
    ]),
    tabs,
    el("div", { class: "mmc-refine-settings-grid" }, pages),
  );

  document.body.appendChild(pop);
  placeNear(pop, anchor);
  let frame = 0;
  const fit = () => {
    frame = 0;
    if (!pop.isConnected) return;
    const available = window.innerHeight - 24;
    if (window.innerWidth < 760) pop.classList.add("paged");
    // Prefer the ordinary two-column view. Reduce file-list height first; only a
    // screen that cannot fit all sections uses labelled section pages.
    while (pop.getBoundingClientRect().height > available) {
      const lists = [...pop.querySelectorAll(".mmc-refine-choice-list")]
        .filter(node => node.getClientRects().length);
      if (lists.map(node => node.mmcRefineList.shrink()).some(Boolean)) continue;
      if (!pop.classList.contains("paged")) { pop.classList.add("paged"); continue; }
      break;
    }
    pop.querySelectorAll(".mmc-refine-choice-list").forEach(node => node.mmcRefineList.reveal());
  };
  const scheduleFit = () => { if (!frame) frame = requestAnimationFrame(fit); };
  const observer = new ResizeObserver(scheduleFit);
  observer.observe(pop);
  const resize = () => {
    pop.classList.toggle("paged", window.innerWidth < 760);
    pop.querySelectorAll(".mmc-refine-choice-list").forEach(node => node.mmcRefineList.reset());
    scheduleFit();
  };
  window.addEventListener("resize", resize);
  // Outside dismissal runs on document pointerdown, before the split button's
  // click. Let that one anchor gesture reach its own toggle, otherwise it
  // closes here and immediately reopens on click.
  let anchorPointer = false;
  const anchorGesture = event => {
    anchorPointer = anchor.contains(event.target);
  };
  const endAnchorGesture = () => { anchorPointer = false; };
  document.addEventListener("pointerdown", anchorGesture, true);
  document.addEventListener("pointerup", endAnchorGesture, true);
  document.addEventListener("pointercancel", endAnchorGesture, true);
  const close = dismissable(pop, () => {
    observer.disconnect(); window.removeEventListener("resize", resize);
    document.removeEventListener("pointerdown", anchorGesture, true);
    document.removeEventListener("pointerup", endAnchorGesture, true);
    document.removeEventListener("pointercancel", endAnchorGesture, true);
    if (frame) cancelAnimationFrame(frame);
    onClose?.(); if (anchor.isConnected) anchor.focus();
  }, { suspended: () => anchorPointer });
  drawBackend();
  drawNote();
  drawReferenceInputs();
  drawModels();
  drawSkills();
  drawTemplate();
  drawMore();
  pop.querySelector('.mmc-refine-seg-btn[aria-checked="true"]')?.focus();
  return close;
}

// ---- the panel --------------------------------------------------------------

const REF_SECTIONS = ["subject_definitions", "summary", "retention_analysis"];

/**
 * The rewrite, where it can be read and edited.
 *
 * Owns nothing: it is handed the state that holds `refined` and a commit
 * callback, exactly like the rest of the editor. Built once and refreshed in
 * place, because the textareas in it are being typed into — rebuilding them on
 * every commit would drop the caret mid-word.
 */
export class RefinePanel {
  /**
   * @param {object} options
   * @param {() => object} options.getState  the state whose `refined` this shows
   * @param {() => void} options.onCommit
   * @param {boolean} [options.audioFields]  show overall_soundscape / non_diegetic_music.
   *   True in the Creator node, which has nowhere else to put them; false in a
   *   timeline segment, where they belong to the timeline and are edited there.
   * @param {() => void} [options.onRevert]  the rewrite was thrown away. For an
   *   owner holding state this panel cannot reach — the timeline's own audio
   *   fields and reference sections, which no longer belong to anything once
   *   the last card's rewrite is gone.
   * @param {boolean} [options.promptOnly]  a plain Refine owns only the prompt:
   *   audio inputs remain manually editable, but apply/Revert never changes them.
   */
  constructor({ getState, onCommit, audioFields = true, onRevert = null, promptOnly = false,
                createPromptBox = null }) {
    this.getState = getState;
    this.onCommit = onCommit;
    this.audioFields = audioFields;
    this.onRevert = onRevert;
    this.promptOnly = promptOnly;
    this.readSource = () => this.getState().prompt ?? "";
    this.createPromptBox = createPromptBox;
    this.problems = [];
    // What the model said it could see in the attached images, from the last
    // call. Deliberately not in the state: it describes one run of one model,
    // it is never queued, and a saved workflow carrying it would present a
    // year-old readout as current.
    this.seen = "";
    this.root = el("div", { class: "mmc-refined" });
    this.bodyBox = null;
    // The editable boxes, by key, and the arrangement they were last drawn in.
    // Together they are what "refreshed in place" is made of — see `box` and
    // the shape gate at the top of `render`.
    this.boxes = new Map();
    this.promptBoxes = new Map();
    this.shape = null;
    this.render();
  }

  get refined() {
    return this.getState().refined || null;
  }

  setFieldHosts(hosts) {
    this.fieldHosts = hosts;
    this.shape = null;
    this.render();
  }

  ownedFields(refined = this.refined) {
    if (!refined) return [];
    return Array.isArray(refined.fields) ? refined.fields : [
      ...(refined.body ? ["prompt"] : []),
      ...Object.keys(refined.sections ?? {}).filter((name) => ["summary", "retention_analysis"].includes(name)),
    ];
  }

  clearField(field) {
    const refined = this.refined;
    if (!refined) return;
    const fields = this.ownedFields().filter((name) => name !== field);
    if (field === "prompt") delete refined.body;
    else if (refined.sections) delete refined.sections[field];
    refined.fields = fields;
    if (refined.sources) delete refined.sources[field];
    if (!fields.length) delete this.getState().refined;
    this.onCommit?.();
    this.render();
  }

  /** Take a reply for one prompt. Legacy whole-request panels may also apply
   *  audio, but a promptOnly panel never touches another input. */
  apply(result, shot) {
    const state = this.getState();
    // What the rewrite is about to overwrite, so `clear` can put the state back
    // exactly as it was rather than leaving generated prose behind in two fields
    // the user never typed in. Carried across a second refine rather than
    // re-taken, or refining twice would record the first rewrite's output as
    // "what was there before".
    const replaced = this.refined?.replaced
      ?? { soundscape: state.soundscape ?? "", music: state.music ?? "" };
    const sections = this.promptOnly ? (shot.sections ?? this.refined?.sections) : result.sections;
    const fields = this.promptOnly ? [...new Set([
      ...(this.refined?.enabled !== false ? this.ownedFields() : []), ...(shot.fields ?? []),
    ])].filter((field) => ["prompt", "summary", "retention_analysis"].includes(field)) : [];

    state.refined = {
      ...(typeof shot.body === "string" ? { body: shot.body } : {}),
      // Present on a timeline segment's rewrite: the body is the shot alone,
      // and compile joins the global prompt in front of it as it does for
      // typed text. The Creator node has no global prompt and gets none.
      ...(this.promptOnly ? { scope: "shot" }
        : result.scope ? { scope: result.scope } : {}),
      ...(sections ? { sections } : {}),
      ...(fields.length ? { fields } : {}),
      ...(shot.sources ? { sources: {
        ...(this.refined?.enabled !== false ? this.refined?.sources ?? {} : {}), ...shot.sources,
      } } : {}),
      // Which skill package or prompt file wrote this, when one did — the
      // answer to "why does this rewrite look nothing like yesterday's" once
      // the setting has moved. Only ever present on a rewrite that replaced
      // the built-in prompting: one that only added to it was still written by
      // the node's own prompting and reads as such.
      ...(result.skill ? { skill: result.skill, kind: result.kind || "skill" } : {}),
      // Which template wrote this, and whether that was the request's own mode
      // or a pin. Stored, not re-derived: the setting and the attachments can
      // both move after the fact, and the answer is about this rewrite.
      ...(result.template ? { template: result.template, forced: !!result.forced } : {}),
      // What it was written from, so the panel can say when the prompt has moved
      // on underneath it. Advisory: a rewrite of an older sentence is a stale
      // draft, not a broken one, and only the user can say which.
      source: state.prompt ?? "",
      model: chosenModel(),
      enabled: true,
      ...(this.audioFields && !this.promptOnly ? { replaced } : {}),
    };
    // Only what the reply actually carries. An empty field means the model had
    // nothing to add, which is not the same as "make this empty" — and these
    // two are typed in by hand as often as they are written by a rewrite, so
    // blanking them on a reply that skipped them deleted a line the user wrote
    // in a box they were looking at. The timeline has always taken them this
    // way (see `Timeline.takePiece`); this is the face agreeing with it.
    if (this.audioFields && !this.promptOnly) {
      if (result.soundscape) state.soundscape = result.soundscape;
      if (result.music) state.music = result.music;
    }
    this.seen = result.seen ?? "";
    this.problems = result.problems ?? [];
    this.render();
  }

  fail(message) {
    this.problems = [message];
    this.render();
  }

  /**
   * Throw the rewrite away and put the state back where it was.
   *
   * Everything the rewrite wrote goes, not just the body: the reference sections,
   * and the two audio fields it overwrote, restored to whatever they held before
   * — empty, if the user had never typed in them. Reverting is the user saying
   * "queue what I wrote", and a `overall_soundscape` still full of the model's
   * prose would queue a line they did not write and could not see the origin of.
   */
  clear() {
    const state = this.getState();
    const replaced = state.refined?.replaced;
    delete state.refined;
    if (this.audioFields && !this.promptOnly && replaced) {
      state.soundscape = replaced.soundscape ?? "";
      state.music = replaced.music ?? "";
    }
    this.seen = "";
    this.problems = [];
    this.onCommit?.();
    if (!this.promptOnly) this.onRevert?.();
    this.render();
  }

  /** Whether the prompt has been edited since the rewrite was made. */
  get stale() {
    const refined = this.refined;
    if (refined?.sources) return this.ownedFields().some((field) =>
      Object.hasOwn(refined.sources, field) && refined.sources[field] !== this.readSource(field));
    return !!refined && (refined.source ?? "") !== (this.getState().prompt ?? "");
  }

  /**
   * One of the panel's editable boxes: built on first sight, then kept.
   *
   * These are typed into, and typing in one runs `onCommit` — which on the node
   * face ends in a full `render` of this panel. Rebuilding the element under
   * the caret is what that used to mean: a textarea removed from the document
   * takes the focus with it and its replacement starts scrolled to the top, so
   * the box accepted one character per click and jumped back to the top after
   * each one. The element is now made once and only its value is refreshed
   * afterwards — and `render` leaves the DOM alone entirely unless the panel's
   * shape has actually moved.
   *
   * `set` is captured at creation and outlives every later render, so it must
   * resolve the state it writes to when it is *called* rather than closing over
   * whichever object was current when the box was built. See the call sites.
   */
  box(key, value, set, { rows = 3, placeholder = "", className = "mmc-refined-box" } = {}) {
    if (!this.boxes.has(key)) {
      if (this.createPromptBox) {
        const prompt = this.createPromptBox({
          getState: () => ({ ...this.getState(), prompt: this.boxValue(key) }),
          onInput: (text) => { set(text); this.onCommit?.(); },
          compiled: null, onOverflow: null,
        });
        prompt.root.classList.add(...className.split(/\s+/), "mmc-refined-rich");
        prompt.root.setAttribute("data-placeholder", placeholder);
        prompt.root.setAttribute("aria-label", key.startsWith("section:") ? key.slice(8) : key);
        prompt.root.style.minHeight = `${rows * 1.5}em`;
        this.promptBoxes.set(key, prompt);
        this.boxes.set(key, prompt.frame ?? prompt.root);
        return this.fill(key, value);
      }
      const made = el("textarea", {
        class: className, rows: String(rows), placeholder,
        oninput: (event) => { set(event.target.value); this.onCommit?.(); },
      });
      made.addEventListener("pointerdown", (event) => event.stopPropagation());
      // A rewrite is longer than the rows it is given, and this box lives in a
      // node body where the wheel is the canvas's zoom — see `keepScroll`.
      keepScroll(made);
      this.boxes.set(key, made);
    }
    return this.fill(key, value);
  }

  boxValue(key) {
    if (key === "body") return this.refined?.body ?? "";
    if (key.startsWith("section:")) return this.refined?.sections?.[key.slice(8)] ?? "";
    return this.getState()[key] ?? "";
  }

  /** A value into a box that is already drawn, and only where it differs:
   *  writing a box's own text back into it would put the caret at the end. */
  fill(key, value) {
    const box = this.boxes.get(key);
    const next = value ?? "";
    const prompt = this.promptBoxes.get(key);
    if (prompt) {
      if (prompt.getValue() !== next) prompt.setValue(next);
      prompt.refresh();
    } else if (box && box.value !== next) box.value = next;
    return box;
  }

  destroy() {
    for (const prompt of this.promptBoxes.values()) {
      prompt.setCompiledOpen(false); prompt.closeMenu(); prompt.paintWhenShown?.disconnect();
    }
    this.promptBoxes.clear(); this.boxes.clear();
  }

  /** The state into the boxes, rebuilding nothing. What a render does when the
   *  shape has not moved — a second rewrite landing on top of an identical one
   *  still has to show its new prose. */
  syncBoxes() {
    const state = this.getState();
    const refined = this.refined;
    this.fill("body", refined?.body);
    if (refined?.sections) {
      for (const name of REF_SECTIONS) this.fill(`section:${name}`, refined.sections[name]);
    }
    if (this.audioFields) {
      this.fill("soundscape", state.soundscape);
      this.fill("music", state.music);
    }
  }

  render() {
    const state = this.getState();
    const refined = this.refined;
    // The audio fields keep the panel open on their own once they hold
    // something: they are queued whether or not a rewrite exists, so a pair the
    // user typed themselves must not lose the only place they can be edited.
    const audio = !!(this.audioFields && (state.soundscape?.trim() || state.music?.trim()));
    const empty = !refined && !audio && !this.problems.length;

    // What the panel is made of, as against what is written in it. Typing moves
    // the second and never the first, so a shape that has not moved is a panel
    // that must not be rebuilt — the boxes in it are being written in. Every
    // part of the arrangement is in here: what the head says, whether the two
    // folds exist, and the warnings under them.
    const shape = JSON.stringify([
      empty, !!refined, refined?.enabled !== false, refined?.model ?? null,
      refined?.template ?? null, !!refined?.forced, refined?.skill ?? null,
      this.stale, this.seen, Object.keys(refined?.sections ?? {}).sort(), this.ownedFields(), audio, this.problems,
    ]);
    if (shape === this.shape) {
      this.syncBoxes();
      return;
    }
    this.shape = shape;
    for (const host of Object.values(this.fieldHosts ?? {})) host.replaceChildren();

    if (empty) {
      this.root.replaceChildren();
      this.destroy();
      return;
    }

    const parts = [];
    if (refined) {
      const on = refined.enabled !== false;
      parts.push(el("div", { class: "mmc-refined-head" }, [
        el("button", {
          class: `mmc-refined-toggle${on ? " on" : ""}`,
          title: on
            ? t("This rewrite is what the model will read. Click to queue your own prompt instead — "
              + "the rewrite is kept.")
            : t("Your own prompt is what the model will read. Click to use the rewrite again."),
          onclick: () => {
            refined.enabled = !on;
            this.onCommit?.();
            this.render();
          },
        }, [el("span", { class: "mmc-dot" }), el("span", { text: on ? t("refined") : t("refined (off)") })]),
        ...(refined.model ? [el("span", { class: "mmc-refined-model", text: refined.model })] : []),
        // Which template this prose is in — the same answer the weights pill
        // gives about the checkpoint. A pin is marked, because a rewrite in a
        // style the attachments do not imply should say it was asked for.
        ...(refined.template ? [el("span", {
          class: "mmc-refined-model",
          text: refined.forced ? t("{template} (pinned)", { template: refined.template.toLowerCase() })
                               : refined.template.toLowerCase(),
          title: refined.forced
            ? t("Written with the {template} template you pinned in the refiner's "
              + "settings, not the one the attachments imply.", { template: refined.template })
            : t("Written with the {template} template, picked automatically from "
              + "what is attached.", { template: refined.template }),
        })] : []),
        // A rewrite written by something other than the built-in prompting says
        // so, and says which kind — a package, or a file the user wrote. A
        // rewrite stored before prompt files existed carries no kind and is a
        // package, which is all there was.
        ...(refined.skill ? [el("span", { class: "mmc-refined-model",
                                          text: refined.kind === "prompt"
                                            ? t("prompt: {skill}", { skill: refined.skill })
                                            : t("skill: {skill}", { skill: refined.skill }),
                                          title: refined.kind === "prompt"
                                            ? t("Written to your own instructions rather than the "
                                              + "built-in prompts — the whole document, format included.")
                                            : t("Written by this skill package rather than the "
                                              + "built-in prompts — the whole document, format included.") })] : []),
        ...(this.stale ? [el("span", {
          class: "mmc-refined-stale",
          text: t("prompt edited since"),
          title: t("Your prompt has changed since this was written. It still queues as it stands — "
               + "refine again to fold the change in."),
        })] : []),
        el("span", { style: { flex: "1" } }),
        el("button", {
          class: "mmc-ghost", text: t("Revert"),
          title: t("Throw the rewrite away and go back to your own prompt. The soundscape "
               + "and score it wrote go with it."),
          onclick: () => this.clear(),
        }),
      ]));

      // The one thing the panel never said, and the thing that decides what is
      // generated: the rewrite stands in for the prompt rather than joining it.
      if (!this.fieldHosts) parts.push(el("div", {
        class: "mmc-refined-lede",
        text: on
          ? t("Queued instead of the prompt above, not alongside it.")
          : t("Off — the prompt above is queued as you wrote it."),
      }));

      // What the model said was in the pictures, written before the rewrite so
      // that writing it had to happen first. Folded away, because when it is
      // right it says nothing new — and read the moment the rewrite describes a
      // scene that is not the one in your frames, which is the only way to tell
      // "it did not look" from "it looked and wrote badly".
      if (this.seen) {
        parts.push(el("details", { class: "mmc-refined-fold" }, [
          el("summary", { text: t("what the model saw in your images") }),
          el("div", { class: "mmc-refine-hint mmc-refined-seen", text: this.seen }),
        ]));
      }

      if (this.fieldHosts) {
        for (const field of this.ownedFields()) {
          const host = this.fieldHosts[field];
          if (!host) continue;
          const key = field === "prompt" ? "body" : `section:${field}`;
          host.append(el("div", { class: "mmc-refined-head" }, [
            el("span", { class: "mmc-refined-toggle" + (on ? " on" : ""),
              text: t(on ? "refined" : "refined (off)") }),
            el("span", { style: { flex: "1" } }),
            el("button", { class: "mmc-ghost", text: t("Revert"),
              onclick: () => this.clearField(field) }),
          ]), this.box(key, this.boxValue(key), (value) => {
            const current = this.refined;
            if (!current) return;
            if (field === "prompt") current.body = value;
            else { current.sections ??= {}; current.sections[field] = value; }
          }, { rows: 3 }));
        }
      } else {
      this.bodyBox = this.box(
        "body", refined.body,
        (value) => { const current = this.refined; if (current) current.body = value; },
        { rows: 8, placeholder: t("The rewritten description.") });
      parts.push(this.bodyBox);

      // Only sections this response owns; absent compiler-owned definitions
      // must not become an empty editable field.
      if (refined.sections) {
        const sections = el("div", { class: "mmc-refined-sections" });
        for (const name of REF_SECTIONS.filter((name) => Object.hasOwn(refined.sections, name))) {
          sections.append(el("label", { class: "mmc-refined-section" }, [
            el("span", { class: "mmc-tl-field-name", text: name }),
            this.box(
              `section:${name}`, refined.sections[name],
              (value) => { const sections = this.refined?.sections; if (sections) sections[name] = value; },
              { rows: 3, className: "mmc-refined-box mmc-tl-small" }),
          ]));
        }
        parts.push(el("details", { class: "mmc-refined-fold" }, [
          el("summary", { text: t("reference analysis — where your @references are defined") }),
          sections,
        ]));
      }
      }

    }

    if (this.audioFields && (refined || audio)) {
      parts.push(el("div", { class: "mmc-tl-audio" }, [
        el("label", { class: "mmc-tl-field" }, [
          el("span", { class: "mmc-tl-field-name", text: "overall_soundscape" }),
          this.box(
            "soundscape", state.soundscape,
            (value) => { this.getState().soundscape = value; },
            { rows: 3, className: "mmc-refined-box mmc-tl-small",
              placeholder: t("Everything heard in the room. Empty leaves it to the model; N/A is silence.") }),
        ]),
        el("label", { class: "mmc-tl-field" }, [
          el("span", { class: "mmc-tl-field-name", text: "non_diegetic_music" }),
          this.box(
            "music", state.music,
            (value) => { this.getState().music = value; },
            { rows: 3, className: "mmc-refined-box mmc-tl-small",
              placeholder: t("The score only the audience hears. Empty leaves it to the model.") }),
        ]),
      ]));
    }

    for (const problem of this.problems) {
      parts.push(el("div", { class: "mmc-warn", text: problem }));
    }
    this.root.replaceChildren(...parts);
  }
}

// A confirmation belongs to one live control, never to the next rendering of
// its owner or to a different refiner elsewhere in the interface.
let armedRefine = null;

/**
 * The Refine control: confirm the second press; a corner opens its settings.
 *
 * The settings used to hang off the button as a floating badge, which put a
 * circle over the neighbouring rail tool and read as a notification rather than
 * as a way in. It is now inside the tile's own rounded box — the same split-
 * button idea, contained, so the rail keeps its alignment and nothing overlaps.
 *
 * `run` does the work and reports back; the confirmation is only a transient
 * view state before the original wait for a model that may take a minute.
 *
 * `family` is a getter for the id of the family the piece renders with, asked
 * when the settings open so the template chips are that family's own. Absent —
 * a caller with no piece in hand — falls back to the default family, which is
 * what the whole pill was hardcoded to before it was asked at all.
 */
export function refineButton({ run, family = null, label = "Refine", title,
                               className = "mmc-tool", variant = null, contextLabel = null, activity = null }) {
  const state = activity ?? { busy: false, waiting: false, progress: null, views: new Set() };
  let busy = false;
  let wrapper, armed = false, observer = null, armedParent = null, minWidth = "", settingsClose = null;
  const pill = variant === "pill" || (variant === null && className.includes("mmc-pill"));
  const text = el("span", { text: t(label) });
  const setLabel = (value) => {
    text.textContent = value;
    if (contextLabel) button.setAttribute("aria-label", `${contextLabel}: ${value}`);
  };
  const cancel = () => {
    if (!armed) return;
    armed = false;
    observer?.disconnect();
    observer = null;
    armedParent = null;
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", escape, true);
    if (armedRefine === cancel) armedRefine = null;
    button.classList.remove("mmc-refine-confirm");
    button.style.minWidth = minWidth;
    setLabel(t(label));
  };
  const outside = (event) => { if (!wrapper.contains(event.target)) cancel(); };
  // Do not consume Escape: the containing overlay retains its own close rule.
  const escape = (event) => { if (event.key === "Escape") cancel(); };
  const live = () => button.isConnected && wrapper.isConnected
    && button.parentNode === wrapper && !button.disabled
    && !button.closest('[hidden], [aria-hidden="true"]')
    && button.getClientRects().length > 0
    && !["hidden", "collapse"].includes(getComputedStyle(button).visibility);
  const fresh = (records = []) => {
    // A remove-and-reinsert in the same turn is still a new owner lifecycle.
    const removed = records.some(record => Array.from(record.removedNodes || [])
      .some(node => node === wrapper || node === button
        || node.contains?.(wrapper) || node.contains?.(button)));
    if (removed || !live() || wrapper.parentNode !== armedParent) {
      cancel();
      return false;
    }
    return true;
  };
  const arm = () => {
    armedRefine?.();
    armed = true;
    armedRefine = cancel;
    armedParent = wrapper.parentNode;
    minWidth = button.style.minWidth;
    const width = button.offsetWidth;
    button.classList.add("mmc-refine-confirm");
    button.style.minWidth = `${width}px`;
    setLabel(t("Confirm"));
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    observer = new MutationObserver(records => { if (armed) fresh(records); });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "disabled", "class", "style"],
    });
  };
  // Put into the button on the press and taken out again, rather than built in
  // and hidden: `.mmc-spin` sets `display`, and a class selector beats the user
  // agent's `[hidden]` rule — so the first version of this spun on every pill
  // from the moment the page loaded, with nothing running anywhere. There is a
  // `.mmc-spin[hidden]` rule now too; this deliberately does not rely on it.
  const ring = spinner();
  const publish = () => {
    for (const reference of state.views) {
      const view = reference.deref();
      if (view) view.paint();
      else state.views.delete(reference);
    }
  };
  // How many tokens in. The generation ticks its own job's progress bar once
  // per token — `refine_local` under `jobs.progress`'s node — so the pill can
  // count instead of promising vaguely. Best effort: with nothing on the wire
  // the label just stays "Refining…".
  const onProgress = (fraction, step, total) => {
    state.waiting = false;
    state.progress = total ? { step, total } : null;
    publish();
  };
  const button = el("button", {
    type: "button",
    class: className,
    "aria-label": contextLabel ? `${contextLabel}: ${t(label)}` : null,
    title: title || t("Rewrite this prompt into the description this piece's model was trained "
                  + "to read, keeping everything you wrote and expanding it."),
    onblur: cancel,
    onkeydown: (event) => {
      if (event.repeat && ["Enter", " "].includes(event.key)) event.preventDefault();
    },
    onclick: async () => {
      if (state.busy) return;
      if (!live()) { cancel(); return; }
      if (!armed) { arm(); return; }
      if (!fresh(observer?.takeRecords())) return;
      cancel();
      state.busy = true;
      // Waiting and working are different things and the pill says which. A
      // local refine is a queued job now, so it can sit behind a render — and a
      // pill that said "Refining…" for the ten minutes before it started would
      // be a pill nobody could trust. The remote backend never waits: it spends
      // somebody else's GPU and is answered in the request.
      state.waiting = queueBusy();
      state.progress = null;
      publish();
      try {
        await run({ onProgress });
      } finally {
        state.busy = false;
        state.waiting = false;
        state.progress = null;
        publish();
      }
    },
  }, [el("span", { class: "mmc-tool-icon" }, [icon("brain")]), text]);

  const more = el("button", {
    type: "button",
    class: "mmc-refine-more",
    "aria-label": contextLabel ? `${contextLabel}: ${t("Refiner")}` : t("Refiner"),
    "aria-haspopup": "dialog", "aria-expanded": "false",
    // The chosen model is what this opens onto, so it is what the tooltip
    // leads with — "Settings" would say less than the answer itself.
    title: chosenModel()
      ? t("{model} — click to change the model, template, language or sampling", { model: chosenModel() })
      : t("Choose a model"),
    onclick: (event) => {
      event.stopPropagation();
      armedRefine?.();
      if (settingsClose) { settingsClose(); return; }
      // Asked at the press, not captured when the button was built: the piece's
      // model pill can move while this tile sits on the rail, and the templates
      // the popover offers have to be the ones the next press would use.
      more.setAttribute("aria-expanded", "true");
      settingsClose = openSettings(event.currentTarget, () => {
        more.title = chosenModel()
          ? t("{model} — click to change the model, template, language or sampling", { model: chosenModel() })
          : t("Choose a model");
      }, family?.() ?? DEFAULT_VIDEO_FAMILY, () => {
        settingsClose = null; more.setAttribute("aria-expanded", "false");
      });
    },
  }, [icon("chevron", 12)]);

  // The rail draws a tile with the chevron in its corner; the timeline bar draws
  // a pill with the chevron on its end. Same two controls, told apart by which
  // shape the caller asked for.
  wrapper = el("div", {
    class: `mmc-refine-split${pill ? " pill" : ""}`,
    onpointerleave: cancel,
  }, [button, more]);
  const view = { paint() {
    busy = state.busy;
    button.classList.toggle("busy", busy);
    button.setAttribute("aria-busy", String(busy));
    if (busy) {
      const progress = state.progress;
      setLabel(progress ? `${t("Refining…")} ${progress.step}/${progress.total}`
        : state.waiting ? t("Waiting for the render…") : t("Refining…"));
      button.insertBefore(ring, text);
    } else {
      ring.remove();
      if (!armed) setLabel(t(label));
    }
  } };
  // The activity holds only weak view references. Replacing a toolbar can
  // collect its old controls while the replacement reads the same activity.
  wrapper.mmcRefineActivityView = view;
  state.views.add(new WeakRef(view));
  view.paint();
  return wrapper;
}
