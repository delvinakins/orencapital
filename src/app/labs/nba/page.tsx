export const metadata = {
  title: "NBA Heat Map • Oren Labs",
  description: "Deviation vs consensus closing line for live NBA games.",
};

export default function NbaHeatMapPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
            Oren Labs • NBA
          </div>

          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Live Deviation Heat Map
          </h1>

          <p className="max-w-3xl text-lg leading-relaxed text-foreground/75">
            This page will highlight games where the live score deviates materially from the{" "}
            <span className="font-medium text-foreground">consensus closing spread/total</span>.
            We’ll start by checking every 3 minutes until end of game.
          </p>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
            <div className="text-base font-medium">Coming next</div>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-foreground/75">
              <li>Connect to NBA live scores feed</li>
              <li>Store closing spread/total (consensus across books)</li>
              <li>Compute z-score vs historical conditional distributions (time remaining, possession, strength bucket)</li>
              <li>Heat map UI (green/yellow/red)</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
