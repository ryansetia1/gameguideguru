"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { getSupabase } from "@/lib/supabase";
import {
  applyTheme,
  loadTheme,
  saveTheme,
  themeFromUserMetadata,
} from "@/lib/theme.js";

type ThemeMode = "system" | "light" | "dark";

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "system", label: "System" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
];

function themeLabel(mode: ThemeMode) {
  return OPTIONS.find((option) => option.mode === mode)?.label ?? "System";
}

async function persistThemeForUser(mode: ThemeMode) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.auth.updateUser({ data: { theme: mode } });
  } catch (error) {
    console.error("Failed to save theme preference:", error);
  }
}

export function ThemeToggle({ user }: { user: User | null }) {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pushedLocalRef = useRef(false);

  useEffect(() => {
    if (!user) {
      pushedLocalRef.current = false;
      const stored = loadTheme();
      setMode(stored);
      applyTheme(stored);
      return;
    }

    const remote = themeFromUserMetadata(user.user_metadata);
    if (remote) {
      setMode(remote);
      saveTheme(remote);
      return;
    }

    const local = loadTheme();
    setMode(local);
    applyTheme(local);
    if (!pushedLocalRef.current && local !== "system") {
      pushedLocalRef.current = true;
      void persistThemeForUser(local);
    }
  }, [user]);

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
    if (user) void persistThemeForUser(next);
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
