"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

type ApiPoint = { time: number; value: number }; // time from API can be ms or s
type LinePoint = { time: UTCTimestamp; value: number };

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

  const [failed, setFailed] = useState(false);

  const url = useMemo(
    () => `/api/market/sparkline?symbol=${encodeURIComponent(symbol)}`,
    [symbol]
  );

  // Create chart + series ONCE
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

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
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
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

    // Resize
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

  // Fetch + set data
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
          seriesRef.current?.setData([]);
          return;
        }

        const points = json.points as ApiPoint[];

        // Normalize time:
        // - if API returns ms (e.g. 1700000000000), convert to seconds
        // - if it already looks like seconds, keep it
        const normalized: LinePoint[] = points.map((p) => {
          const t =
            p.time > 2_000_000_000 ? Math.floor(p.time / 1000) : Math.floor(p.time);
          return { time: t as UTCTimestamp, value: p.value };
        });

        if (normalized.length >= 2) {
          seriesRef.current?.setData(normalized);
          chartRef.current?.timeScale().fitContent();
        } else {
          seriesRef.current?.setData([]);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          seriesRef.current?.setData([]);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [url]);

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