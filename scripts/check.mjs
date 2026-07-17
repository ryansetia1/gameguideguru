import assert from "node:assert/strict";

import { mapGames } from "../lib/games.js";
import { SYSTEM_INSTRUCTION, buildPrompt } from "../lib/prompt.js";

// System instruction carries the persona + safety rules.
assert.match(SYSTEM_INSTRUCTION, /untrusted data/);
assert.match(SYSTEM_INSTRUCTION, /SUPPORTING evidence/);

const prompt = buildPrompt({
  game: "Link's Awakening",
  platform: "Game Boy",
  question: "How do I open the gate?",
  sources: [{ title: "Test guide", content: "Use the Omega Key." }],
  history: [
    { role: "user", content: "Where is the first dungeon?" },
    { role: "assistant", content: "Head east from the beach." },
  ],
});

assert.match(prompt, /Game: Link's Awakening/);
assert.match(prompt, /Platform: Game Boy/);
assert.match(prompt, /How do I open the gate\?/);
assert.match(prompt, /Use the Omega Key\./);
assert.match(prompt, /Player: Where is the first dungeon\?/);
assert.match(prompt, /Guide: Head east from the beach\./);

// Empty search must not crash and must tell the model to fall back to knowledge.
const noSources = buildPrompt({ question: "What now?", sources: [] });
assert.match(noSources, /No web results were found/);
assert.match(noSources, /Game: unspecified/);
assert.doesNotMatch(noSources, /Conversation so far/);

// IGDB result mapping: keep valid entries, derive year from first_release_date
// (unix seconds), and drop malformed/empty ones.
const games = mapGames([
  { id: 1, name: "Final Fantasy VII", first_release_date: 852076800 }, // 1997
  { id: 2, name: "   " }, // dropped: empty name
  { id: 3, name: "Chrono Trigger" }, // no date -> empty year
  { bad: true }, // dropped: no id/name
]);
assert.equal(games.length, 2);
assert.deepEqual(games[0], { id: 1, name: "Final Fantasy VII", year: "1997" });
assert.equal(games[1].year, "");
assert.deepEqual(mapGames("not-an-array"), []);

console.log("Self-check passed.");
