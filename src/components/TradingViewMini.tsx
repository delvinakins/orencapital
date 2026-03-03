"use client";

import Script from "next/script";

export default function TradingViewMini({ symbol }: { symbol: string }) {
  const containerId = `tv-${symbol}`;

  return (
    <div className="tradingview-widget-container">
      <div id={containerId} />
      <Script
        id={`tv-script-${symbol}`}
        strategy="afterInteractive"
        src="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            symbol,
            width: "100%",
            height: 100,
            locale: "en",
            dateRange: "1D",
            colorTheme: "dark",
            isTransparent: true,
            autosize: true,
            largeChartUrl: "",
          }),
        }}
      />
    </div>
  );
}