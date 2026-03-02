// src/components/TradingViewMiniEmbed.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";

type Props = {
  symbol: string; // raw ticker e.g. "AAPL"
  width?: number;
  height?: number;
};

function tvExchangeSymbol(ticker: string) {
  const s = ticker.toUpperCase();

  // tiny heuristic — adjust later if you want perfect exchange mapping
  if (s === "BRK.B") return "NYSE:BRK.B";
  if (s === "BRK.A") return "NYSE:BRK.A";

  // many S&P 500 are NYSE; if some don’t render, we can improve mapping later
  return `NYSE:${s}`;
}

export default function TradingViewMiniEmbed({ symbol, width = 180, height = 100 }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);

  const containerId = useMemo(
    () => `tv-mini-${symbol.replace(/[^a-zA-Z0-9_.-]/g, "")}-${Math.random().toString(16).slice(2)}`,
    [symbol]
  );

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    // prevent duplicate loads
    if (el.getAttribute("data-tv-loaded") === "1") return;
    el.setAttribute("data-tv-loaded", "1");

    // TradingView embed script
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";

    script.innerHTML = JSON.stringify({
      symbol: tvExchangeSymbol(symbol),
      width: "100%",
      height,
      locale: "en",
      dateRange: "1D",
      colorTheme: "dark",
      isTransparent: true,
      autosize: true,
      largeChartUrl: "",
    });

    el.appendChild(script);

    return () => {
      // best-effort cleanup
      try {
        el.innerHTML = "";
      } catch {}
    };
  }, [height, symbol]);

  return (
    <div style={{ width }}>
      <div className="tradingview-widget-container">
        <div
          id={containerId}
          ref={elRef}
          className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
          style={{ height }}
        />
      </div>
    </div>
  );
}