/**
 * User-facing copy when preferred-guide indexing fails or the URL looks like a hub.
 * @param {{ available?: boolean, indexed?: boolean, hubWarning?: boolean }} input
 * @returns {string | null}
 */
export function guideIngestHint(input = {}) {
  if (input.hubWarning) {
    return "That link looks like an index page. Paste the page with the full walkthrough.";
  }
  if (input.available === false) return null;
  if (input.indexed === false) {
    return "Couldn't index that guide. Answering from web search instead.";
  }
  return null;
}
