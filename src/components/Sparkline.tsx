"use client";

import { useEffect, useRef } from "react";
import { createChart } from "lightweight-charts";

export default function Sparkline({
  data,
}: {
  data: { time: string; value: number }[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const chart = createChart(ref.current, {
      width: 180,
      height: 100,
      layout: {
        background: { color: "transparent" },
        textColor: "#aaa",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      timeScale: { visible: false },
      rightPriceScale: { visible: false },
      crosshair: { mode: 0 },
    });

    const series = chart.addLineSeries({
      color: "#10b981",
      lineWidth: 2,
    });

    series.setData(data);

    return () => {
      chart.remove();
    };
  }, [data]);

  return <div ref={ref} />;
}