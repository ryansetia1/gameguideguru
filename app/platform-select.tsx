"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

const PLATFORMS: { group: string; items: string[] }[] = [
  {
    group: "Nintendo",
    items: [
      "NES",
      "SNES",
      "Nintendo 64",
      "GameCube",
      "Wii",
      "Wii U",
      "Nintendo Switch",
      "Nintendo Switch 2",
      "Game Boy",
      "Game Boy Color",
      "Game Boy Advance",
      "Nintendo DS",
      "Nintendo 3DS",
    ],
  },
  {
    group: "PlayStation",
    items: [
      "PlayStation (PS1)",
      "PlayStation 2",
      "PlayStation 3",
      "PlayStation 4",
      "PlayStation 5",
      "PSP",
      "PS Vita",
    ],
  },
  {
    group: "Xbox",
    items: ["Xbox", "Xbox 360", "Xbox One", "Xbox Series X|S"],
  },
  {
    group: "Sega",
    items: ["Sega Genesis / Mega Drive", "Sega Saturn", "Dreamcast"],
  },
  {
    group: "Lainnya",
    items: ["PC", "Mobile (iOS/Android)", "Arcade"],
  },
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function PlatformSelect({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return PLATFORMS;
    return PLATFORMS.map((section) => ({
      group: section.group,
      items: section.items.filter((item) =>
        item.toLowerCase().includes(needle),
      ),
    })).filter((section) => section.items.length > 0);
  }, [query]);

  const flat = useMemo(() => groups.flatMap((section) => section.items), [groups]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (flat[active]) commit(flat[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="combo" ref={rootRef}>
      <button
        type="button"
        className="combo-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={value ? "" : "placeholder"}>
          {value || "Pilih platform (opsional)"}
        </span>
        {value ? (
          <span
            className="combo-clear"
            role="button"
            tabIndex={-1}
            aria-label="Kosongkan platform"
            onClick={(event) => {
              event.stopPropagation();
              commit("");
            }}
          >
            ×
          </span>
        ) : (
          <span className="combo-caret" aria-hidden="true">
            ▾
          </span>
        )}
      </button>

      {open && (
        <div className="combo-panel">
          <input
            ref={searchRef}
            className="combo-search"
            type="text"
            value={query}
            placeholder="Cari platform..."
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            aria-label="Cari platform"
            autoComplete="off"
          />
          <ul className="combo-list" id={listId} role="listbox">
            {flat.length === 0 && (
              <li className="combo-empty">Tidak ada platform yang cocok</li>
            )}
            {groups.map((section) => (
              <li key={section.group} role="presentation">
                <p className="combo-group-label">{section.group}</p>
                <ul role="presentation">
                  {section.items.map((item) => {
                    const index = flat.indexOf(item);
                    return (
                      <li
                        key={item}
                        role="option"
                        aria-selected={item === value}
                        className={`combo-option${index === active ? " active" : ""}`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => commit(item)}
                      >
                        {item}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
