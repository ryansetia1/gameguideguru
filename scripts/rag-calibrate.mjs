#!/usr/bin/env node
// Preferred-guide RAG calibration harness (Phase A + B of docs/plan/rag-tuning-roadmap.md).
//
// Replays a fixed eval set through the dev-only /api/rag-eval probe, splits the
// top-similarity scores into in-guide vs off-guide clusters, and recommends the
// GUIDE_HIT threshold that best separates them. Also reports the per-rank score
// dropoff so you can judge RETRIEVE_K (3 vs 5).
//
// Usage:
//   1. npm run dev              (needs Supabase + SUMOPOD_API_KEY + TAVILY_API_KEY set)
//   2. cp docs/plan/rag-eval-set.example.jsonl docs/plan/rag-eval-set.jsonl
//      then edit it: 10+ in-guide + 10+ off-guide rows for guides YOU ingested.
//   3. node scripts/rag-calibrate.mjs [path/to/eval.jsonl]   (or: npm run eval:rag)
//
// First run per guide also ingests it (slow); re-runs are fast.

import { readFileSync } from "node:fs";

const BASE = process.env.RAG_EVAL_BASE || "http://localhost:3000";
const FILE = process.argv[2] || "docs/plan/rag-eval-set.jsonl";
const GUIDE_HIT_FALLBACK = 0.35;
// Pause between probes — set e.g. RAG_EVAL_DELAY_MS=6500 to stay under a trial
// key's rate limit (Cohere trial rerank is ~10 req/min).
const DELAY_MS = Number(process.env.RAG_EVAL_DELAY_MS) || 0;
/** @param {number} ms */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @typedef {{ game?: string, platform?: string, guideUrls: string[], question: string, expected: "in-guide" | "off-guide", expectContains?: string }} EvalRow
 */

/** @param {number[]} nums */
function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/** @param {number | null | undefined} n */
const fmt = (n) => (n == null || !Number.isFinite(n) ? " n/a " : n.toFixed(3));

/** @param {string} file @returns {EvalRow[]} */
function loadRows(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    console.error(`Cannot read ${file}. Copy the .example.jsonl and fill it in.`);
    process.exit(1);
  }
  /** @type {EvalRow[]} */
  const rows = [];
  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      console.error(`Skipping malformed JSON on line ${i + 1}`);
      return;
    }
    const urls = row.guideUrls ?? (row.guideUrl ? [row.guideUrl] : []);
    if (!urls.length || !row.question || !row.expected) {
      console.error(`Skipping line ${i + 1}: needs guideUrls, question, expected`);
      return;
    }
    if (row.expected !== "in-guide" && row.expected !== "off-guide") {
      console.error(`Skipping line ${i + 1}: expected must be in-guide|off-guide`);
      return;
    }
    rows.push({ ...row, guideUrls: urls });
  });
  return rows;
}

/** @param {EvalRow} row */
async function probe(row) {
  const res = await fetch(`${BASE}/api/rag-eval`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      guideUrls: row.guideUrls,
      query: row.question,
      game: row.game,
      platform: row.platform,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${detail.slice(0, 200)}`);
  }
  return res.json();
}

// Sweep every observed score as a candidate cutoff; pick the one that maximizes
// (in-guide tops >= t) + (off-guide tops < t). Ties break toward the midpoint
// of the gap so the threshold sits between clusters, not on an edge.
/**
 * @param {number[]} inTops
 * @param {number[]} offTops
 */
function recommendThreshold(inTops, offTops) {
  const candidates = [...new Set([...inTops, ...offTops])].sort((a, b) => a - b);
  let best = { t: GUIDE_HIT_FALLBACK, correct: -1, mid: 0 };
  for (let i = 0; i < candidates.length; i++) {
    // Try a cutoff just above each observed score.
    const t = candidates[i];
    const correct =
      inTops.filter((x) => x >= t).length + offTops.filter((x) => x < t).length;
    if (correct > best.correct) best = { t, correct, mid: 0 };
  }
  // Refine: if clusters are cleanly separated, use the midpoint of the gap.
  const maxOff = offTops.length ? Math.max(...offTops) : -Infinity;
  const minIn = inTops.length ? Math.min(...inTops) : Infinity;
  const clean = minIn > maxOff;
  const recommended = clean ? (minIn + maxOff) / 2 : best.t;
  return {
    recommended,
    clean,
    maxOff: offTops.length ? maxOff : null,
    minIn: inTops.length ? minIn : null,
    accuracy: best.correct / (inTops.length + offTops.length),
  };
}

function selftest() {
  /** @param {boolean} c @param {string} m */
  const assert = (c, m) => {
    if (!c) throw new Error(`selftest failed: ${m}`);
  };
  // Clean separation -> midpoint of the gap.
  const clean = recommendThreshold([0.6, 0.7, 0.8], [0.1, 0.2, 0.3]);
  assert(clean.clean, "clean clusters not detected");
  assert(Math.abs(clean.recommended - 0.45) < 1e-9, `expected 0.45, got ${clean.recommended}`);
  // Overlap -> not clean, accuracy < 1.
  const overlap = recommendThreshold([0.3, 0.5], [0.2, 0.4]);
  assert(!overlap.clean, "overlap wrongly reported clean");
  assert(overlap.accuracy < 1, "overlap should misclassify at least one");
  console.log("selftest passed");
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const rows = loadRows(FILE);
  if (!rows.length) {
    console.error("No usable eval rows.");
    process.exit(1);
  }
  console.log(`Probing ${rows.length} rows against ${BASE}/api/rag-eval ...\n`);

  const results = [];
  for (const [idx, row] of rows.entries()) {
    if (idx > 0 && DELAY_MS) await wait(DELAY_MS);
    process.stdout.write(`  ${row.expected.padEnd(9)} ${row.question.slice(0, 60)} ... `);
    try {
      const r = await probe(row);
      // Did retrieval land on the paragraph you targeted? Check rank-1 AND
      // anywhere in top-K (top-K is what Gemini actually gets fed on a hit).
      let retrievalMark = "";
      if (row.expectContains) {
        const want = row.expectContains.toLowerCase();
        const rank1 = String(r.topChunk ?? "").toLowerCase().includes(want);
        const rankAt = (r.chunkTexts || []).findIndex((/** @type {string} */ c) =>
          String(c).toLowerCase().includes(want),
        );
        r.retrievalRank1 = rank1;
        r.retrievalInTopK = rankAt >= 0;
        r.retrievalRank = rankAt >= 0 ? rankAt + 1 : null;
        retrievalMark = rank1
          ? " chunk:rank1"
          : rankAt >= 0
            ? ` chunk:rank${rankAt + 1}`
            : " chunk:MISS";
      }
      results.push({ ...row, ...r });
      console.log(`top=${fmt(r.top)} hit=${r.hit} k=${r.scores.length}${retrievalMark}`);
    } catch (e) {
      console.log(`ERROR ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const inRes = results.filter((r) => r.expected === "in-guide");
  const offRes = results.filter((r) => r.expected === "off-guide");
  const inTops = inRes.map((r) => r.top).filter((x) => x != null);
  const offTops = offRes.map((r) => r.top).filter((x) => x != null);

  console.log("\n=== Clusters (top similarity) ===");
  console.log(
    `  in-guide  (${inTops.length}): min=${fmt(Math.min(...inTops))} median=${fmt(median(inTops))} max=${fmt(Math.max(...inTops))}`,
  );
  console.log(
    `  off-guide (${offTops.length}): min=${fmt(Math.min(...offTops))} median=${fmt(median(offTops))} max=${fmt(Math.max(...offTops))}`,
  );

  if (inTops.length && offTops.length) {
    const rec = recommendThreshold(inTops, offTops);
    console.log("\n=== GUIDE_HIT recommendation ===");
    if (rec.clean) {
      console.log(
        `  Clean separation: off-guide max=${fmt(rec.maxOff)} < in-guide min=${fmt(rec.minIn)}`,
      );
      console.log(`  -> set GUIDE_HIT = ${fmt(rec.recommended)} (midpoint of the gap)`);
    } else {
      console.log(
        `  Clusters OVERLAP (off max=${fmt(rec.maxOff)} >= in min=${fmt(rec.minIn)}).`,
      );
      console.log(
        `  Best single cutoff = ${fmt(rec.recommended)} at ${(rec.accuracy * 100).toFixed(0)}% accuracy.`,
      );
      console.log(
        `  Overlap means a hard cosine cutoff can't cleanly split these -> Phase C reranker is the real fix.`,
      );
    }
  } else {
    console.log("\nNeed at least one in-guide AND one off-guide result to recommend GUIDE_HIT.");
  }

  // RETRIEVE_K: how fast does relevance decay past rank N on real hits?
  /** @type {number[][]} */
  const perRank = [];
  for (const r of inRes) {
    /** @type {number[]} */
    const scores = r.scores || [];
    scores.forEach((s, i) => {
      (perRank[i] ||= []).push(s);
    });
  }
  if (perRank.length) {
    console.log("\n=== RETRIEVE_K analysis (in-guide median score by rank) ===");
    perRank.forEach((scores, i) => {
      console.log(`  rank ${i + 1}: median=${fmt(median(scores))}  (n=${scores.length})`);
    });
    console.log(
      "  If rank 4-5 medians sit far below rank 1-3, drop RETRIEVE_K 5 -> 3 (less noise + tokens).",
    );
  }

  // Retrieval correctness: did the targeted paragraph land at rank 1, and did
  // it land anywhere in top-K (what Gemini gets on a hit)?
  const checked = results.filter((r) => typeof r.retrievalInTopK === "boolean");
  if (checked.length) {
    const atRank1 = checked.filter((r) => r.retrievalRank1).length;
    const inTopK = checked.filter((r) => r.retrievalInTopK).length;
    console.log("\n=== Retrieval accuracy (expectContains) ===");
    console.log(`  rank 1:   ${atRank1}/${checked.length} (reranker would raise this)`);
    console.log(`  in top-K: ${inTopK}/${checked.length} (what Gemini actually sees on a hit)`);
    const notTop1 = checked.filter((r) => r.retrievalInTopK && !r.retrievalRank1);
    if (notTop1.length) {
      console.log("  Right paragraph present but NOT rank 1 (reranker territory):");
      for (const m of notTop1) console.log(`    - rank ${m.retrievalRank}: ${m.question.slice(0, 60)}`);
    }
    const absent = checked.filter((r) => !r.retrievalInTopK);
    if (absent.length) {
      console.log("  Paragraph absent from top-K (hybrid BM25 / chunking territory):");
      for (const m of absent) console.log(`    - ${m.question.slice(0, 70)}`);
    }
  }

  console.log(
    "\nNext: edit GUIDE_HIT (and maybe RETRIEVE_K) in lib/guide-rag.ts, update the calibration date comment, re-run to confirm.",
  );
}

main();
