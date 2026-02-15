export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-slate-800 bg-slate-900/40 px-4 py-2 text-sm text-slate-200">
            Oren Capital • Risk discipline for retail traders
          </div>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Turn variance into structured growth.
          </h1>

          <p className="max-w-2xl text-lg leading-relaxed text-slate-300">
            Institutional risk tools built for serious retail swing and options traders:
            position sizing, drawdown tracking, expectancy, and portfolio heat — without hype.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="/risk-engine"
              className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-5 py-3 text-sm font-medium text-slate-950 hover:bg-white"
            >
              Open the Risk Engine
            </a>

            <a
              href="/pricing"
              className="inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-3 text-sm font-medium text-slate-100 hover:bg-slate-900"
            >
              View Pricing
            </a>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { title: "Position Sizing", desc: "Size trades like a pro. Risk first, entry second." },
              { title: "Variance Simulator", desc: "See realistic drawdowns and losing streaks before they happen." },
              { title: "Portfolio Heat", desc: "Avoid correlated stacking and hidden exposure." },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-slate-800 bg-slate-900/30 p-5"
              >
                <div className="text-base font-medium">{f.title}</div>
                <div className="mt-2 text-sm text-slate-300">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
