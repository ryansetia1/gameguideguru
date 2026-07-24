"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

import {
  coercePlayerStyle,
  disablePlayerMemory,
  enablePlayerMemory,
  MEMORY_DRAFT_THRESHOLD,
  MEMORY_FULL_THRESHOLD,
  MEMORY_GAME_NOTE_CAP,
  MEMORY_STYLE_NOTE_CAP,
  MEMORY_TOGGLE_HINT,
  MEMORY_TOGGLE_LABEL,
  memoryRefreshCooldownRemainingMs,
} from "@/lib/player-memory.js";
import {
  gameMemoryPinKey,
  isGameNotePinned,
  isGameProgressPinned,
  isStyleFieldPinned,
  isStyleNotePinned,
  readStyleRecord,
  STYLE_FIELD_KEYS,
  STYLE_FIELD_OPTIONS,
  writeStyleRecord,
} from "@/lib/player-memory-pins.js";
import type { PlayerStyleUserPins } from "@/lib/player-memory-pins.js";
import { getSupabase } from "@/lib/supabase";

type PlayerStyleShape = ReturnType<typeof coercePlayerStyle>;
type StyleFieldKey = "answerLength" | "tone" | "language" | "detailLevel";

type MemoryState = {
  message_count: number;
  tier: string;
  style: Record<string, unknown>;
  last_summarized_at: string | null;
  last_manual_refresh_at: string | null;
};

type GameMemoryRow = {
  game_key: string;
  platform: string;
  progress: string | null;
  notes: string[];
};

type Props = {
  session: Session | null;
  onToast?: (message: string) => void;
};

const STYLE_FIELD_LABELS: Record<StyleFieldKey, string> = {
  answerLength: "Answer length",
  tone: "Tone",
  language: "Language",
  detailLevel: "Detail",
};

async function apiFetch(session: Session, path: string, init?: RequestInit) {
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers ?? {}),
    },
  });
}

function formatMemoryUpdated(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function memoryUpdateMeta(lastSummarized: string | null, cooldownMs: number) {
  const updated = formatMemoryUpdated(lastSummarized);
  if (!updated && cooldownMs <= 0) return "";
  const parts: string[] = [];
  if (updated) parts.push(`Updated ${updated}`);
  if (cooldownMs > 0) parts.push(`try again in ${Math.ceil(cooldownMs / 60_000)} min`);
  return parts.join(" · ");
}

function EditedBadge() {
  return <span className="player-memory-edited-badge">Edited by you</span>;
}

function PlayerMemorySkeleton() {
  return (
    <div
      className="field player-memory-section"
      aria-busy="true"
      aria-label="Loading style memory"
    >
      <span className="player-memory-skeleton player-memory-skeleton-label" aria-hidden />
      <div className="player-memory-skeleton player-memory-skeleton-toggle" aria-hidden />
      <div className="player-memory-skeleton player-memory-skeleton-hint" aria-hidden />
      <div className="player-memory-scroll player-memory-skeleton-scroll" aria-hidden>
        <div className="player-memory-skeleton player-memory-skeleton-line" />
        <div className="player-memory-skeleton player-memory-skeleton-line player-memory-skeleton-line--b" />
        <div className="player-memory-skeleton player-memory-skeleton-line player-memory-skeleton-line--c" />
        <div className="player-memory-skeleton player-memory-skeleton-line player-memory-skeleton-line--d" />
      </div>
      <div className="player-memory-action-row player-memory-skeleton-actions" aria-hidden>
        <div className="player-memory-skeleton player-memory-skeleton-btn" />
        <div className="player-memory-skeleton player-memory-skeleton-btn" />
      </div>
    </div>
  );
}

function formatGameKey(key: string) {
  return key.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function EditableNoteRow({
  value,
  pinned,
  onSave,
  onRemove,
}: {
  value: string;
  pinned: boolean;
  onSave: (next: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <li className="player-memory-note">
      <input
        type="text"
        className="player-memory-note-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const trimmed = draft.replace(/\s+/g, " ").trim();
          if (trimmed && trimmed !== value) onSave(trimmed);
          else if (!trimmed) onRemove();
          else setDraft(value);
        }}
      />
      {pinned ? <EditedBadge /> : null}
      <button type="button" className="player-memory-remove" onClick={onRemove} aria-label="Remove note">
        ×
      </button>
    </li>
  );
}

export function PlayerMemorySection({ session, onToast }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<MemoryState | null>(null);
  const [games, setGames] = useState<GameMemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!session || !supabase) {
      setEnabled(false);
      setState(null);
      setGames([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data: stateRow, error: stateError } = await supabase
        .from("player_memory_state")
        .select("message_count, tier, style, last_summarized_at, last_manual_refresh_at")
        .maybeSingle();
      if (stateError) throw stateError;

      if (!stateRow) {
        setEnabled(false);
        setState(null);
        setGames([]);
        return;
      }

      const { data: gameRows, error: gamesError } = await supabase
        .from("player_game_memory")
        .select("game_key, platform, progress, notes")
        .order("updated_at", { ascending: false });
      if (gamesError) throw gamesError;

      setEnabled(true);
      setState(stateRow as MemoryState);
      setGames((gameRows as GameMemoryRow[]) ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load memory.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistStyle = useCallback(
    async (nextStyle: PlayerStyleShape, nextPins: PlayerStyleUserPins) => {
      if (!session || !state) return false;
      const supabase = getSupabase();
      if (!supabase) return false;
      const payload = writeStyleRecord(nextStyle, nextPins);
      const { error: updateError } = await supabase
        .from("player_memory_state")
        .update({ style: payload, updated_at: new Date().toISOString() })
        .eq("user_id", session.user.id);
      if (updateError) {
        setError(updateError.message);
        return false;
      }
      setState({ ...state, style: payload });
      return true;
    },
    [session, state],
  );

  async function setMemoryEnabled(next: boolean) {
    const supabase = getSupabase();
    if (!session || !supabase) return;
    if (!next) {
      const ok = window.confirm("Turn off and clear what we've learned?");
      if (!ok) return;
    }
    setError("");
    try {
      if (next) {
        await enablePlayerMemory(supabase, session.user.id);
        onToast?.("Learning your style. Ask a few questions to get started.");
      } else {
        await disablePlayerMemory(supabase, session.user.id);
        setGames([]);
      }
      setEnabled(next);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update setting.");
    }
  }

  async function refreshNow() {
    if (!session || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const res = await apiFetch(session, "/api/player-memory/refresh", { method: "POST" });
      const body = (await res.json()) as {
        error?: string;
        state?: MemoryState | null;
        skipped?: string | null;
      };
      if (!res.ok) throw new Error(body.error || "Could not update memory.");
      if (body.state) setState(body.state);
      if (body.skipped === "no_new_messages") {
        onToast?.("No new questions since the last update.");
      } else {
        onToast?.("Profile updated.");
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update memory.");
    } finally {
      setRefreshing(false);
    }
  }

  async function saveStyleField(
    field: StyleFieldKey,
    value: string,
    style: PlayerStyleShape,
    userPins: PlayerStyleUserPins,
  ) {
    const nextStyle = { ...style };
    if (value) nextStyle[field] = value;
    else delete nextStyle[field];
    const fields = new Set(userPins.fields ?? []);
    fields.add(field);
    await persistStyle(nextStyle, { ...userPins, fields: [...fields] });
  }

  async function saveStyleNote(
    index: number,
    text: string,
    style: PlayerStyleShape,
    userPins: PlayerStyleUserPins,
  ) {
    const notes = [...(style.notes ?? [])];
    notes[index] = text;
    const notePins = [...(userPins.notes ?? [])];
    while (notePins.length < notes.length) notePins.push(false);
    notePins[index] = true;
    await persistStyle({ ...style, notes }, { ...userPins, notes: notePins });
  }

  async function removeStyleNote(
    index: number,
    style: PlayerStyleShape,
    userPins: PlayerStyleUserPins,
  ) {
    const notes = [...(style.notes ?? [])];
    notes.splice(index, 1);
    const notePins = [...(userPins.notes ?? [])];
    notePins.splice(index, 1);
    await persistStyle({ ...style, notes }, { ...userPins, notes: notePins });
  }

  async function addStyleNote(style: PlayerStyleShape, userPins: PlayerStyleUserPins) {
    const notes = style.notes ?? [];
    if (notes.length >= MEMORY_STYLE_NOTE_CAP) return;
    const text = window.prompt("Add a note about how you like answers")?.replace(/\s+/g, " ").trim();
    if (!text) return;
    const nextNotes = [...notes, text].slice(0, MEMORY_STYLE_NOTE_CAP);
    const notePins = [...(userPins.notes ?? []), true].slice(0, MEMORY_STYLE_NOTE_CAP);
    await persistStyle({ ...style, notes: nextNotes }, { ...userPins, notes: notePins });
  }

  async function saveGameProgress(
    gameKey: string,
    platform: string,
    progress: string,
    userPins: PlayerStyleUserPins,
    style: PlayerStyleShape,
  ) {
    if (!session) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const trimmed = progress.replace(/\s+/g, " ").trim().slice(0, 200);
    const { error: updateError } = await supabase
      .from("player_game_memory")
      .update({ progress: trimmed || null, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id)
      .eq("game_key", gameKey)
      .eq("platform", platform);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const key = gameMemoryPinKey(gameKey, platform);
    const gamesPins = { ...(userPins.games ?? {}) };
    gamesPins[key] = { ...gamesPins[key], progress: true };
    await persistStyle(style, { ...userPins, games: gamesPins });
    setGames((prev) =>
      prev.map((row) =>
        row.game_key === gameKey && row.platform === platform
          ? { ...row, progress: trimmed || null }
          : row,
      ),
    );
  }

  async function saveGameNote(
    gameKey: string,
    platform: string,
    index: number,
    text: string,
    userPins: PlayerStyleUserPins,
    style: PlayerStyleShape,
  ) {
    if (!session) return;
    const row = games.find((g) => g.game_key === gameKey && g.platform === platform);
    if (!row) return;
    const notes = [...(row.notes ?? [])];
    notes[index] = text;
    const supabase = getSupabase();
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("player_game_memory")
      .update({ notes, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id)
      .eq("game_key", gameKey)
      .eq("platform", platform);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const key = gameMemoryPinKey(gameKey, platform);
    const gamesPins = { ...(userPins.games ?? {}) };
    const notePins = [...(gamesPins[key]?.notes ?? [])];
    while (notePins.length < notes.length) notePins.push(false);
    notePins[index] = true;
    gamesPins[key] = { ...gamesPins[key], notes: notePins };
    await persistStyle(style, { ...userPins, games: gamesPins });
    setGames((prev) =>
      prev.map((g) => (g.game_key === gameKey && g.platform === platform ? { ...g, notes } : g)),
    );
  }

  async function removeGameNote(
    gameKey: string,
    platform: string,
    index: number,
    userPins: PlayerStyleUserPins,
    style: PlayerStyleShape,
  ) {
    if (!session) return;
    const row = games.find((g) => g.game_key === gameKey && g.platform === platform);
    if (!row) return;
    const notes = [...(row.notes ?? [])];
    notes.splice(index, 1);
    const supabase = getSupabase();
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("player_game_memory")
      .update({ notes, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id)
      .eq("game_key", gameKey)
      .eq("platform", platform);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const key = gameMemoryPinKey(gameKey, platform);
    const gamesPins = { ...(userPins.games ?? {}) };
    const notePins = [...(gamesPins[key]?.notes ?? [])];
    notePins.splice(index, 1);
    if (notePins.some(Boolean) || gamesPins[key]?.progress) {
      gamesPins[key] = { ...gamesPins[key], notes: notePins };
    } else {
      delete gamesPins[key];
    }
    await persistStyle(style, { ...userPins, games: gamesPins });
    setGames((prev) =>
      prev.map((g) => (g.game_key === gameKey && g.platform === platform ? { ...g, notes } : g)),
    );
  }

  async function addGameNote(
    gameKey: string,
    platform: string,
    userPins: PlayerStyleUserPins,
    style: PlayerStyleShape,
  ) {
    const row = games.find((g) => g.game_key === gameKey && g.platform === platform);
    if (!row || (row.notes?.length ?? 0) >= MEMORY_GAME_NOTE_CAP) return;
    const text = window.prompt("Add a note for this game")?.replace(/\s+/g, " ").trim();
    if (!text) return;
    const notes = [...(row.notes ?? []), text].slice(0, MEMORY_GAME_NOTE_CAP);
    if (!session) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("player_game_memory")
      .update({ notes, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id)
      .eq("game_key", gameKey)
      .eq("platform", platform);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const key = gameMemoryPinKey(gameKey, platform);
    const gamesPins = { ...(userPins.games ?? {}) };
    const notePins = [...(gamesPins[key]?.notes ?? []), true].slice(0, MEMORY_GAME_NOTE_CAP);
    gamesPins[key] = { ...gamesPins[key], notes: notePins };
    await persistStyle(style, { ...userPins, games: gamesPins });
    setGames((prev) =>
      prev.map((g) => (g.game_key === gameKey && g.platform === platform ? { ...g, notes } : g)),
    );
  }

  async function clearCards() {
    if (!session) return;
    const ok = window.confirm("Clear your style memory? Your question count will stay.");
    if (!ok) return;
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from("player_game_memory").delete().eq("user_id", session.user.id);
    await supabase
      .from("player_memory_state")
      .update({
        style: {},
        last_summarized_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", session.user.id);
    await load();
    onToast?.("Style memory cleared.");
  }

  if (!session) return null;
  if (loading) return <PlayerMemorySkeleton />;

  const count = state?.message_count ?? 0;
  const tier = state?.tier ?? "collecting";
  const { style, userPins } = readStyleRecord(state?.style);
  const customNotes = style.notes ?? [];
  const cooldownMs = memoryRefreshCooldownRemainingMs(state?.last_manual_refresh_at ?? null);
  const canRefresh = enabled && count >= MEMORY_DRAFT_THRESHOLD && cooldownMs === 0;
  const progressPct = Math.min(100, Math.round((count / MEMORY_FULL_THRESHOLD) * 100));
  const draftLabel = tier === "draft" ? " (draft)" : "";
  const showMemoryEditor = enabled && count >= MEMORY_DRAFT_THRESHOLD;
  const hasGames = games.some(
    (row) => (row.notes?.length ?? 0) > 0 || Boolean(row.progress?.trim()),
  );
  const updateMeta = memoryUpdateMeta(state?.last_summarized_at ?? null, cooldownMs);
  const canAddStyleNote = customNotes.length < MEMORY_STYLE_NOTE_CAP;

  return (
    <div className="field player-memory-section">
      <span className="field-label">{MEMORY_TOGGLE_LABEL}</span>
      <div className="opt-memory-row">
        <label className="memory-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => void setMemoryEnabled(event.target.checked)}
            aria-label={MEMORY_TOGGLE_LABEL}
          />
          <span>{enabled ? "On" : "Off"}</span>
        </label>
      </div>
      <p className="field-hint player-memory-hint">
        {enabled
          ? count < MEMORY_FULL_THRESHOLD
            ? `${count} of ${MEMORY_FULL_THRESHOLD} questions logged.`
            : "Style memory active. Updates daily."
          : MEMORY_TOGGLE_HINT}
      </p>

      {enabled && count < MEMORY_FULL_THRESHOLD && (
        <div className="player-memory-progress" aria-hidden="true">
          <div className="player-memory-progress-bar">
            <div className="player-memory-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="player-memory-progress-label">
            {count} / {MEMORY_FULL_THRESHOLD}
          </span>
        </div>
      )}

      {enabled && count < MEMORY_DRAFT_THRESHOLD && (
        <p className="profile-hint player-memory-hint">
          Still learning. This kicks in after {MEMORY_FULL_THRESHOLD} questions across your chats.
        </p>
      )}

      {showMemoryEditor && (
        <div className="player-memory-scroll" aria-label="Learned style and game notes">
          <section className="player-memory-block">
            <h2 className="player-memory-block-title">Play style{draftLabel}</h2>

            <div className="player-memory-subblock">
              <h3 className="player-memory-subblock-title">Answer preferences</h3>
              <p className="player-memory-block-hint">
                Set these yourself or let Update now refresh from chats. Your edits stay put.
              </p>
              <div className="player-memory-prefs-grid">
                {(STYLE_FIELD_KEYS as readonly StyleFieldKey[]).map((field) => (
                  <label key={field} className="player-memory-pref-field">
                    <span className="player-memory-pref-label">
                      {STYLE_FIELD_LABELS[field]}
                      {isStyleFieldPinned(userPins, field) ? <EditedBadge /> : null}
                    </span>
                    <select
                      className="player-memory-pref-select"
                      value={style[field] ?? ""}
                      onChange={(event) =>
                        void saveStyleField(field, event.target.value, style, userPins)
                      }
                    >
                      {STYLE_FIELD_OPTIONS[field].map((option) => (
                        <option key={option.value || "unset"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            <div className="player-memory-subblock player-memory-subblock--separated">
              <div className="player-memory-subblock-head">
                <h3 className="player-memory-subblock-title">Learned notes</h3>
                {canAddStyleNote ? (
                  <button
                    type="button"
                    className="player-memory-text-btn"
                    onClick={() => void addStyleNote(style, userPins)}
                  >
                    Add note
                  </button>
                ) : null}
              </div>
              <p className="player-memory-block-hint">
                Edit inline or remove with ×. Your edits stay put on Update now.
              </p>
              {customNotes.length > 0 ? (
                <ul className="player-memory-list">
                  {customNotes.map((line, index) => (
                    <EditableNoteRow
                      key={`${line}-${index}`}
                      value={line}
                      pinned={isStyleNotePinned(userPins, index)}
                      onSave={(next) => void saveStyleNote(index, next, style, userPins)}
                      onRemove={() => void removeStyleNote(index, style, userPins)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="player-memory-empty">No notes yet.</p>
              )}
            </div>
          </section>

          {hasGames && (
            <section className="player-memory-block">
              <h2 className="player-memory-block-title">Game notes{draftLabel}</h2>
              {games.map((row) => {
                const notes = row.notes ?? [];
                const title = `${formatGameKey(row.game_key)}${row.platform ? ` · ${row.platform}` : ""}`;
                const progressPinned = isGameProgressPinned(userPins, row.game_key, row.platform);
                if (!notes.length && !row.progress?.trim()) return null;
                return (
                  <details key={`${row.game_key}:${row.platform}`} className="player-memory-game">
                    <summary className="player-memory-game-summary" aria-label={`${title}, tap to view notes`}>
                      <span className="player-memory-game-summary-leading" aria-hidden="true" />
                      <span className="player-memory-game-summary-body">
                        <span className="player-memory-game-title">{title}</span>
                        <span className="player-memory-game-expand-hint player-memory-game-expand-hint--closed">
                          Tap to view notes
                        </span>
                        <span className="player-memory-game-expand-hint player-memory-game-expand-hint--open">
                          Tap to hide notes
                        </span>
                      </span>
                      <span className="player-memory-game-count" aria-label={`${notes.length} notes`}>
                        {notes.length}
                      </span>
                    </summary>
                    <label className="player-memory-progress-field">
                      <span className="player-memory-pref-label">
                        Progress
                        {progressPinned ? <EditedBadge /> : null}
                      </span>
                      <input
                        type="text"
                        className="player-memory-note-input"
                        defaultValue={row.progress ?? ""}
                        placeholder="e.g. Chapter 2"
                        onBlur={(event) => {
                          const next = event.target.value.replace(/\s+/g, " ").trim();
                          if (next !== (row.progress ?? "").trim()) {
                            void saveGameProgress(
                              row.game_key,
                              row.platform,
                              next,
                              userPins,
                              style,
                            );
                          }
                        }}
                      />
                    </label>
                    <div className="player-memory-subblock-head player-memory-subblock-head--tight">
                      <span className="player-memory-pref-label">Notes</span>
                      {notes.length < MEMORY_GAME_NOTE_CAP ? (
                        <button
                          type="button"
                          className="player-memory-text-btn"
                          onClick={() => void addGameNote(row.game_key, row.platform, userPins, style)}
                        >
                          Add note
                        </button>
                      ) : null}
                    </div>
                    {notes.length > 0 ? (
                      <ul className="player-memory-list">
                        {notes.map((note, index) => (
                          <EditableNoteRow
                            key={`${note}-${index}`}
                            value={note}
                            pinned={isGameNotePinned(userPins, row.game_key, row.platform, index)}
                            onSave={(next) =>
                              void saveGameNote(
                                row.game_key,
                                row.platform,
                                index,
                                next,
                                userPins,
                                style,
                              )
                            }
                            onRemove={() =>
                              void removeGameNote(
                                row.game_key,
                                row.platform,
                                index,
                                userPins,
                                style,
                              )
                            }
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="player-memory-empty">No notes for this game yet.</p>
                    )}
                  </details>
                );
              })}
            </section>
          )}
        </div>
      )}

      {enabled && (
        <div className="player-memory-actions">
          {count >= MEMORY_DRAFT_THRESHOLD && (
            <div className="player-memory-action-row">
              <button type="button" className="player-memory-clear-btn" onClick={() => void clearCards()}>
                Clear style memory
              </button>
              <button
                type="button"
                className="nav-button"
                disabled={!canRefresh || refreshing}
                onClick={() => void refreshNow()}
              >
                {refreshing ? "Updating…" : "Update now"}
              </button>
            </div>
          )}
          {updateMeta ? <p className="player-memory-meta">{updateMeta}</p> : null}
          {count < MEMORY_DRAFT_THRESHOLD && (
            <p className="profile-hint player-memory-hint">
              Needs {MEMORY_DRAFT_THRESHOLD} questions first ({count}/{MEMORY_DRAFT_THRESHOLD})
            </p>
          )}
        </div>
      )}

      {error && <p className="profile-error">{error}</p>}
    </div>
  );
}
