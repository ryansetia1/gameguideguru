"use client";

import { FormEvent, useState } from "react";

type Source = {
  title: string;
  url: string;
};

type Guide = {
  summary: string;
  sources: Source[];
};

const examples = [
  "Cara mengalahkan Emerald Weapon di FF7",
  "Lokasi Lionheart di FF8",
  "Puzzle Cloister of Trials FFX",
];

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setGuide(null);
    setLoading(true);

    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data: unknown = await response.json();

      if (
        !response.ok ||
        !data ||
        typeof data !== "object" ||
        !("summary" in data) ||
        typeof data.summary !== "string" ||
        !("sources" in data) ||
        !Array.isArray(data.sources)
      ) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Panduan belum dapat dibuat. Coba lagi.";
        throw new Error(message);
      }

      setGuide({ summary: data.summary, sources: data.sources as Source[] });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Terjadi kesalahan yang tidak diketahui.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <nav className="nav" aria-label="Brand">
        <a className="brand" href="#" aria-label="GameGuide Guru, beranda">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>GAMEGUIDE GURU</span>
        </a>
        <span className="live-badge">
          <span aria-hidden="true" />
          WEB LIVE
        </span>
      </nav>

      <section className="hero">
        <p className="eyebrow">COMPANION UNTUK PETUALANG</p>
        <h1>
          Macet? <em>Lanjut main.</em>
        </h1>
        <p className="intro">
          Ceritakan titik buntumu. Kami mencari panduan di web dan merangkumnya
          menjadi langkah yang langsung bisa dimainkan.
        </p>
      </section>

      <section className="search-panel" aria-labelledby="search-title">
        <form onSubmit={handleSubmit}>
          <label id="search-title" htmlFor="query">
            Di mana kamu terjebak?
          </label>
          <div className="textarea-wrap">
            <textarea
              id="query"
              name="query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Contoh: Bagaimana cara membuka pintu kuil di Zanarkand?"
              minLength={3}
              maxLength={300}
              rows={4}
              required
              disabled={loading}
            />
            <span className="counter" aria-hidden="true">
              {query.length}/300
            </span>
          </div>

          <div className="examples" aria-label="Contoh pertanyaan">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                disabled={loading}
              >
                {example}
              </button>
            ))}
          </div>

          <button
            className="submit"
            type="submit"
            disabled={loading || query.trim().length < 3}
          >
            <span>{loading ? "Mencari jalan keluar" : "Temukan jalan keluar"}</span>
            {loading ? (
              <span className="loader" aria-hidden="true" />
            ) : (
              <span className="arrow" aria-hidden="true">
                ↗
              </span>
            )}
          </button>
        </form>
      </section>

      <div className="status" aria-live="polite">
        {loading && (
          <div className="loading-card">
            <span className="scan-line" aria-hidden="true" />
            <p>Menjelajahi walkthrough dan forum pemain...</p>
          </div>
        )}

        {error && (
          <div className="error-card" role="alert">
            <span aria-hidden="true">!</span>
            <p>{error}</p>
          </div>
        )}

        {guide && (
          <article className="guide">
            <header>
              <p>
                <span aria-hidden="true">◆</span> RUTE DITEMUKAN
              </p>
              <span>AI SUMMARY</span>
            </header>
            <div className="answer">{guide.summary}</div>

            <footer>
              <h2>Sumber penelusuran</h2>
              <ol>
                {guide.sources.map((source, index) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      <span className="source-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <strong>{source.title}</strong>
                        <small>{hostname(source.url)}</small>
                      </span>
                      <span className="source-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </footer>
          </article>
        )}
      </div>

      <p className="disclaimer">
        Panduan dirangkum oleh AI. Periksa sumber untuk detail versi game.
      </p>
    </main>
  );
}
