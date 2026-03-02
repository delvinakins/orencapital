// src/components/TradingViewMini.tsx
"use client";

import { useEffect, useRef } from "react";

export default function TradingViewMini({ symbol }: { symbol: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // prevent duplicate loads
    if (host.getAttribute("data-tv-loaded") === "1") return;
    host.setAttribute("data-tv-loaded", "1");

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";

    script.innerHTML = JSON.stringify({
      symbol: `NYSE:${symbol}`,
      width: "100%",
      height: 100,
      locale: "en",
      dateRange: "1D",
      colorTheme: "dark",
      isTransparent: true,
      autosize: true,
      largeChartUrl: "",
    });

    host.appendChild(script);

    return () => {
      // keep it simple: do not remove script aggressively (TV widgets can be finicky)
    };
  }, [symbol]);

  return (
    <div className="tradingview-widget-container">
      <div ref={hostRef} />
    </div>
  );
}