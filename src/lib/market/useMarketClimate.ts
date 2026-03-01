// src/lib/market/useMarketClimate.ts
"use client";

import { useEffect, useState } from "react";

export type MarketClimate = {
  score: number;
  label: "Stable" | "Elevated" | "High Risk";
  tone: "accent" | "neutral" | "warn";
  details: string;
  cap_bps: number | null;
};

export function useMarketClimate() {
  const [climate, setClimate] = useState<MarketClimate | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/market/climate", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (json?.ok && json?.climate) setClimate(json.climate);
      } catch {
        if (!alive) return;
        setClimate(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return climate;
}