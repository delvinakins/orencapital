// src/app/admin/nba/power-rankings/page.tsx
import PowerRankingsClient from "./PowerRankingsClient";

export const metadata = {
  title: "Admin • NBA Power Rankings — Oren Capital",
  description: "Admin-only drag/drop power rankings.",
};

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-16 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            <span className="relative inline-block">
              <span className="relative z-10 text-[color:var(--accent)]">NBA Power Rankings</span>
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-90"
              />
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10"
              />
            </span>
          </h1>

          <p className="text-[15px] text-foreground/70 max-w-2xl">
            Drag to reorder. Save writes the ordering + Oren Edge params used by the watchlist.
          </p>
        </header>

        <PowerRankingsClient />
      </div>
    </main>
  );
}