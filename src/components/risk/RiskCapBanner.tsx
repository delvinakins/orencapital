"use client";

import React from "react";

function fmtCountdown(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expiring now";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function RiskCapBanner(props: {
  mode: "CPM" | "ARC";
  capBps: number;
  expiresAt: string | null;
  profile: string;
}) {
  const label = props.mode === "CPM" ? "Capital Protection Mode Active" : "Auto Risk Cap Active";
  const sub =
    props.mode === "CPM"
      ? "Position sizing temporarily restricted to preserve survivability."
      : "Position sizing reduced due to elevated survivability risk.";

  const countdown = fmtCountdown(props.expiresAt);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="text-sm font-semibold text-neutral-100">{label}</div>
      <div className="mt-1 text-sm text-neutral-300">{sub}</div>
      <div className="mt-2 text-xs text-neutral-400">
        Profile: <span className="text-neutral-200">{props.profile}</span> · Cap:{" "}
        <span className="text-neutral-200">{(props.capBps / 100).toFixed(2)}%</span>
        {countdown ? (
          <>
            {" "}
            · Expires in <span className="text-neutral-200">{countdown}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}