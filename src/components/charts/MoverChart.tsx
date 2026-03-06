// src/components/charts/MoverChart.tsx
"use client";

import * as React from "react";
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";

export type MoverPt = { ts: number; v: number };

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtNum(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function MoverChart({
  data,
  label,
  height = 44,
  positive,
}: {
  data: MoverPt[];
  label?: string;
  height?: number;
  /** true = green, false = red, undefined = neutral white */
  positive?: boolean | null;
}) {
  const gid = React.useId().replaceAll(":", "");

  const color =
    positive === true
      ? "#34d399"   // emerald-400
      : positive === false
      ? "#f87171"   // rose-400
      : "#ffffff";  // neutral

  const stopOpacity = positive === undefined ? 0.18 : 0.28;

  return (
    <div className="w-full">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
            <defs>
              <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={stopOpacity} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>

            <Tooltip
              cursor={{ opacity: 0.12 }}
              wrapperStyle={{ zIndex: 50 }}
              content={(props: any) => {
                const active: boolean | undefined = props?.active;
                const payload: readonly any[] | undefined = props?.payload;
                if (!active || !payload?.length) return null;

                const p = payload[0]?.payload as MoverPt | undefined;
                if (!p || typeof p.ts !== "number" || typeof p.v !== "number") return null;

                return (
                  <div className="rounded-xl border border-white/10 bg-black/85 px-3 py-2 text-xs text-white shadow-lg">
                    <div className="text-white/70">{fmtTime(p.ts)}</div>
                    <div className="mt-1">
                      {label ? <span className="text-white/70">{label}: </span> : null}
                      <span className="font-medium">{fmtNum(p.v)}</span>
                    </div>
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
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