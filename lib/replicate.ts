import Replicate from "replicate";

import { SYSTEM_INSTRUCTION, buildPrompt } from "@/lib/prompt";
import type { SearchResult } from "@/lib/tavily";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type Turn = {
  role: "user" | "assistant";
  content: string;
};

export type SummarizeInput = {
  game?: string;
  platform?: string;
  question: string;
  sources: SearchResult[];
  history?: Turn[];
};

export async function summarize(input: SummarizeInput): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is not configured");
  }

  const model = process.env.REPLICATE_MODEL || DEFAULT_MODEL;
  if (!/^[^/\s]+\/[^/\s]+(?::[^/\s]+)?$/.test(model)) {
    throw new Error("REPLICATE_MODEL must use owner/name format");
  }

  const replicate = new Replicate({ auth: token });
  const output: unknown = await replicate.run(
    model as `${string}/${string}` | `${string}/${string}:${string}`,
    {
      input: {
        prompt: buildPrompt(input),
        // Gemini on Replicate: keep the persona/rules out of the prompt field.
        system_instruction: SYSTEM_INSTRUCTION,
        temperature: 0.35,
        max_output_tokens: 1200,
        // Flash is a reasoning model; disable thinking so the budget goes to the
        // visible answer and short replies don't come back empty.
        thinking_budget: 0,
      },
      signal: AbortSignal.timeout(50_000),
    },
  );

  const summary =
    typeof output === "string"
      ? output
      : Array.isArray(output)
        ? output.filter((part) => typeof part === "string").join("")
        : "";

  if (!summary.trim()) {
    throw new Error("Replicate returned an empty response");
  }

  return summary.trim();
}
