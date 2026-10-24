import { t } from "./i18n.js";

// Compiler diagnostics are English protocol text today. Translate only where
// they are shown: the raw response still drives recovery decisions, and the
// compiled prompt itself must remain exactly what the model will receive.
// Anchored templates leave filenames, handles and unknown third-party errors
// intact. This is deliberately not a translator for arbitrary prompt prose.
const RULES = [
  [/^(@[^\s]+): a subject needs something behind it — a picture or a clip to be built out of, a description of what they look like, a feature of theirs, a LoRA with a trigger word, or the person they stand in for$/,
    "{subject} has no reference or description yet. Attach a picture or video, describe the subject, add a feature or a LoRA trigger word, or select the person to replace.", ["subject"]],
  [/^(@[^\s]+) walks on here, and their reference files are not attached to this shot — enable or attach one of them again, or describe what they look like, or take the name out of this shot's prompt$/,
    "{subject} is mentioned in this segment, but its reference files are not attached. Enable or attach a reference, describe the subject, or remove the handle from this segment's prompt.", ["subject"]],
  [/^(@[^\s]+) walks on here, and every picture they are built out of waits for a word this shot does not say \((.*)\) — write one of them, or take the words off one of their pictures, or describe them$/,
    "{subject}'s reference files require a trigger word ({words}) that is missing from this segment. Add a trigger word, remove the file's trigger condition, or describe the subject.", ["subject", "words"]],
  [/^(@[^\s]+) is sent as words alone to this family, and there are none — describe them, or send their pictures$/,
    "{subject} is sent as text only, but has no description. Describe the subject or send its images.", ["subject"]],
  [/^(@[^\s]+) is both a subject and an attached file — one `@` means one thing, so rename one of them$/,
    "{handle} is used for both a cast member and a reference file. Rename one handle.", ["handle"]],
  [/^(@[^\s]+) is also a file's handle — one @ means one thing$/,
    "{handle} is used for both a cast member and a reference file. Rename one handle.", ["handle"]],
  [/^two subjects are both called (@[^\s]+)$/,
    "Two cast members share the handle {handle}. Rename one of them.", ["handle"]],
  [/^(@[^\s]+) is built out of (@[^\s]+), which is another subject — a subject is built out of files$/,
    "{subject} uses {source}, which is another cast member. Choose a reference file instead.", ["subject", "source"]],
  [/^(@[^\s]+) is built out of (@[^\s]+), which is not attached to this generation$/,
    "{subject} uses {source}, but that reference file is not attached to this generation.", ["subject", "source"]],
  [/^built out of (.+), which is not attached here$/,
    "References {handles} are not attached here. Attach them or remove their cast links.", ["handles"]],
  [/^(@[^\s]+) is this shot's (start|end) frame — a moment of the video being made, not a reference they are made of$/,
    "{handle} is this segment's {frame} frame. Use an ordinary reference file for the cast member.", ["handle", "frame"], ["frame"]],
  [/^(@[^\s]+) is built out of (@[^\s]+), which is a (.+) — a keyframe is a fact about one moment of the target video, not a reference somebody is made of$/,
    "{subject} uses {source} as a reference, but its role is {role}. Choose a reference file instead of a keyframe.", ["subject", "source", "role"], ["role"]],
  [/^(@[^\s]+)'s voice is (@[^\s]+), which is a (.+) — a voice reference is audio$/,
    "{subject}'s voice uses {source}, but its type is {kind}. Choose an audio reference.", ["subject", "source", "kind"], ["kind"]],
  [/^(@[^\s]+) takes its (motion|place) from (@[^\s]+), which is not attached to this generation$/,
    "{subject} gets its {purpose} from {source}, but that reference is not attached to this generation.", ["subject", "purpose", "source"], ["purpose"]],
  [/^(@[^\s]+) takes its (motion|place) from (@[^\s]+), which is not (a reference video|a reference picture or video)$/,
    "{subject} gets its {purpose} from {source}. Choose {wanted}.", ["subject", "purpose", "source", "wanted"], ["purpose", "wanted"]],
  [/^(.+) references (.+) but no such asset is attached$/,
    "{field} references {handles}, but those reference files are not attached.", ["field", "handles"]],
  [/^(.+) references (.+) but (?:it is muted — unmute it to send the picture, or take the mention out to render without it|they are muted — unmute them to send the pictures, or take the mentions out to render without them)$/,
    "References {handles} are muted. Enable them to send the files, or remove their handles from {field}.", ["field", "handles"]],
  [/^(.+): no filename$/,
    "{handle} has no reference filename.", ["handle"]],
  [/^(.+): ref_size must be 'match' or 'max'$/,
    "{handle}: reference size must be match or max.", ["handle"]],
  [/^(.+) is not in the input folder any more$/,
    "{filename} is no longer in the input folder.", ["filename"]],
  [/^The usage rule for (.+) mentions (.+), but \2 is not cited in this shot\. Cite \2 in a segment field to send that reference\.$/,
    "The usage rule for {subject} mentions {handle}, but this segment does not use that reference. Add {handle} to a segment field to send it.", ["subject", "handle"]],
  [/^Replacement reference (.+) was captured from an earlier file attached as (.+)\. Re-capture it to identify the target in the current video; its original capture is unchanged\.$/,
    "Replacement reference {handle} was captured from an earlier file at {source}. Capture it again to identify the target in the current video.", ["handle", "source"]],
  [/^The source video for replacement reference (.+) is not attached here\. Attach the source or re-capture the replacement target\.$/,
    "The source video for replacement reference {handle} is not attached here. Attach the source or capture the replacement target again.", ["handle"]],
  [/^Replacement reference (.+) is outside the current trim of (.+)\. Re-capture a frame inside the selected portion\.$/,
    "Replacement reference {handle} is outside the current trim of {source}. Capture a frame inside the selected range.", ["handle", "source"]],
];

function localized(text, depth) {
  const direct = t(text);
  if (direct !== text) return direct;
  // Merged and individual passes can each add a scope prefix. Bound recursion
  // in case a third-party exception contains an unusually long nested chain.
  const prefix = depth < 8 && /^(segment|shot) (\d+): ([\s\S]+)$/.exec(text);
  if (prefix) return t(prefix[1] === "segment" ? "segment {number}: {message}" : "shot {number}: {message}", {
    number: prefix[2], message: localized(prefix[3], depth + 1),
  });
  for (const [pattern, key, names, translated = []] of RULES) {
    const match = pattern.exec(text);
    if (!match) continue;
    const params = Object.fromEntries(names.map((name, index) => [name,
      translated.includes(name) ? t(match[index + 1]) : match[index + 1]]));
    return t(key, params);
  }
  return text;
}

/** Display a known compiler/UI diagnostic in the current locale. */
export function localizeDiagnostic(value) {
  return localized(value == null ? "" : String(value?.message ?? value), 0);
}
