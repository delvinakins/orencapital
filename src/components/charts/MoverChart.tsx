// components/charts/MoverChart.tsx
"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Pt = { ts: number; v: number }; // ts in ms, v as percent (0-100) or index

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtNum(v: number) {
  // If you pass 0-100 probabilities, keep as percent-like.
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

export function MoverChart({
  data,
  yDomain,
  label = "Implied",
}: {
  data: Pt[];
  yDomain?: [number, number];
  label?: string;
}) {
  // Use a stable id so multiple charts don’t collide gradients
  const gid = React.useId().replaceAll(":", "");

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-white/80">{label}</div>
        <div className="text-xs text-white/50">{data.length ? fmtTime(data[data.length - 1].ts) : ""}</div>
      </div>

      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopOpacity={0.35} />
                <stop offset="100%" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} opacity={0.15} />

            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "2-digit" })}
              tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />

            <YAxis
              domain={yDomain ?? ["auto", "auto"]}
              tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />

            <Tooltip
              cursor={{ opacity: 0.15 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Pt;
                return (
                  <div className="rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs text-white">
                    <div className="text-white/70">{fmtTime(p.ts)}</div>
                    <div className="mt-1">
                      <span className="text-white/70">{label}: </span>
                      <span className="font-medium">{fmtNum(p.v)}</span>
                    </div>
                  </div>
                );
              }}
            />

            {/* `type="stepAfter"` gives the Kalshi-like discrete-tick feel */}
            <Area
              type="stepAfter"
              dataKey="v"
              strokeOpacity={0.9}
              fill={`url(#g-${gid})`}
              fillOpacity={1}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}