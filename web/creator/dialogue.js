// H3 speech syntax. Offsets always refer to the original prompt, never labels.
export const DELIVERY = [
  { id: "says", lead: "says:", together: "say together:", label: "says" },
  { id: "asks", lead: "asks:", together: "ask together:", label: "asks" },
  { id: "replies", lead: "replies,", together: "reply together,", label: "replies" },
  { id: "whispers", lead: "whispers,", together: "whisper together,", label: "whispers" },
  { id: "shouts", lead: "shouts,", together: "shout together,", label: "shouts" },
  { id: "sings", lead: "sings,", together: "sing together,", label: "sings" },
  { id: "voiceover", lead: "says in an off-screen voiceover:",
    together: "say in an off-screen voiceover:", label: "voiceover",
    tail: " while their lips remain completely closed." },
];

export function sayLine(say, words) {
  const how = DELIVERY.find((item) => item.id === say.delivery) ?? DELIVERY[0];
  const lead = say.lead || (say.who.length > 1 ? how.together : how.lead);
  return `(S${say.who.map((handle) => "@" + handle).join(",")}) ${lead} `
    + `<d>[${say.language}] ${String(words).trim()}</d>${how.tail ?? ""}`;
}

/** A missing closing tag marks only its opener, never the rest of the field. */
export function parseDialogue(text) {
  const spans = [];
  const token = /<d>|<\/d>/g;
  let opening = null;
  let found;
  const incomplete = (start) => spans.push({ start, end: start + 3,
    raw: "<d>", language: "", words: "", complete: false });
  while ((found = token.exec(text))) {
    if (found[0] === "<d>") {
      if (opening !== null) incomplete(opening);
      opening = found.index;
    } else if (opening !== null) {
      const end = token.lastIndex;
      const inside = text.slice(opening + 3, found.index);
      const language = /^\[([^\]\n]{1,40})\][ \t]?/.exec(inside);
      spans.push({ start: opening, end, raw: text.slice(opening, end),
        language: language?.[1] ?? "", words: language ? inside.slice(language[0].length) : inside,
        complete: true });
      opening = null;
    }
  }
  if (opening !== null) incomplete(opening);
  return spans;
}

/** The stable speaker token is storage syntax; the compiler owns S numbers. */
export function parseSpeech(text, span) {
  if (!span?.complete) return null;
  const before = text.slice(0, span.start);
  const candidates = [
    ...before.matchAll(/\(S(@[A-Za-z][A-Za-z0-9_]*(?:\s*,\s*@[A-Za-z][A-Za-z0-9_]*)*)\)[ \t]+/g),
    ...before.matchAll(/(@[A-Za-z][A-Za-z0-9_]*(?:\s*,\s*@[A-Za-z][A-Za-z0-9_]*)*)\s+\(S\d+(?:\s*,\s*S?\d+)*\)[ \t]+/g),
  ].sort((a, b) => b.index - a.index);
  const match = candidates.find((item) => /^[^<>\n]{0,500}$/.test(before.slice(item.index + item[0].length)));
  if (!match) return null;
  const lead = before.slice(match.index + match[0].length).trim();
  const known = DELIVERY.find((item) => lead === item.lead || lead === item.together);
  const tail = known?.id === "voiceover"
    ? text.slice(span.end).match(/^\s*while their lips remain completely closed\./)?.[0] ?? "" : "";
  const end = span.end + tail.length;
  return { start: match.index, end, raw: text.slice(match.index, end),
    who: match[1].split(",").map((handle) => handle.trim().slice(1)),
    delivery: known?.id ?? "says", lead: known ? null : lead,
    language: span.language, words: span.words };
}
