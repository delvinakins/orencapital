// src/app/labs/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Labs • Oren Capital",
  description: "Experimental tools and prototypes.",
};

export default function LabsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24">

        {/* Header */}
        <div className="mb-12">
          <div className="text-xs tracking-[0.22em] text-foreground/40 mb-4">LABS</div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            <span className="relative inline-block">
              <span className="relative z-10 text-[color:var(--accent)]">Prototypes &amp; experiments.</span>
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-90" />
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10" />
            </span>
          </h1>
          <p className="mt-4 text-base text-foreground/65 max-w-xl leading-relaxed">
            Labs is where new ideas are tested before they become core modules. Expect rough edges.
          </p>
        </div>

        {/* Tools grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/labs/nba"
            className="group rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 hover:border-[color:var(--accent)]/30 hover:bg-white/5 transition-colors"
          >
            <div className="text-base font-semibold text-foreground mb-2">NBA Deviation Watchlist</div>
            <div className="text-sm text-foreground/60 leading-relaxed">
              Track deviation vs consensus closing line (spread/total) during live games.
            </div>
            <div className="mt-4 text-xs text-[color:var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity">
              Open →
            </div>
          </Link>
        </div>

        <p className="mt-8 text-xs text-foreground/40">
          Labs tools may change or be removed without notice.
        </p>

      </div>
    </main>
  );
}