// src/components/TradingViewMiniChart.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";

declare global {
  interface Window {
    TradingView?: any;
  }
}

type Props = {
  symbol: string; // e.g. "NASDAQ:PLTR"
  height?: number;
};

export default function TradingViewMiniChart({ symbol, height = 64 }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  const id = useMemo(
    () => `tv-spark-${symbol.replace(/[^a-zA-Z0-9_-]/g, "")}-${Math.random().toString(16).slice(2)}`,
    [symbol]
  );

  useEffect(() => {
    let cancelled = false;

    async function ensureScript() {
      if (window.TradingView) return;

      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          'script[src="https://s3.tradingview.com/tv.js"]'
        );

        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject(new Error("TradingView script load failed")));
          return;
        }

        const s = document.createElement("script");
        s.src = "https://s3.tradingview.com/tv.js";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("TradingView script load failed"));
        document.head.appendChild(s);
      });
    }

    async function mount() {
      try {
        await ensureScript();
        if (cancelled) return;
        if (!boxRef.current) return;

        boxRef.current.innerHTML = "";

        new window.TradingView.widget({
          autosize: true,
          symbol,
          interval: "D",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "3",
          locale: "en",
          hide_top_toolbar: true,
          hide_legend: true,
          hide_side_toolbar: true,
          allow_symbol_change: false,
          save_image: false,
          container_id: id,
        });
      } catch {
        // charts are "nice-to-have"; fail silently
      }
    }

    mount();
    return () => {
      cancelled = true;
    };
  }, [id, symbol]);

  return (
    <div
      ref={boxRef}
      className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
      style={{ height }}
    >
      <div id={id} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}