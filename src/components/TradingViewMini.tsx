"use client";

import { useEffect, useRef } from "react";

export default function TradingViewMini({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container";

    const widget = document.createElement("div");
    wrapper.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";

    script.innerHTML = JSON.stringify({
      symbol: symbol, // REMOVE NYSE prefix — let TV auto-detect
      width: "100%",
      height: 100,
      locale: "en",
      dateRange: "1D",
      colorTheme: "dark",
      isTransparent: true,
      autosize: true,
      largeChartUrl: "",
    });

    wrapper.appendChild(script);

    containerRef.current.appendChild(wrapper);
  }, [symbol]);

  return <div ref={containerRef} />;
}