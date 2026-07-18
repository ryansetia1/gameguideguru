"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase";

export type SteamGame = {
  appId: number;
  name: string;
  playtimeMinutes: number;
  cover: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (game: SteamGame) => void;
};

function formatPlaytime(minutes: number) {
  if (minutes < 60) return `${minutes}m played`;
  const hours = Math.round(minutes / 60);
  return `${hours}h played`;
}

export function SteamLibrary({ open, onClose, onPick }: Props) {
  const [games, setGames] = useState<SteamGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadLibrary = useCallback(async () => {
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

    setLoading(true);
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
      if (payload.error === "fetch_failed") {
        setError("Could not reach Steam right now. Try again in a moment.");
      } else if (!list.length) {
        setError(
          "No games found. Make sure your Steam profile and Game details are set to Public.",
        );
      }
    } catch {
      setError("Could not load Steam library.");
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadLibrary();
  }, [open, loadLibrary]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="library" role="dialog" aria-label="Steam library">
      <div className="library-head">
        <span>Steam library</span>
        <button type="button" className="sidebar-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {loading ? (
        <p className="library-empty">Loading your Steam games…</p>
      ) : error && games.length === 0 ? (
        <p className="library-empty">{error}</p>
      ) : (
        <div className="library-grid">
          {games.map((game) => (
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
              {game.playtimeMinutes > 0 && <small>{formatPlaytime(game.playtimeMinutes)}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
