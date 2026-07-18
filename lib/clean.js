/**
 * Strip navigation/boilerplate noise from a web search snippet so the prompt
 * receives readable prose instead of markdown link soup, GameFAQs call-to-
 * actions, and Q&A vote/user counters.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function cleanSnippet(text) {
  if (typeof text !== "string") return "";

  return (
    text
      // Markdown links -> keep the visible label only.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1 ")
      // Bare URLs.
      .replace(/https?:\/\/\S+/g, " ")
      // GameFAQs page call-to-actions.
      .replace(/what do you need help on\??/gi, " ")
      .replace(/would you recommend this (guide|faq)\??/gi, " ")
      // Q&A user + timestamp lines like "lightning012345 - 17 years ago".
      .replace(/\b[\w.-]+ - \d+ years? ago\b/gi, " ")
      .replace(/-\s*report\b/gi, " ")
      // Collapse the many newlines/spaces the extractor leaves behind.
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Generic search/prompt filler — skip when scoring windows so focus lands on
// game-specific terms (elf, dwarf, gauntlet) not walkthrough/guide boilerplate.
const FOCUS_STOP = new Set([
  "the",
  "and",
  "for",
  "you",
  "are",
  "not",
  "with",
  "from",
  "that",
  "this",
  "what",
  "will",
  "when",
  "where",
  "how",
  "story",
  "events",
  "guide",
  "walkthrough",
  "game",
  "playstation",
  "ps1",
  "psx",
]);

/**
 * From a long extracted page, return the `cap`-sized window that best matches the
 * query terms. ponytail: naive keyword-density scan, not semantic search.
 *
 * @param {string} text
 * @param {string} query
 * @param {number} cap
 * @returns {string}
 */
export function focusSection(text, query, cap) {
  if (typeof text !== "string") return "";
  if (text.length <= cap) return text;

  const terms = [
    ...new Set(
      ((query || "").toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(
        (term) => !FOCUS_STOP.has(term),
      ),
    ),
  ];
  if (!terms.length) return text.slice(0, cap);

  const lower = text.toLowerCase();
  const step = 400;
  const maxStart = text.length - cap;
  let bestStart = 0;
  let bestScore = -1;

  for (let start = 0; start <= maxStart; start += step) {
    const windowText = lower.slice(start, start + cap);
    let score = 0;
    for (const term of terms) {
      let idx = windowText.indexOf(term);
      while (idx !== -1) {
        score += 1;
        idx = windowText.indexOf(term, idx + term.length);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  // Snap forward to the next space so the window doesn't start mid-word.
  const snap = text.indexOf(" ", bestStart);
  const start = bestStart > 0 && snap !== -1 && snap - bestStart < 40 ? snap + 1 : bestStart;
  return text.slice(start, start + cap);
}
