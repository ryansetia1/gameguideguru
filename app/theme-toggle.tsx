"use client";

import { useEffect, useRef, useState } from "react";

import { applyTheme, loadTheme, saveTheme } from "@/lib/theme.js";

type ThemeMode = "system" | "light" | "dark";

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "system", label: "System" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
];

function themeLabel(mode: ThemeMode) {
  return OPTIONS.find((option) => option.mode === mode)?.label ?? "System";
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadTheme();
    setMode(stored);
    applyTheme(stored);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function pick(next: ThemeMode) {
    setMode(next);
    saveTheme(next);
    setOpen(false);
  }

  return (
    <div className="theme-toggle-wrap" ref={wrapRef}>
      <button
        type="button"
        className="nav-button theme-toggle"
        aria-label={`Theme: ${themeLabel(mode)}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{mode === "dark" ? "☾" : mode === "light" ? "☀" : "◐"}</span>
      </button>
      {open && (
        <div className="theme-toggle-menu" role="menu">
          {OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="menuitemradio"
              aria-checked={mode === option.mode}
              className={mode === option.mode ? "active" : undefined}
              onClick={() => pick(option.mode)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
