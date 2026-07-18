/** @typedef {"item" | "recruit" | "sidequest" | "tip" | "warning"} HighlightKind */
/** @typedef {{ kind: HighlightKind, title: string, detail: string }} Highlight */

export const KINDS = /** @type {const} */ ([
  "item",
  "recruit",
  "sidequest",
  "tip",
  "warning",
]);

/** @type {Record<HighlightKind, string>} */
export const KIND_LABELS = {
  item: "Key items",
  recruit: "Recruits",
  sidequest: "Side quests",
  tip: "Tips",
  warning: "Heads up",
};

const KIND_SET = new Set(KINDS);

/**
 * @param {unknown} value
 * @returns {Highlight[]}
 */
export function coerceHighlights(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const kind = "kind" in item ? item.kind : undefined;
    const title = "title" in item ? item.title : undefined;
    if (typeof kind !== "string" || !KIND_SET.has(/** @type {HighlightKind} */ (kind))) {
      return [];
    }
    if (typeof title !== "string") return [];
    const trimmedTitle = title.replace(/\s+/g, " ").trim();
    if (!trimmedTitle) return [];
    const detail =
      "detail" in item && typeof item.detail === "string"
        ? item.detail.replace(/\s+/g, " ").trim()
        : "";
    return [{ kind: /** @type {HighlightKind} */ (kind), title: trimmedTitle, detail }];
  });
}

/**
 * The model routinely emits pretty-printed JSON with RAW newlines/tabs inside the
 * string values (invalid JSON — those must be escaped). Walk the text and escape
 * control chars that occur inside a string literal so JSON.parse accepts it.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeControlCharsInStrings(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
    }
    out += ch;
  }
  return out;
}

/**
 * @param {string} text
 * @returns {{ answer: string, highlights: Highlight[] }}
 */
export function parseSummary(text) {
  const raw = text.trim();
  if (!raw) return { answer: "", highlights: [] };

  let jsonText = raw;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) jsonText = fenced[1].trim();

  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return { answer: raw, highlights: [] };
  }

  try {
    const parsed = JSON.parse(escapeControlCharsInStrings(jsonText.slice(start, end + 1)));
    if (!parsed || typeof parsed !== "object") {
      return { answer: raw, highlights: [] };
    }
    const answer =
      "answer" in parsed && typeof parsed.answer === "string"
        ? parsed.answer.trim()
        : "";
    if (!answer) return { answer: raw, highlights: [] };
    const highlights =
      "highlights" in parsed ? coerceHighlights(parsed.highlights) : [];
    return { answer, highlights };
  } catch {
    return { answer: raw, highlights: [] };
  }
}
