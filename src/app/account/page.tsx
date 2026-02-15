"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type ProStatus = {
  pro: boolean;
  plan?: string | null;
  period?: "monthly" | "annual" | null;
  renewsAt?: string | null;
};

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "••••";
  const maskedLocal =
    local.length <= 2 ? local[0] + "•" : local[0] + "•••••" + local[local.length - 1];
  const domainParts = domain.split(".");
  const base = domainParts[0] ?? domain;
  const tld = domainParts.slice(1).join(".") || "";
  const maskedBase =
    base.length <= 2 ? base[0] + "•" : base[0] + "•••••" + base[base.length - 1];
  return `${maskedLocal}@${maskedBase}${tld ? "." + tld : ""}`;
}

export default function AccountPage() {
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [proStatus, setProStatus] = useState<ProStatus | null>(null);
  const [loadingPro, setLoadingPro] = useState(true);

  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const masked = useMemo(() => (email ? maskEmail(email) : null), [email]);

  useEffect(() => {
    (async () => {
      setLoadingUser(true);
      setError(null);
      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr) setError(userErr.message);
      setEmail(data.user?.email ?? null);
      setLoadingUser(false);
    })();
  }, [supabase]);

  useEffect(() => {
    (async () => {
      setLoadingPro(true);
      try {
        const res = await fetch("/api/pro/status", { method: "GET", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        setProStatus((json as ProStatus) ?? { pro: false });
      } catch {
        setProStatus({ pro: false });
      } finally {
        setLoadingPro(false);
      }
    })();
  }, []);

  async function logout() {
    setError(null);
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) {
        setError(json?.error || "Could not open billing portal.");
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("Could not open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  const signedIn = !!email;
  const plan = loadingPro ? "Loading…" : proStatus?.pro ? "Pro" : "Free";

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-100">Account</h1>
      <p className="mt-1 text-sm text-slate-400">Manage your plan and billing.</p>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-400">Plan</div>
            <div className="mt-1 text-lg font-semibold text-slate-100">{plan}</div>
          </div>

          <span
            className={[
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              proStatus?.pro
                ? "border-emerald-900/50 bg-emerald-950/20 text-emerald-200"
                : "border-slate-800 bg-slate-950/20 text-slate-300",
            ].join(" ")}
          >
            {loadingPro ? "…" : proStatus?.pro ? "Active" : "Free"}
          </span>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
        <div className="text-sm font-medium text-slate-200">Billing</div>
        <div className="mt-1 text-sm text-slate-400">
          Manage subscription, cancel, update payment method via Stripe.
        </div>

        <div className="mt-4">
          <button
            onClick={openBillingPortal}
            disabled={!signedIn || portalLoading}
            className="inline-flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-900 disabled:opacity-50"
          >
            {portalLoading ? "Opening…" : "Manage Billing"}
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
        <div className="text-sm font-medium text-slate-200">Security</div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">Email</div>
            <div className="mt-1 text-sm text-slate-200">
              {loadingUser ? "Loading…" : email ? masked : "Not signed in"}
            </div>
          </div>

          <button
            onClick={logout}
            disabled={!signedIn}
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-900 disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
