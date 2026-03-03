"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, LineSeries, type Time, type LineData } from "lightweight-charts";

type Point = { time: number; value: number };

export default function Sparkline({
  symbol,
  className = "",
  height = 56,
}: {
  symbol: string;
  className?: string;
  height?: number;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  const [data, setData] = useState<Point[] | null>(null);
  const [failed, setFailed] = useState(false);

  const url = useMemo(
    () => `/api/market/sparkline?symbol=${encodeURIComponent(symbol)}`,
    [symbol]
  );

  // ... keep your existing fetch effect ...

  useEffect(() => {
    if (!elRef.current) return;

    // (re)create chart any time height changes so it matches layout
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    chartRef.current = createChart(elRef.current, {
      height,
      width: elRef.current.clientWidth || 180,
      layout: {
        background: { color: "transparent" },
        textColor: "rgba(148,163,184,0.8)",
      },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    });

    const ro = new ResizeObserver(() => {
      if (!elRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: elRef.current.clientWidth });
    });
    ro.observe(elRef.current);

    return () => ro.disconnect();
  }, [height]);

  useEffect(() => {
    if (!chartRef.current) return;

    const c = chartRef.current;

    const series = c.addSeries(LineSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    if (data && data.length >= 2) {
      const mapped: LineData<Time>[] = data.map((p) => ({
        // lightweight-charts expects UTCTimestamp (seconds) which is compatible with Time
        time: Math.floor(p.time / 1000) as unknown as Time,
        value: p.value,
      }));
      series.setData(mapped);
      c.timeScale().fitContent();
    }
  }, [data]);

  if (failed) {
    return (
      <div
        className={`w-full rounded-lg border border-white/10 bg-white/5 text-[11px] text-slate-400 flex items-center justify-center ${className}`}
        style={{ height }}
      >
        No chart
      </div>
    );
  }

  return (
    <div
      ref={elRef}
      className={`w-full rounded-lg border border-white/10 bg-white/5 ${className}`}
      style={{ height }}
    />
  );
}