// Session-only final-prompt drafts. The source fields never change. Serialized
// overrides reach the generation graph, but parsing a saved workflow does not
// re-arm them. Any source edit requires an explicit new opt-in.
const drafts = new WeakMap();
export function clearRuntimePrompts(owner) { drafts.delete(owner); }

export function withRuntimePrompts(owner, data) {
  const entry = drafts.get(owner);
  if (!entry) return data;
  // Compare the original serialized source, never the final edited prose.
  if (entry.source !== JSON.stringify(data)) { drafts.delete(owner); return data; }
  const active = [...entry.passes.values()].filter((pass) => pass.enabled);
  return active.length ? { ...data, prompt_overrides: active.map((pass) => ({
    cards: pass.cards, text: pass.text, binding: pass.binding,
  })) } : data;
}

export function passDraft(owner, serialized, cards, baseText, changed = () => {}, binding = {}) {
  const data = { ...serialized }; delete data.prompt_overrides;
  const source = JSON.stringify(data), key = JSON.stringify(cards);
  let entry = drafts.get(owner);
  if (!entry || entry.source !== source) {
    entry = { source, passes: new Map() }; drafts.set(owner, entry);
  }
  let pass = entry.passes.get(key);
  if (!pass || JSON.stringify(pass.binding) !== JSON.stringify(binding)) {
    pass = { cards, text: baseText, enabled: false, binding }; entry.passes.set(key, pass);
  }
  return {
    enabled: pass.enabled, text: pass.text,
    set(enabled, text = pass.text) {
      // A delayed modal may not reactivate a draft invalidated by another edit.
      if (drafts.get(owner) !== entry || entry.passes.get(key) !== pass) return false;
      pass.enabled = Boolean(enabled); pass.text = String(text);
      changed(); return true;
    },
  };
}
