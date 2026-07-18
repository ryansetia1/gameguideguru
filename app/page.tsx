"use client";

import type { User } from "@supabase/supabase-js";
import { FormEvent, type MouseEvent, useCallback, useEffect, useRef, useState } from "react";

import { AuthPanel } from "./auth-panel";
import { GameAutocomplete } from "./game-autocomplete";
import { PlatformSelect } from "./platform-select";
import {
  KINDS,
  KIND_LABELS,
  coerceHighlights,
  type Highlight,
} from "@/lib/highlights.js";
import { getSupabase, type Chat } from "@/lib/supabase";

type Source = {
  title: string;
  url: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  highlights?: Highlight[];
};

const EXAMPLES_DISMISSED_KEY = "gg:examples-dismissed";

const examples = [
  { game: "The Legend of Zelda: Link's Awakening", platform: "Game Boy", q: "How do I reach the first dungeon?" },
  { game: "Final Fantasy VII", platform: "PlayStation (PS1)", q: "How do I beat Emerald Weapon?" },
  { game: "Elden Ring", platform: "PC", q: "Best build for beginners" },
];

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function normGame(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function coerceMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Message[] => {
    if (!item || typeof item !== "object") return [];
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return [];
    }
    const rawSources = (item as { sources?: unknown }).sources;
    const sources = Array.isArray(rawSources) ? (rawSources as Source[]) : undefined;
    const highlights = coerceHighlights((item as { highlights?: unknown }).highlights);
    return [
      {
        role,
        content,
        sources,
        ...(highlights.length ? { highlights } : {}),
      },
    ];
  });
}

function groupHighlights(highlights: Highlight[]) {
  return KINDS.flatMap((kind) => {
    const items = highlights.filter((h) => h.kind === kind);
    return items.length ? [{ kind, items }] : [];
  });
}

export default function Home() {
  const [game, setGame] = useState("");
  const [platform, setPlatform] = useState("");
  const [preferredUrl, setPreferredUrl] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [examplesDismissed, setExamplesDismissed] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const feedRef = useRef<HTMLDivElement>(null);
  const gamesRef = useRef<HTMLDivElement>(null);
  const jumpRef = useRef(false);
  const conversationGame = useRef("");
  const activeChatIdRef = useRef<string | null>(null);

  const supabaseReady = Boolean(getSupabase());

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    feedRef.current?.scrollIntoView({
      behavior: jumpRef.current ? "auto" : "smooth",
      block: "end",
    });
    jumpRef.current = false;
  }, [messages, loading]);

  useEffect(() => {
    setExamplesDismissed(
      typeof window !== "undefined" &&
        window.localStorage.getItem(EXAMPLES_DISMISSED_KEY) === "1",
    );
  }, []);

  const loadChats = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from("chats")
      .select("id, game, platform, preferred_guide_url, messages, updated_at")
      .order("updated_at", { ascending: false });
    if (!loadError && data) setChats(data as Chat[]);
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      void loadChats();
    } else {
      setChats([]);
      setActiveChatId(null);
    }
  }, [user, loadChats]);

  useEffect(() => {
    if (!gamesOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!gamesRef.current?.contains(event.target as Node)) setGamesOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [gamesOpen]);

  function dismissExamples() {
    window.localStorage.setItem(EXAMPLES_DISMISSED_KEY, "1");
    setExamplesDismissed(true);
  }

  function newGame() {
    setActiveChatId(null);
    setMessages([]);
    setGame("");
    setPlatform("");
    setPreferredUrl("");
    setInput("");
    setError("");
    setEditingIndex(null);
    setEditingText("");
    conversationGame.current = "";
    setGamesOpen(false);
    requestAnimationFrame(() => {
      document.getElementById("game")?.focus();
    });
  }

  function openChat(chat: Chat) {
    jumpRef.current = true;
    setActiveChatId(chat.id);
    setGame(chat.game);
    setPlatform(chat.platform);
    setPreferredUrl(chat.preferred_guide_url);
    setMessages(coerceMessages(chat.messages));
    conversationGame.current = chat.game;
    setInput("");
    setError("");
    setEditingIndex(null);
    setEditingText("");
    setGamesOpen(false);
  }

  async function signOut() {
    await getSupabase()?.auth.signOut();
    setGamesOpen(false);
  }

  async function deleteChat(chat: Chat, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!window.confirm(`Delete "${chat.game || "Untitled game"}"? This cannot be undone.`)) {
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from("chats").delete().eq("id", chat.id);
    if (chat.id === activeChatId) newGame();
    void loadChats();
  }

  async function persistChat(nextMessages: Message[], targetChatId: string | null) {
    const supabase = getSupabase();
    if (!supabase || !user) return null;
    const payload = {
      game,
      platform,
      preferred_guide_url: preferredUrl,
      messages: nextMessages,
      updated_at: new Date().toISOString(),
    };
    try {
      if (targetChatId) {
        await supabase.from("chats").update(payload).eq("id", targetChatId);
        void loadChats();
        return targetChatId;
      }
      const { data } = await supabase
        .from("chats")
        .insert({ ...payload, user_id: user.id })
        .select("id")
        .single();
      const newId = data ? (data as { id: string }).id : null;
      if (newId) {
        setActiveChatId(newId);
        void loadChats();
      }
      return newId;
    } catch (caught) {
      console.error("Failed to save chat:", caught);
      return targetChatId;
    }
  }

  async function runTurn(
    question: string,
    priorMessages: Message[],
    targetChatId: string | null,
  ) {
    setError("");
    setLoading(true);
    setEditingIndex(null);
    setEditingText("");

    const history = priorMessages
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));
    const optimistic: Message[] = [
      ...priorMessages,
      { role: "user", content: question },
    ];
    setMessages(optimistic);

    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, platform, question, history, preferredUrl }),
      });
      const data: unknown = await response.json();

      if (
        !response.ok ||
        !data ||
        typeof data !== "object" ||
        !("answer" in data) ||
        typeof data.answer !== "string"
      ) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Couldn't build a guide. Please try again.";
        throw new Error(message);
      }

      const sources =
        "sources" in data && Array.isArray(data.sources)
          ? (data.sources as Source[])
          : [];
      const highlights = coerceHighlights(
        "highlights" in data ? data.highlights : undefined,
      );
      const nextMessages: Message[] = [
        ...priorMessages,
        { role: "user", content: question },
        {
          role: "assistant",
          content: data.answer as string,
          sources,
          ...(highlights.length ? { highlights } : {}),
        },
      ];
      setMessages(nextMessages);
      conversationGame.current = game;
      const savedId = await persistChat(nextMessages, targetChatId);
      if (savedId) activeChatIdRef.current = savedId;
    } catch (caught) {
      setMessages(priorMessages);
      setError(
        caught instanceof Error ? caught.message : "An unknown error occurred.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (question.length < 2 || loading) return;

    const switching =
      messages.length > 0 &&
      normGame(game) !== normGame(conversationGame.current);
    const priorMessages = switching ? [] : messages;
    const targetChatId = switching ? null : activeChatIdRef.current;
    if (switching) setActiveChatId(null);

    setInput("");
    await runTurn(question, priorMessages, targetChatId);
  }

  function startEdit(index: number) {
    if (loading) return;
    setEditingIndex(index);
    setEditingText(messages[index].content);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditingText("");
  }

  async function saveEdit(index: number) {
    const text = editingText.trim();
    if (text.length < 2 || loading) return;
    await runTurn(text, messages.slice(0, index), activeChatIdRef.current);
  }

  async function retry(index: number) {
    if (loading || index < 1 || messages[index - 1].role !== "user") return;
    const question = messages[index - 1].content;
    await runTurn(question, messages.slice(0, index - 1), activeChatIdRef.current);
  }

  const started = messages.length > 0;

  return (
    <main>
      <nav className="nav" aria-label="Brand">
        <a className="brand" href="#" aria-label="GameGuide Guru, home">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>GAMEGUIDE GURU</span>
        </a>

        <div className="nav-actions">
          {user ? (
            <>
              <div className="games-menu" ref={gamesRef}>
                <button
                  type="button"
                  className="nav-button"
                  aria-haspopup="menu"
                  aria-expanded={gamesOpen}
                  onClick={() => setGamesOpen((prev) => !prev)}
                >
                  Your games ▾
                </button>
                {gamesOpen && (
                  <div className="games-panel" role="menu">
                    <button type="button" className="games-new" onClick={newGame}>
                      + New game
                    </button>
                    {chats.length === 0 ? (
                      <p className="games-empty">No saved games yet.</p>
                    ) : (
                      <ul>
                        {chats.map((chat) => (
                          <li key={chat.id} className="games-row">
                            <button
                              type="button"
                              className={chat.id === activeChatId ? "active" : ""}
                              onClick={() => openChat(chat)}
                            >
                              <strong>{chat.game || "Untitled game"}</strong>
                              {chat.platform && <small>{chat.platform}</small>}
                            </button>
                            <button
                              type="button"
                              className="games-delete"
                              aria-label={`Delete ${chat.game || "Untitled game"}`}
                              onClick={(event) => void deleteChat(chat, event)}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <button type="button" className="nav-button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : supabaseReady ? (
            <button
              type="button"
              className="nav-button"
              onClick={() => setAuthOpen(true)}
            >
              Sign in
            </button>
          ) : (
            <span className="live-badge">
              <span aria-hidden="true" />
              WEB LIVE
            </span>
          )}
        </div>
      </nav>

      {!started && (
        <section className="hero">
          <p className="eyebrow">COMPANION FOR ADVENTURERS</p>
          <h1>
            Stuck? <em>Keep playing.</em>
          </h1>
          <p className="intro">
            Pick your game and platform, tell us where you are stuck, then ask as
            many follow-ups as you like. We search the web for guides and
            summarize them into steps you can act on.
          </p>
        </section>
      )}

      <section className="setup" aria-label="Game context">
        <div className="field">
          <label htmlFor="game">Game name</label>
          <GameAutocomplete value={game} onChange={setGame} disabled={loading} />
        </div>
        <div className="field">
          <span className="field-label" id="platform-label">
            Platform
          </span>
          <PlatformSelect value={platform} onChange={setPlatform} />
        </div>
        <div className="field field-wide">
          <label htmlFor="preferred-guide">Preferred guide link (optional)</label>
          <input
            id="preferred-guide"
            type="url"
            inputMode="url"
            value={preferredUrl}
            onChange={(event) => setPreferredUrl(event.target.value)}
            placeholder="e.g. https://gamefaqs.gamespot.com/...  — we source from here first"
            maxLength={300}
            autoComplete="off"
            disabled={loading}
          />
        </div>
      </section>

      {!started && !examplesDismissed && (
        <div className="examples-block" aria-label="Examples">
          <div className="examples-head">
            <span className="examples-label">Try an example</span>
            <button
              type="button"
              className="examples-dismiss"
              aria-label="Hide examples"
              onClick={dismissExamples}
            >
              ×
            </button>
          </div>
          <div className="examples">
            {examples.map((example) => (
              <button
                key={example.q}
                type="button"
                onClick={() => {
                  setGame(example.game);
                  setPlatform(example.platform);
                  setInput(example.q);
                }}
                disabled={loading}
              >
                <strong>{example.game}</strong>
                <span>{example.q}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {started && (
        <section className="feed" aria-live="polite">
          {messages.map((message, index) =>
            message.role === "user" ? (
              <div className="turn user" key={index}>
                {editingIndex === index ? (
                  <div className="edit-box">
                    <textarea
                      className="edit-textarea"
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      rows={3}
                      maxLength={300}
                      disabled={loading}
                    />
                    <div className="edit-actions">
                      <button
                        type="button"
                        className="turn-action"
                        onClick={() => void saveEdit(index)}
                        disabled={loading || editingText.trim().length < 2}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="turn-action turn-action-muted"
                        onClick={cancelEdit}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>{message.content}</p>
                    <button
                      type="button"
                      className="turn-action turn-action-icon"
                      aria-label="Edit message"
                      onClick={() => startEdit(index)}
                      disabled={loading}
                    >
                      ✎
                    </button>
                  </>
                )}
              </div>
            ) : (
              <article className="turn guide" key={index}>
                <div className="guide-head">
                  <div className="guide-tag">
                    <span aria-hidden="true">◆</span> ROUTE FOUND
                  </div>
                  <button
                    type="button"
                    className="turn-action turn-action-icon"
                    aria-label="Regenerate answer"
                    onClick={() => void retry(index)}
                    disabled={loading}
                  >
                    ↻
                  </button>
                </div>
                <div className="answer">{message.content}</div>
                {message.highlights && message.highlights.length > 0 && (
                  <div className="highlights">
                    {groupHighlights(message.highlights).map(({ kind, items }) => (
                      <section key={kind} className="highlight-group">
                        <h3 className="highlight-label">{KIND_LABELS[kind]}</h3>
                        <ul className="highlight-list">
                          {items.map((item, i) =>
                            item.detail ? (
                              <li key={`${kind}-${i}`}>
                                <details className={`highlight highlight-${kind}`}>
                                  <summary>{item.title}</summary>
                                  <p>{item.detail}</p>
                                </details>
                              </li>
                            ) : (
                              <li key={`${kind}-${i}`}>
                                <div className={`highlight highlight-${kind} highlight-note`}>
                                  {item.title}
                                </div>
                              </li>
                            ),
                          )}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
                {message.sources && message.sources.length > 0 && (
                  <details className="sources">
                    <summary>Sources ({message.sources.length})</summary>
                    <ol>
                      {message.sources.map((source, i) => (
                        <li key={source.url}>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            <span className="source-number">
                              {String(i + 1).padStart(2, "0")}
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
                  </details>
                )}
              </article>
            ),
          )}

          {loading && (
            <div className="turn guide loading-card">
              <span className="scan-line" aria-hidden="true" />
              <p>Searching walkthroughs and player forums...</p>
            </div>
          )}

          {error && (
            <div className="error-card" role="alert">
              <span aria-hidden="true">!</span>
              <p>{error}</p>
            </div>
          )}
          <div ref={feedRef} />
        </section>
      )}

      <form className={`composer${started ? " docked" : ""}`} onSubmit={handleSubmit}>
        <div className="composer-inner">
          <textarea
            id="query"
            name="query"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              started
                ? "Ask a follow-up... (e.g. where to after that boss?)"
                : "Where are you stuck?"
            }
            rows={started ? 1 : 3}
            maxLength={300}
            required
            disabled={loading}
          />
          <button
            className="submit"
            type="submit"
            disabled={loading || input.trim().length < 2}
            aria-label="Send question"
          >
            {loading ? (
              <span className="loader" aria-hidden="true" />
            ) : (
              <span className="arrow" aria-hidden="true">
                ↗
              </span>
            )}
          </button>
        </div>
      </form>

      <p className="disclaimer">
        Guides are summarized by AI. Check the sources for version-specific details.
      </p>

      {authOpen && <AuthPanel onClose={() => setAuthOpen(false)} />}
    </main>
  );
}
