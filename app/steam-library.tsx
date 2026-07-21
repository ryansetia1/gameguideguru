"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getSupabase } from "@/lib/supabase";
import { ClearButton } from "./clear-button";
import { IconSort, IconX } from "./icons";

export type SteamGame = {
  appId: number;
  name: string;
  playtimeMinutes: number;
  cover: string;
  /** "YYYY" from the library route's batch GetItems lookup; "" when unknown. */
  releaseYear?: string;
  /** Unix seconds of last play (0 = never/hidden); powers "Recently played". */
  lastPlayedUnix?: number;
};

// Steam owned-games has no "date added", so "Recently played" is the closest
// recency default. Each option toggles asc/desc (arrow in the menu). Persisted
// per-account as "<key>:<dir>" in user_metadata (+ localStorage mirror) so the
// choice syncs across devices.
const STEAM_SORT_KEY = "gg:steam-sort";
type SortDir = "asc" | "desc";
// defaultDir = the natural first direction when an option is freshly selected.
const SORT_OPTIONS = [
  { key: "recent", label: "Recently played", defaultDir: "desc" },
  { key: "playtime", label: "Most played", defaultDir: "desc" },
  { key: "name", label: "Name", defaultDir: "asc" },
  { key: "year", label: "Release year", defaultDir: "desc" },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]["key"];
const DEFAULT_SORT: SortKey = "recent";
const VALID_SORTS = new Set(SORT_OPTIONS.map((option) => option.key));

function defaultDir(key: SortKey): SortDir {
  return SORT_OPTIONS.find((option) => option.key === key)?.defaultDir ?? "desc";
}

type SortPref = { key: SortKey; dir: SortDir };

function coerceSortPref(value: unknown): SortPref {
  if (typeof value !== "string") return { key: DEFAULT_SORT, dir: defaultDir(DEFAULT_SORT) };
  const [rawKey, rawDir] = value.split(":");
  const key = VALID_SORTS.has(rawKey as SortKey) ? (rawKey as SortKey) : DEFAULT_SORT;
  const dir: SortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : defaultDir(key);
  return { key, dir };
}

function loadSortPref(): SortPref {
  if (typeof window === "undefined") return { key: DEFAULT_SORT, dir: defaultDir(DEFAULT_SORT) };
  try {
    return coerceSortPref(window.localStorage.getItem(STEAM_SORT_KEY));
  } catch {
    return { key: DEFAULT_SORT, dir: defaultDir(DEFAULT_SORT) };
  }
}

// Ascending comparator per key (dir flips it); name is alphabetical, the rest numeric.
function compareBy(a: SteamGame, b: SteamGame, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name);
    case "playtime":
      return a.playtimeMinutes - b.playtimeMinutes;
    case "year":
      return (Number(a.releaseYear) || 0) - (Number(b.releaseYear) || 0);
    case "recent":
    default:
      return (a.lastPlayedUnix ?? 0) - (b.lastPlayedUnix ?? 0);
  }
}

function sortGames(games: SteamGame[], { key, dir }: SortPref): SteamGame[] {
  const factor = dir === "desc" ? -1 : 1;
  return [...games].sort((a, b) => factor * compareBy(a, b, key));
}

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (game: SteamGame) => void;
  /** Steam id (or user id) — namespaces the cache so accounts don't leak. */
  cacheKey?: string;
};

// Best-effort localStorage cache so reopening the library is instant instead of
// re-hitting Steam every time. Stale-while-revalidate: show cached games, then
// refresh in the background. Keyed per account. 6h TTL.
const LIB_CACHE_KEY = "gg:steam-library";
const LIB_TTL = 6 * 60 * 60 * 1000;

function readLibCache(key: string): SteamGame[] | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const all = JSON.parse(window.localStorage.getItem(LIB_CACHE_KEY) || "{}");
    const hit = all[key];
    return hit && Date.now() - hit.ts < LIB_TTL ? (hit.games as SteamGame[]) : null;
  } catch {
    return null;
  }
}

function writeLibCache(key: string, games: SteamGame[]) {
  if (!key || typeof window === "undefined") return;
  try {
    const all = JSON.parse(window.localStorage.getItem(LIB_CACHE_KEY) || "{}");
    all[key] = { games, ts: Date.now() };
    window.localStorage.setItem(LIB_CACHE_KEY, JSON.stringify(all));
  } catch {
    // over quota / disabled — skip caching
  }
}

export function SteamLibrary({ open, onClose, onPick, cacheKey = "" }: Props) {
  const [games, setGames] = useState<SteamGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortPref>({
    key: DEFAULT_SORT,
    dir: defaultDir(DEFAULT_SORT),
  });
  const [sortOpen, setSortOpen] = useState(false);
  const sortWrapRef = useRef<HTMLDivElement>(null);

  const loadLibrary = useCallback(
    async (showSpinner: boolean) => {
    const supabase = getSupabase();
    if (!supabase) {
      setError("Sign in to use your Steam library.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Sign in to use your Steam library.");
      return;
    }

    if (showSpinner) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/steam/library", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload: {
        games?: SteamGame[];
        connected?: boolean;
        available?: boolean;
        error?: string;
      } = await response.json();

      if (!response.ok) throw new Error("Could not load Steam library");

      if (payload.available === false) {
        setError("Steam library is not configured on this server.");
        setGames([]);
        return;
      }

      if (!payload.connected) {
        setError("Connect Steam from the sidebar to import your games.");
        setGames([]);
        return;
      }

      const list = Array.isArray(payload.games) ? payload.games : [];
      setGames(list);
      if (list.length) writeLibCache(cacheKey, list);
      if (payload.error === "fetch_failed") {
        setError("Could not reach Steam right now. Try again in a moment.");
      } else if (!list.length) {
        setError(
          "No games found. Make sure your Steam profile and Game details are set to Public.",
        );
      }
    } catch {
      setError("Could not load Steam library.");
    } finally {
      setLoading(false);
    }
    },
    [cacheKey],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    // Show cached games instantly (no skeleton); always revalidate in the
    // background. First-ever open (no cache) shows the loading skeletons.
    const cached = readLibCache(cacheKey);
    if (cached) {
      setGames(cached);
      void loadLibrary(false);
    } else {
      setGames([]);
      void loadLibrary(true);
    }
  }, [open, loadLibrary, cacheKey]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Hydrate the sort preference on open: localStorage first (instant), then the
  // account's user_metadata (authoritative across devices).
  useEffect(() => {
    if (!open) return;
    setSort(loadSortPref());
    setSortOpen(false);
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      const remote = data.user?.user_metadata?.steam_sort;
      if (typeof remote === "string") setSort(coerceSortPref(remote));
    });
  }, [open]);

  // Close the sort menu on an outside click.
  useEffect(() => {
    if (!sortOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!sortWrapRef.current?.contains(event.target as Node)) setSortOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [sortOpen]);

  // Same option -> flip direction; different option -> select at its default dir.
  // The menu stays open so the arrow toggle is visible and re-toggleable.
  function pickSort(key: SortKey) {
    const next: SortPref =
      key === sort.key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDir(key) };
    setSort(next);
    const serialized = `${next.key}:${next.dir}`;
    try {
      window.localStorage.setItem(STEAM_SORT_KEY, serialized);
    } catch {
      // quota / private mode — the metadata write below still syncs it
    }
    void getSupabase()?.auth.updateUser({ data: { steam_sort: serialized } });
  }

  if (!open) return null;

  const term = query.trim().toLowerCase();
  const filtered = sortGames(
    term ? games.filter((game) => game.name.toLowerCase().includes(term)) : games,
    sort,
  );

  return (
    <>
      <button
        type="button"
        className="library-backdrop open"
        aria-label="Close Steam library"
        onClick={onClose}
      />
      <div className="library open" role="dialog" aria-label="Steam library">
        <div className="library-panel">
          <div className="library-head">
            <span>Steam library</span>
            <button type="button" className="sidebar-close" aria-label="Close" onClick={onClose}>
              <IconX />
            </button>
          </div>
          {loading && games.length === 0 ? (
            <div className="library-grid" aria-label="Loading games" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="library-skeleton" aria-hidden="true">
                  <span className="library-skeleton-tile" />
                  <span className="library-skeleton-bar" />
                  <span className="library-skeleton-bar short" />
                </div>
              ))}
            </div>
          ) : error && games.length === 0 ? (
            <p className="library-empty">{error}</p>
          ) : (
            <>
              {games.length > 0 && (
                <div className="library-search-wrap">
                  <div className="library-search-row">
                    <div className="field-clear-wrap" style={{ flex: 1, minWidth: 0 }}>
                      <input
                        id="steam-library-search"
                        type="search"
                        className="library-search"
                        placeholder="Search your games…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        autoComplete="off"
                        aria-label="Search Steam games"
                      />
                      <ClearButton
                        show={query.length > 0}
                        onClear={() => {
                          setQuery("");
                          document.getElementById("steam-library-search")?.focus();
                        }}
                        label="Clear search"
                      />
                    </div>
                    <div className="library-sort" ref={sortWrapRef}>
                      <button
                        type="button"
                        className="library-sort-btn"
                        aria-label="Sort games"
                        aria-haspopup="menu"
                        aria-expanded={sortOpen}
                        onClick={() => setSortOpen((cur) => !cur)}
                      >
                        <IconSort />
                      </button>
                      {sortOpen && (
                        <div className="library-sort-menu" role="menu">
                          {SORT_OPTIONS.map((option) => {
                            const active = sort.key === option.key;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                role="menuitemradio"
                                aria-checked={active}
                                className={`library-sort-item${active ? " active" : ""}`}
                                onClick={() => pickSort(option.key)}
                              >
                                <span>{option.label}</span>
                                <span className="library-sort-arrow" aria-hidden="true">
                                  {active ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {filtered.length === 0 ? (
                <p className="library-empty">No games match “{query.trim()}”.</p>
              ) : (
                <div className="library-grid">
                  {filtered.map((game) => (
                <button
                  key={game.appId}
                  type="button"
                  className="library-card"
                  onClick={() => onPick(game)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="cover-tile"
                    src={game.cover}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                  />
                  <strong>{game.name}</strong>
                  {/* Cosmetic "Steam" label (games here are all Steam/PC). */}
                  <small>{["Steam", game.releaseYear].filter(Boolean).join(" · ")}</small>
                </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
