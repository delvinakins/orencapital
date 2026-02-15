"use client";

import { useState } from "react";

export default function CheckoutButtons() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  async function startCheckout(priceId: string, key: string) {
    try {
      setError("");
      setLoading(key);

      if (!priceId) {
        setError(
          "Missing priceId. Check NEXT_PUBLIC_STRIPE_PRICE_PRO_* in .env.local and restart npm run dev."
        );
        setLoading(null);
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error || "Checkout failed.");
        setLoading(null);
        return;
      }

      if (!json?.url) {
        setError("Checkout failed: missing redirect URL.");
        setLoading(null);
        return;
      }

      window.location.href = json.url;
    } catch (e: any) {
      setError(e?.message || "Checkout failed.");
      setLoading(null);
    }
  }

  const monthly = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "";
  const yearly = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY || "";

  return (
    <div className="space-y-3">
      {!!error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 space-y-3">
          <div className="text-lg font-semibold">Pro Monthly</div>
          <div className="text-sm text-slate-400">Full access. Cancel anytime.</div>

          <button
            onClick={() => startCheckout(monthly, "monthly")}
            disabled={loading === "monthly"}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-950 hover:bg-white disabled:opacity-60"
          >
            {loading === "monthly" ? "Redirecting..." : "Subscribe (Monthly)"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 space-y-3">
          <div className="text-lg font-semibold">Pro Yearly</div>
          <div className="text-sm text-slate-400">Best value.</div>

          <button
            onClick={() => startCheckout(yearly, "yearly")}
            disabled={loading === "yearly"}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-950 hover:bg-white disabled:opacity-60"
          >
            {loading === "yearly" ? "Redirecting..." : "Subscribe (Yearly)"}
          </button>
        </div>
      </div>
    </div>
  );
}
