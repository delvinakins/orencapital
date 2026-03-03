// src/components/TradingViewMini.tsx
"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    TradingView?: any;
  }
}

export default function TradingViewMini({
  symbol,
  exchange = "NASDAQ",
}: {
  symbol: string;
  exchange?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useId().replace(/:/g, "_"); // Next can include ":" in ids
  const full = `${exchange}:${symbol}`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // clear any prior widget
    el.innerHTML = "";

    const mount = () => {
      // If TradingView didn't load, bail
      if (!window.TradingView || !window.TradingView.widget) return;

      // Create the widget
      new window.TradingView.widget({
        autosize: true,
        symbol: full,
        interval: "D",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        enable_publishing: false,
        hide_top_toolbar: true,
        hide_legend: true,
        save_image: false,
        calendar: false,
        container_id: widgetId,
      });
    };

    // load script once
    const existing = document.querySelector(
      'script[data-tv="tv-script"]'
    ) as HTMLScriptElement | null;

    if (existing) {
      // Script already present; just mount
      // slight delay helps if script is still initializing
      const t = setTimeout(mount, 0);
      return () => clearTimeout(t);
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.dataset.tv = "tv-script";
    script.onload = mount;
    document.head.appendChild(script);

    return () => {
      // optional: leave tv.js loaded (recommended) and only clear container
      if (el) el.innerHTML = "";
    };
  }, [full, widgetId]);

  return (
    <div className="w-full">
      {/* IMPORTANT: TradingView needs non-zero height */}
      <div
        id={widgetId}
        ref={containerRef}
        className="h-[84px] w-full overflow-hidden rounded-lg border border-white/10 bg-black/20"
      />
    </div>
  );
}