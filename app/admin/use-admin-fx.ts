"use client";

import { useCallback, useEffect, useState } from "react";

import { formatAdminMoney, formatApiCostCompactIdr, formatIdr, usdToIdrAmount } from "@/lib/admin-fx";
import { formatApiCostCompact, type ApiCostSummary } from "@/lib/admin-api-cost";
import { getSupabase } from "@/lib/supabase";

export function useAdminFx(isAdmin: boolean) {
  const [usdToIdr, setUsdToIdr] = useState<number | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFx = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !isAdmin) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session expired");
      return;
    }

    try {
      const response = await fetch("/api/admin/fx-rate", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setError("Could not load today's USD/IDR rate");
        return;
      }
      const payload = (await response.json()) as { usdToIdr?: number; asOf?: string };
      if (!payload.usdToIdr || !Number.isFinite(payload.usdToIdr)) {
        setError("Invalid FX rate");
        return;
      }
      setUsdToIdr(payload.usdToIdr);
      setAsOf(payload.asOf ?? null);
      setError(null);
    } catch {
      setError("Could not load today's USD/IDR rate");
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadFx();
  }, [loadFx]);

  const formatCost = useCallback((usd: number | null) => formatAdminMoney(usd, usdToIdr), [usdToIdr]);

  const formatCostCompact = useCallback(
    (summary: ApiCostSummary) =>
      usdToIdr ? formatApiCostCompactIdr(summary, usdToIdr) : formatApiCostCompact(summary),
    [usdToIdr],
  );

  const rateLabel =
    usdToIdr && asOf
      ? `1 USD = ${formatIdr(usdToIdr)} (${asOf})`
      : error ?? "Loading FX rate…";

  return {
    usdToIdr,
    asOf,
    error,
    rateLabel,
    formatCost,
    formatCostCompact,
    usdToIdrAmount: (usd: number) => (usdToIdr ? usdToIdrAmount(usd, usdToIdr) : null),
    reloadFx: loadFx,
  };
}
