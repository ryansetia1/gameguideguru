import assert from "node:assert/strict";

import { buildPrompt } from "../lib/prompt.js";

const prompt = buildPrompt("How do I open the gate?", [
  { title: "Test guide", content: "Use the Omega Key." },
]);

assert.match(prompt, /How do I open the gate\?/);
assert.match(prompt, /Use the Omega Key\./);
assert.match(prompt, /untrusted reference text/);

console.log("Prompt self-check passed.");
