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

/**
 * From a long extracted page, return the `cap`-sized window that best matches the
 * query terms, so a huge single-page guide (e.g. a full GameFAQs walkthrough) is
 * trimmed to the relevant section instead of just its opening. Returns the head
 * slice when the page is short or nothing matches.
 *
 * ponytail: naive keyword-density scan over overlapping windows, not semantic
 * search; upgrade path is embeddings / chunk re-ranking if this misses.
 *
 * @param {string} text
 * @param {string} query
 * @param {number} cap
 * @returns {string}
 */
export function focusSection(text, query, cap) {
  if (typeof text !== "string") return "";
  if (text.length <= cap) return text;

  const terms = (query || "").toLowerCase().match(/[a-z0-9]{4,}/g) || [];
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
