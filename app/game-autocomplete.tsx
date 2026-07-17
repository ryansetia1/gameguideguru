"use client";

import { useEffect, useRef, useState } from "react";

type Game = { id: number; name: string; year: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function GameAutocomplete({ value, onChange, disabled }: Props) {
  const [results, setResults] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const justPicked = useRef(false);

  useEffect(() => {
    const query = value.trim();
    // Skip the fetch triggered by our own selection.
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/games?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data: unknown = await response.json();
        const games =
          data &&
          typeof data === "object" &&
          "games" in data &&
          Array.isArray((data as { games: unknown }).games)
            ? ((data as { games: Game[] }).games)
            : [];
        const available =
          data && typeof data === "object" && "available" in data
            ? Boolean((data as { available: unknown }).available)
            : true;
        setResults(games);
        setActive(-1);
        setOpen(available);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function pick(game: Game) {
    justPicked.current = true;
    onChange(game.name);
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (active >= 0 && results[active]) {
        event.preventDefault();
        pick(results[active]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showPanel = open && value.trim().length >= 2;

  return (
    <div className="combo" ref={rootRef}>
      <input
        id="game"
        name="game"
        className="combo-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="mis. The Legend of Zelda: Link's Awakening"
        maxLength={120}
        autoComplete="off"
        role="combobox"
        aria-expanded={showPanel}
        aria-autocomplete="list"
        disabled={disabled}
      />
      {showPanel && (
        <div className="combo-panel">
          <ul className="combo-list" role="listbox">
            {loading && results.length === 0 && (
              <li className="combo-empty">Mencari game...</li>
            )}
            {!loading && results.length === 0 && (
              <li className="combo-empty">Tidak ada game yang cocok</li>
            )}
            {results.map((game, index) => (
              <li
                key={game.id}
                role="option"
                aria-selected={index === active}
                className={`combo-option${index === active ? " active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(game);
                }}
              >
                {game.name}
                {game.year && <span className="combo-year"> ({game.year})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
