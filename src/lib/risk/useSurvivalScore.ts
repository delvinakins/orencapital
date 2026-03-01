// src/lib/risk/useSurvivalScore.ts
"use client";

import { useEffect, useState } from "react";

export type SurvivalTone = "accent" | "neutral" | "warn";

export type SurvivalScoreState = {
  score: number;
  label: string;
  tone: SurvivalTone;
  message?: string;
  updatedAt?: number;
  source?: string;
};

const KEY = "oren:survival:score:v1";

function safeParse(raw: string | null): SurvivalScoreState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    if (typeof v.score !== "number") return null;
    return v as SurvivalScoreState;
  } catch {
    return null;
  }
}

export function useSurvivalScore() {
  const [state, setState] = useState<SurvivalScoreState | null>(null);

  useEffect(() => {
    // initial load
    setState(safeParse(localStorage.getItem(KEY)));

    // cross-tab updates
    function onStorage(e: StorageEvent) {
      if (e.key !== KEY) return;
      setState(safeParse(e.newValue));
    }
    window.addEventListener("storage", onStorage);

    // same-tab updates (custom event)
    function onCustom() {
      setState(safeParse(localStorage.getItem(KEY)));
    }
    window.addEventListener("oren:survival:score", onCustom);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("oren:survival:score", onCustom);
    };
  }, []);

  return state;
}

/**
 * Call server to compute score, then store locally for TopNav + other pages.
 */
export async function updateSurvivalScore(input: {
  source: string;
  metrics: {
    ruin_probability?: number;
    drawdown_pct?: number;
    consecutive_losses?: number;
    ev_r?: number;
    risk_pct?: number;
  };
}) {
  try {
    const res = await fetch("/api/risk/survival-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics: input.metrics }),
    });

    const json = await res.json().catch(() => null);
    if (!json?.ok || typeof json.score !== "number") return;

    const payload = {
      score: json.score,
      label: String(json.label ?? "Watch"),
      tone: (json.tone ?? "neutral") as "accent" | "neutral" | "warn",
      message: typeof json.message === "string" ? json.message : undefined,
      updatedAt: Date.now(),
      source: input.source,
    };

    localStorage.setItem("oren:survival:score:v1", JSON.stringify(payload));
    window.dispatchEvent(new Event("oren:survival:score"));
  } catch {
    // ignore
  }
}