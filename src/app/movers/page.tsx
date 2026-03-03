// src/app/movers/page.tsx
import Link from "next/link";
import MoversTableClient from "./MoversTableClient";

export default function MoversPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            S&amp;P 500 Volatility Radar
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Today’s biggest intraday movers, filtered to the S&amp;P 500 and
            tagged by structural risk.
          </p>
        </div>

        <Link
          href="/risk"
          className="text-sm text-slate-300 hover:text-white hover:underline"
        >
          Go to Survivability →
        </Link>
      </div>

      <MoversTableClient />

      <p className="mt-4 text-xs text-slate-400">
        Mini charts are computed from intraday aggregates.
      </p>
    </main>
  );
}