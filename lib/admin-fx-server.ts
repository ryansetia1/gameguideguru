const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=USD&to=IDR";
const CACHE_TTL_MS = 60 * 60 * 1000;

type FxCache = {
  usdToIdr: number;
  asOf: string;
  fetchedAt: number;
};

let cache: FxCache | null = null;

export type UsdToIdrRate = {
  usdToIdr: number;
  asOf: string;
  source: "frankfurter";
};

export async function getUsdToIdrRate(): Promise<UsdToIdrRate> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { usdToIdr: cache.usdToIdr, asOf: cache.asOf, source: "frankfurter" };
  }

  const response = await fetch(FRANKFURTER_URL, {
    headers: { accept: "application/json" },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`FX provider HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    date?: string;
    rates?: { IDR?: number };
  };

  const usdToIdr = payload.rates?.IDR;
  if (!usdToIdr || !Number.isFinite(usdToIdr)) {
    throw new Error("FX provider returned no USD/IDR rate");
  }

  const asOf = payload.date ?? new Date().toISOString().slice(0, 10);
  cache = { usdToIdr, asOf, fetchedAt: Date.now() };
  return { usdToIdr, asOf, source: "frankfurter" };
}
