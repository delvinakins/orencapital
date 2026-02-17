import Link from "next/link";

export const metadata = {
  title: "Labs • Oren Capital",
  description: "Experimental tools and prototypes.",
};

export default function LabsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
            Oren Labs
          </div>

          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Prototypes, experiments, and edge tools.
          </h1>

          <p className="max-w-2xl text-lg leading-relaxed text-foreground/75">
            Labs is where we test new ideas before they become core modules.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/labs/nba"
              className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 hover:bg-white/5"
            >
              <div className="text-base font-medium">NBA Heat Map</div>
              <div className="mt-2 text-sm text-foreground/70">
                Track deviation vs consensus closing line (spread/total) during live games.
              </div>
            </Link>
          </div>

          <p className="text-sm text-foreground/60">
            Note: Labs tools may change quickly.
          </p>
        </div>
      </div>
    </main>
  );
}
