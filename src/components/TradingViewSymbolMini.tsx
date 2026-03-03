"use client";

import { useEffect, useId, useRef } from "react";

type Props = {
  symbol: string;          // e.g. "NASDAQ:COIN" or "NYSE:ELV"
  height?: number;
};

export default function TradingViewSymbolMini({ symbol, height = 220 }: Props) {
  const uid = useId().replace(/:/g, "_");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any previous widget content (important for re-renders / hot reload)
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.async = true;

    // TradingView expects the config as the script's innerHTML
    script.innerHTML = JSON.stringify({
      symbol,
      width: "100%",
      height,
      locale: "en",
      dateRange: "1D",
      colorTheme: "dark",
      isTransparent: true,
      autosize: false,
      largeChartUrl: "",
    });

    containerRef.current.appendChild(script);

    return () => {
      // best-effort cleanup
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol, height]);

  return (
    <div className="w-full">
      <div
        id={`tv_${uid}`}
        ref={containerRef}
        className="w-full overflow-hidden rounded-xl border border-white/10"
        style={{ height }}
      />
    </div>
  );
}