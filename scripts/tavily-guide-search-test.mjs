/**
 * One-off probe: compare Tavily query shapes for guide picker search.
 * Usage: node --env-file=.env.local scripts/tavily-guide-search-test.mjs
 */
const TAVILY_URL = "https://api.tavily.com/search";

const CASES = [
  {
    label: "current (app)",
    query: "The Exit 8 PC walkthrough guide",
    include_domains: ["gamefaqs.gamespot.com"],
  },
  {
    label: "quoted title + PC",
    query: '"The Exit 8" PC walkthrough guide',
    include_domains: ["gamefaqs.gamespot.com"],
  },
  {
    label: "quoted title only",
    query: '"The Exit 8" walkthrough',
    include_domains: ["gamefaqs.gamespot.com"],
  },
  {
    label: "current open web",
    query: "The Exit 8 PC walkthrough guide",
    include_domains: [],
  },
  {
    label: "quoted open web",
    query: '"The Exit 8" PC walkthrough guide',
    include_domains: [],
  },
  {
    label: "quoted + trusted tier",
    query: '"The Exit 8" PC walkthrough anomalies',
    include_domains: [
      "ign.com",
      "gamespot.com",
      "game8.co",
      "powerpyx.com",
      "fextralife.com",
      "polygon.com",
      "gamesradar.com",
      "gamerant.com",
      "gamespew.com",
    ],
  },
];

function titleMatch(title, game) {
  const t = title.toLowerCase();
  const g = game.toLowerCase();
  if (t.includes(g)) return "exact-name";
  const tokens = g.split(/\s+/).filter((w) => w.length > 2);
  const hits = tokens.filter((w) => t.includes(w));
  return hits.length ? `partial:${hits.join(",")}` : "no-match";
}

async function tavilySearch(apiKey, { query, include_domains }) {
  const body = {
    query,
    search_depth: "advanced",
    max_results: 8,
    include_answer: false,
    exclude_domains: [
      "youtube.com",
      "m.youtube.com",
      "youtu.be",
      "twitch.tv",
      "tiktok.com",
      "instagram.com",
      "facebook.com",
      "x.com",
      "twitter.com",
      "pinterest.com",
    ],
    ...(include_domains.length ? { include_domains } : {}),
  };

  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const payload = await res.json();
  return Array.isArray(payload.results) ? payload.results : [];
}

const apiKey = process.env.TAVILY_API_KEY;
if (!apiKey) {
  console.error("TAVILY_API_KEY missing");
  process.exit(1);
}

const GAME = "The Exit 8";

for (const testCase of CASES) {
  console.log("\n" + "=".repeat(72));
  console.log(`CASE: ${testCase.label}`);
  console.log(`QUERY: ${testCase.query}`);
  console.log(
    `DOMAINS: ${testCase.include_domains.length ? testCase.include_domains.join(", ") : "(open web)"}`,
  );
  console.log("-".repeat(72));

  try {
    const results = await tavilySearch(apiKey, testCase);
    if (!results.length) {
      console.log("(no results)");
      continue;
    }
    for (const [i, row] of results.entries()) {
      const title = typeof row.title === "string" ? row.title : "(no title)";
      const url = typeof row.url === "string" ? row.url : "(no url)";
      const score = typeof row.score === "number" ? row.score.toFixed(3) : "?";
      const match = titleMatch(title, GAME);
      const flag = match === "exact-name" ? "OK" : match.startsWith("partial") ? "??" : "XX";
      console.log(`${i + 1}. [${flag}] score=${score} match=${match}`);
      console.log(`   ${title}`);
      console.log(`   ${url}`);
    }
  } catch (error) {
    console.error("ERROR:", error instanceof Error ? error.message : String(error));
  }
}
