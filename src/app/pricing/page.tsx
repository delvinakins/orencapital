import { Suspense } from "react";
import PricingClient from "./PricingClient";

export const dynamic = "force-dynamic";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-16 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Oren Capital
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-xl">
            Institutional-grade risk discipline for serious traders.
          </p>
        </header>

        <Suspense
          fallback={
            <div className="text-sm text-slate-400">
              Loading pricing…
            </div>
          }
        >
          <PricingClient />
        </Suspense>
      </div>
    </main>
  );
}
