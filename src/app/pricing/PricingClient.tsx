"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Billing = "monthly" | "annual";

export default function PricingClient() {
  const searchParams = useSearchParams();

  const success = useMemo(() => searchParams.get("success"), [searchParams]);
  const canceled = useMemo(() => searchParams.get("canceled"), [searchParams]);

  const [billing, setBilling] = useState<Billing>("annual");
  const [loading, setLoading] = useState<null | Billing>(null);

  // ✅ Read once at render-time (client-side env vars)
  const priceMonthly = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY;
  const priceAnnual = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL;

  const activePriceId = billing === "monthly" ? priceMonthly : priceAnnual;
  const altBilling: Billing = billing === "monthly" ? "annual" : "monthly";
  const altPriceId = altBilling === "monthly" ? priceMonthly : priceAnnual;

  async function startCheckout(selected: Billing, priceId?: string) {
    try {
      setLoading(selected);

      if (!priceId) {
        throw new Error(
          "Missing Stripe priceId. Set NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY and NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL in Vercel env vars."
        );
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ Server route accepts { priceId } and validates it
        body: JSON.stringify({ priceId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? `Checkout failed (${res.status})`);
      }

      const url = json?.url;
      if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
        throw new Error("Checkout failed (invalid redirect URL).");
      }

      window.location.assign(url);
    } catch (e: any) {
      alert(e?.message ?? "Checkout failed");
    } finally {
      setLoading(null);
    }
  }

  const proSubtitle =
    billing === "monthly"
      ? "Professional risk tooling, billed monthly."
      : "Best value for disciplined traders (annual).";

  return (
    <div className="space-y-10 pb-12">
      <header className="space-y-3 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Oren Pro
        </h2>
        <p className="text-sm sm:text-base text-slate-400 max-w-md mx-auto">
          Build disciplined equity curves. Control risk. Eliminate emotional trading.
        </p>
      </header>

      {success && (
        <div className="rounded-xl border border-emerald-800/60 bg-emerald-900/20 p-4 text-sm text-emerald-200 text-center">
          Payment successful 🎉 Pro activated.
        </div>
      )}

      {canceled && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-200 text-center">
          Checkout canceled.
        </div>
      )}

      <section className="space-y-5">
        {/* PRO */}
        <div className="rounded-2xl border border-emerald-900/40 bg-slate-900/60 p-5 sm:p-6 shadow-lg shadow-black/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-emerald-300">
                Recommended
              </div>
              <div className="text-2xl font-semibold">Pro</div>
              <div className="text-sm text-slate-400">{proSubtitle}</div>
            </div>

            {/* Billing toggle */}
            <div className="inline-flex w-full sm:w-auto rounded-xl border border-slate-800 bg-slate-950/40 p-1">
              <button
                type="button"
                onClick={() => setBilling("monthly")}
                className={cn(
                  "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                  billing === "monthly"
                    ? "bg-slate-100 text-slate-950"
                    : "text-slate-200 hover:bg-slate-900/60"
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling("annual")}
                className={cn(
                  "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                  billing === "annual"
                    ? "bg-slate-100 text-slate-950"
                    : "text-slate-200 hover:bg-slate-900/60"
                )}
              >
                Annual{" "}
                <span className="ml-1 text-[11px] opacity-80">(Best value)</span>
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
            <Feature>Cloud portfolio sync (save / load)</Feature>
            <Feature>Trade journal with snapshots + notes</Feature>
            <Feature>Risk Engine + Variance Simulator</Feature>
            <Feature>Pro-only workflow upgrades</Feature>
          </div>

          <div className="mt-7 space-y-3">
            <button
              onClick={() => startCheckout(billing, activePriceId)}
              disabled={loading !== null || !activePriceId}
              className={cn(
                "w-full rounded-xl px-4 py-4 text-base font-semibold transition disabled:opacity-60",
                "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
              )}
            >
              {loading === billing
                ? "Redirecting…"
                : `Upgrade ${billing === "monthly" ? "Monthly" : "Annual"}`}
            </button>

            <button
              onClick={() => startCheckout(altBilling, altPriceId)}
              disabled={loading !== null || !altPriceId}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 text-base font-semibold text-slate-100 hover:bg-slate-900 disabled:opacity-60"
            >
              {loading === altBilling
                ? "Redirecting…"
                : `Or choose ${altBilling === "monthly" ? "Monthly" : "Annual"}`}
            </button>

            <div className="text-center text-xs text-slate-500">
              Cancel anytime • Secure checkout by Stripe
            </div>

            {!priceMonthly || !priceAnnual ? (
              <div className="mt-3 rounded-xl border border-amber-800/60 bg-amber-900/20 p-3 text-xs text-amber-200">
                Missing Stripe price env vars. Add{" "}
                <span className="font-semibold">
                  NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY
                </span>{" "}
                and{" "}
                <span className="font-semibold">
                  NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL
                </span>{" "}
                in Vercel.
              </div>
            ) : null}
          </div>
        </div>

        {/* FREE */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 sm:p-6">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-semibold text-slate-200">Free</div>
            <div className="text-sm text-slate-400">$0</div>
          </div>

          <div className="mt-2 text-sm text-slate-400">
            Try the core tools. Upgrade when you want cloud workflow + journaling.
          </div>

          <div className="mt-4 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
            <Feature>Risk Engine</Feature>
            <Feature>Variance Simulator</Feature>
            <Feature>Manual copy/paste workflows</Feature>
            <Feature>No cloud save/load</Feature>
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
      <span>{children}</span>
    </div>
  );
}
