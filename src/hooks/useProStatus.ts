"use client";

import { useEffect, useState } from "react";

type ProStatus = {
  isPro: boolean;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

let cached: ProStatus | null = null;
let inflight: Promise<ProStatus> | null = null;

async function fetchProStatus(): Promise<ProStatus> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = fetch("/api/pro/status", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`pro status failed: ${res.status}`);
      return (await res.json()) as ProStatus;
    })
    .then((data) => {
      cached = data;
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function useProStatus(enabled: boolean) {
  const [data, setData] = useState<ProStatus | null>(cached);
  const [loading, setLoading] = useState(enabled && !cached);

  useEffect(() => {
    if (!enabled) return;

    let alive = true;
    setLoading(!cached);

    fetchProStatus()
      .then((d) => {
        if (!alive) return;
        setData(d);
      })
      .catch(() => {
        if (!alive) return;
        // Fail "closed" but don't break UI
        setData({ isPro: false });
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [enabled]);

  return {
    isPro: !!data?.isPro,
    status: data?.subscriptionStatus ?? null,
    loading,
  };
}
