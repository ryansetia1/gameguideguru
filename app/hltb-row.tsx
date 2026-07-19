"use client";

import { useEffect, useState } from "react";

import { formatHltbHours, hltbCacheKey } from "@/lib/hltb.js";

type HltbData = {
  hltbId: number | null;
  main: number | null;
  mainPlus: number | null;
  complete: number | null;
  allStyles: number | null;
};

// Module-level client cache keyed by normalized title. Playtime is near-static
// (30d server TTL), so one fetch per game per tab session is plenty.
const clientCache = new Map<string, HltbData | null>();

async function resolveHltb(title: string, appId: string): Promise<HltbData | null> {
  const key = hltbCacheKey(title);
  if (!key) return null;
  const hit = clientCache.get(key);
  if (hit !== undefined) return hit;
  const qs = new URLSearchParams({ title });
  if (appId) qs.set("appId", appId);
  const res = (await fetch(`/api/hltb?${qs}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as {
    data?: HltbData | null;
    pending?: boolean;
  } | null;
  const data = res?.data ?? null;
  if (res && res.pending !== true) clientCache.set(key, data);
  return data;
}

function mainStoryHours(data: HltbData | null | undefined): string | null {
  return formatHltbHours(data?.main ?? null);
}

export function useHltbMainStory(title: string, appId = "") {
  const [state, setState] = useState<{
    loading: boolean;
    hours: string | null;
  }>({ loading: Boolean(title.trim()), hours: null });

  useEffect(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      setState({ loading: false, hours: null });
      return;
    }
    const key = hltbCacheKey(trimmed);
    const cached = clientCache.get(key);
    if (cached !== undefined) {
      setState({ loading: false, hours: mainStoryHours(cached) });
      return;
    }
    setState({ loading: true, hours: null });
    let cancelled = false;
    void resolveHltb(trimmed, appId).then((data) => {
      if (!cancelled) {
        setState({ loading: false, hours: mainStoryHours(data) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [title, appId]);

  return state;
}

type Props = {
  title: string;
  /** Steam appId from the cover URL — optional, improves HLTB matching. */
  appId?: string;
  /** `block` = game card row; `inline` = sticky meta chunk(s). */
  variant?: "block" | "inline";
  /** When inline, prefix with a dot separator if main story is shown. */
  sep?: boolean;
};

/** Main-story playtime from HowLongToBeat. Hidden when no HLTB entry. */
export function HltbRow({
  title,
  appId = "",
  variant = "block",
  sep = false,
}: Props) {
  const { loading, hours } = useHltbMainStory(title, appId);

  if (variant === "inline") {
    if (loading || !hours) return null;
    return (
      <>
        {sep && (
          <span className="meta-dot" aria-hidden>
            ·
          </span>
        )}
        <span className="meta-chunk hltb-chunk" title="Playtime from HowLongToBeat">
          <span className="hltb-hours">{hours}h</span> main story
        </span>
      </>
    );
  }

  if (loading) {
    return (
      <p className="game-card-hltb game-card-hltb-loading" aria-hidden>
        <span className="game-card-hltb-skel" />
      </p>
    );
  }
  if (!hours) return null;

  return (
    <p className="game-card-hltb" title="Playtime from HowLongToBeat">
      <span className="hltb-hours">{hours}h</span> main story
    </p>
  );
}
