// src/app/terms/accept/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AcceptTermsPage() {
  const sp = useSearchParams();
  const returnTo = sp.get("returnTo") || "/account";
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const safeReturnTo = useMemo(() => {
    // prevent open-redirect: only allow internal paths
    if (!returnTo.startsWith("/")) return "/account";
    return returnTo;
  }, [returnTo]);

  useEffect(() => {
    // Optional: you can auto-redirect to /terms first if you want them to read it.
    // For now: keep it explicit.
  }, []);

  async function accept() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/legal/accept-terms", { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Unable to accept terms.");
      window.location.href = safeReturnTo;
    } catch (e: any) {
      setErr(e?.message ?? "Unable to accept terms.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">Accept Terms</h1>
      <p className="mt-3 text-slate-300">
        To continue, you must accept the{" "}
        <Link className="text-emerald-300 hover:text-emerald-200 underline underline-offset-4" href="/terms">
          Terms
        </Link>
        ,{" "}
        <Link className="text-emerald-300 hover:text-emerald-200 underline underline-offset-4" href="/privacy">
          Privacy Policy
        </Link>
        , and{" "}
        <Link
          className="text-emerald-300 hover:text-emerald-200 underline underline-offset-4"
          href="/risk-disclosure"
        >
          Risk Disclosure
        </Link>
        .
      </p>

      {err && <p className="mt-4 text-sm text-amber-200">{err}</p>}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={accept}
          disabled={loading}
          className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
        >
          {loading ? "Saving..." : "I Agree"}
        </button>

        <Link href="/terms" className="text-sm text-slate-300 hover:text-white">
          Read terms
        </Link>
      </div>
    </main>
  );
}