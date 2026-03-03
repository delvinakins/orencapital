"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  LineSeries,
} from "lightweight-charts";

type Point = { time: number; value: number }; // time = ms from your API

export default function Sparkline({
  symbol,
  className = "",
}: {
  symbol: string;
  className?: string;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const [data, setData] = useState<Point[] | null>(null);
  const [failed, setFailed] = useState(false);

  const url = useMemo(
    () => `/api/market/sparkline?symbol=${encodeURIComponent(symbol)}`,
    [symbol]
  );

  // fetch points
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setFailed(false);
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json();

        if (cancelled) return;

        if (!res.ok || !json?.ok || !Array.isArray(json?.points)) {
          setFailed(true);
          setData(null);
          return;
        }

        setData(json.points as Point[]);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setData(null);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // init chart once
  useEffect(() => {
    if (!elRef.current) return;
    if (chartRef.current) return;

    const el = elRef.current;

    const chart = createChart(el, {
      height: 56,
      width: el.clientWidth || 180,
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

    const series = chart.addSeries(LineSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (!elRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: elRef.current.clientWidth });
    });
    ro.observe(el);
    roRef.current = ro;

    return () => {
      ro.disconnect();
      roRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // set data
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    if (!data || data.length < 2) return;

    // lightweight-charts expects seconds as UTCTimestamp
    series.setData(
      data.map((p) => ({
        time: (Math.floor(p.time / 1000) as UTCTimestamp),
        value: p.value,
      }))
    );

    chart.timeScale().fitContent();
  }, [data]);

  if (failed) {
    return (
      <div
        className={`h-[56px] w-full rounded-lg border border-white/10 bg-white/5 text-[11px] text-slate-400 flex items-center justify-center ${className}`}
      >
        No chart
      </div>
    );
  }

  return (
    <div
      ref={elRef}
      className={`h-[56px] w-full rounded-lg border border-white/10 bg-white/5 ${className}`}
    />
  );
}