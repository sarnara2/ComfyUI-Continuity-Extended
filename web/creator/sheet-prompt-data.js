// Model-facing phrases stay English; only their labels and explanations are localized.
export const SHEET_PROMPT_PRESETS = [
  {
    id: "builtin:sheet-natural", label: "Natural photographic identity", category: "Photographic",
    identity: "The same referenced person in every panel. Keep the facial structure, hair, body proportions and clothing assigned by the reference roles. Natural photographic texture, including visible skin detail and small asymmetries; no beauty retouching.",
    negative: "beauty-filter smoothing, altered facial structure, extra people, watermark, unrelated props",
  },
  {
    id: "builtin:sheet-animation", label: "Animation model consistency", category: "Illustration",
    identity: "A hand-drawn animation reference of the same referenced character. Preserve recognizable facial features, hairstyle, proportions and outfit from the assigned sources. Consistent clean line weight, flat color areas and the same silhouette across all panels.",
    negative: "inconsistent line weight, changing outfit details, changing hair length, unrelated props, watermark",
  },
  {
    id: "builtin:sheet-costume", label: "Costume construction details", category: "Clothing",
    identity: "The same referenced person wearing the outfit assigned by the clothing reference. Keep the face and hair from their identity source. Show consistent seams, closures, layered fabric, trim and garment proportions without adding new ornaments.",
    negative: "invented fasteners, missing garment layers, inconsistent trim, unrelated jewelry, watermark",
  },
  {
    id: "builtin:sheet-equipment", label: "Equipment and accessory continuity", category: "Details",
    identity: "The same referenced person with equipment and accessories taken only from the assigned sources. Keep the identity and clothing consistent. Preserve straps, buckles, attachment points and the relationship between carried equipment and the body.",
    negative: "floating accessories, duplicated equipment, impossible straps, added weapons, watermark",
  },
  {
    id: "builtin:sheet-materials", label: "Readable material surfaces", category: "Materials",
    identity: "The same referenced person and assigned outfit in every panel. Keep identity and proportions unchanged. Make fabric weave, leather grain, painted metal and other surfaces already present in the references readable under consistent soft lighting.",
    negative: "invented material patterns, plastic-looking skin, excessive gloss, changing surface colors, watermark",
  },
  {
    id: "builtin:sheet-expressions", label: "Acting and expression continuity", category: "Performance",
    identity: "The same referenced person throughout the selected expressions. Keep facial proportions, age appearance, hair and outfit consistent. Expressions change the brows, eyes and mouth naturally without replacing the face or exaggerating its anatomy.",
    negative: "different faces between panels, changed facial proportions, distorted teeth, exaggerated eye size, watermark",
  },
  {
    id: "builtin:sheet-hair", label: "Hair silhouette and construction", category: "Details",
    identity: "The same referenced person with hair taken from its assigned source. Preserve the hairline, parting, length, color and tied sections across the chosen angles. Keep strands and volume believable rather than inventing a different hairstyle for an unseen side.",
    negative: "changing parting, changing hair length, added hair ornaments, inconsistent tied sections, watermark",
  },
  {
    id: "builtin:sheet-hands", label: "Hands and worn accessories", category: "Details",
    identity: "The same referenced person with consistent skin and proportions. Preserve gloves, rings, bracelets and cuffs only when supplied by their assigned references. Show their construction and placement clearly while keeping plausible hand anatomy.",
    negative: "extra fingers, fused fingers, duplicated rings, misplaced cuffs, invented jewelry, watermark",
  },
  {
    id: "builtin:sheet-stylized", label: "Stylized game character concept", category: "Illustration",
    identity: "A stylized game character concept of the same referenced person. Preserve the defining facial features, hairstyle, body proportions and outfit from the assigned sources. Use coherent simplified shapes and readable color blocks without changing the character's identity.",
    negative: "unrelated character design, mismatched stylization between panels, changing costume motifs, watermark",
  },
  {
    id: "builtin:sheet-practical", label: "Practical makeup and distinctive marks", category: "Photographic",
    identity: "The same referenced person, preserving visible freckles, scars, tattoos and practical makeup from their assigned sources. Keep each distinctive mark on the same anatomical side and location, with consistent facial structure and natural skin texture.",
    negative: "mirrored distinctive marks, invented tattoos, erased scars, beauty-filter smoothing, watermark",
  },
];

export const SHEET_PROMPT_GUIDE = [
  ["Identity and style", "Write the shared identity and visual treatment in Identity description. Keep view, pose and expression choices in Cells; use Extra prompt for a single cell."],
  ["Reference ownership", "Use recognized English role words such as face, hair, body, clothes and voice. Roles are not automatically translated. A blank role claims nothing; two enabled references claiming the same feature are not a sole source."],
  ["Exclusions and layout", "Negative prompt is appended as Do not include. Builder prepares reference tags, panel instructions and H3 sections; you do not need to duplicate them. Caption labels are a separate setting."],
  ["Reusable prompts", "Presets replace only Identity description and Negative prompt, including empty fields. Your references, roles, cells, models and generation settings stay unchanged. Results are guidance, not a guarantee."],
];

export const SHEET_PROMPT_EXAMPLES = [
  { field: "Identity description", text: "The same referenced person; preserve facial structure, skin texture and natural asymmetry.", meaning: "Preserve identity without beautifying the face." },
  { field: "Identity description", text: "Keep the assigned outfit, including its seams, fasteners and layered fabric, consistent.", meaning: "Keep costume construction consistent across panels." },
  { field: "Identity description", text: "Clean hand-drawn line art and flat colors, retaining the referenced character's defining features.", meaning: "Change rendering style while asking to retain the character." },
  { field: "Identity description", text: "Preserve the location and anatomical side of the referenced freckles, scars and tattoos.", meaning: "Avoid moving or mirroring distinctive marks." },
  { field: "Reference role", text: "face and hair", meaning: "Assign this reference to facial identity and hairstyle." },
  { field: "Reference role", text: "body and clothes", meaning: "Assign proportions and clothing, not facial identity." },
  { field: "Reference role", text: "shoes and stockings", meaning: "Assign footwear and legwear from this source." },
  { field: "Reference role", text: "glasses and earrings", meaning: "Assign these accessories without claiming the whole face." },
  { field: "Reference role", text: "voice and accent", meaning: "Assign an audio or video reference to the voice." },
  { field: "Negative prompt", text: "watermark, extra people, unrelated props", meaning: "Exclude unwanted additions; do not write H3 section headers." },
  { field: "Negative prompt", text: "changed facial proportions, changing hair length, mismatched outfit details", meaning: "Discourage identity and outfit inconsistencies." },
  { field: "Extra prompt", text: "Show the glove fastening and keep the fingers relaxed and clearly separated.", meaning: "Add a visible detail to this cell only, not the whole sheet." },
];

export function applySheetPrompt(state, preset) {
  state.sheet_data.globalPrompt = typeof preset.identity === "string" ? preset.identity : "";
  state.sheet_data.negativePrompt = typeof preset.negative === "string" ? preset.negative : "";
}

export function sheetPromptValues(state) {
  return { identity: state.sheet_data.globalPrompt ?? "", negative: state.sheet_data.negativePrompt ?? "" };
}

export function newSheetPromptId() {
  if (typeof crypto.randomUUID === "function") return `custom:${crypto.randomUUID()}`;
  // randomUUID requires HTTPS/localhost; ComfyUI may also be opened over a LAN.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `custom:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
