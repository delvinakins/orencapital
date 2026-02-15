"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useProStatus } from "@/hooks/useProStatus";

type ProGateProps = {
  feature?: string;
  children: React.ReactNode;
  className?: string;

  /**
   * If true, shows an overlay on top of children.
   * If false, replaces children with the locked UI.
   */
  mode?: "replace" | "overlay";
};

export function ProGate({
  feature = "This feature",
  children,
  className = "",
  mode = "replace",
}: ProGateProps) {
  const supabase = supabaseBrowser();

  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!alive) return;
        setSignedIn(!!data.user);
      })
      .catch(() => {
        if (!alive) return;
        setSignedIn(false);
      });

    return () => {
      alive = false;
    };
  }, [supabase]);

  const { isPro, loading } = useProStatus(!!signedIn);

  // Loading state (auth + pro status)
  if (signedIn === null || (signedIn && loading)) {
    return (
      <div className={`rounded-2xl border border-slate-800 bg-slate-950 p-4 ${className}`}>
        <div className="h-4 w-40 animate-pulse rounded bg-slate-800" />
        <div className="mt-3 h-3 w-72 animate-pulse rounded bg-slate-800" />
      </div>
    );
  }

  // Not signed in
  if (!signedIn) {
    return (
      <div className={`rounded-2xl border border-slate-800 bg-slate-950 p-5 ${className}`}>
        <div className="text-sm font-semibold text-white">Login required</div>
        <div className="mt-1 text-sm text-slate-300">
          Please log in to access {feature.toLowerCase()}.
        </div>
        <div className="mt-4 flex gap-2">
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Login
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-800 bg-transparent px-4 text-sm font-semibold text-slate-200 hover:bg-slate-900"
          >
            View plans
          </Link>
        </div>
      </div>
    );
  }

  // Pro users pass through
  if (isPro) return <>{children}</>;

  // Free user locked UI
  const lockedCard = (
    <div className={`rounded-2xl border border-slate-800 bg-slate-950 p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{feature} is Pro</div>
          <div className="mt-1 text-sm text-slate-300">
            Upgrade to unlock {feature.toLowerCase()} and the full Oren toolkit.
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2 py-1 text-[10px] font-semibold tracking-wide text-emerald-200">
          PRO
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/pricing"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-600/40 bg-emerald-600/10 px-4 text-sm font-semibold text-emerald-200 hover:bg-emerald-600/20"
        >
          Upgrade to Pro
        </Link>
        <Link
          href="/account/billing"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Manage billing
        </Link>
      </div>
    </div>
  );

  if (mode === "replace") return lockedCard;

  // Overlay mode: show children but locked overlay on top (for “preview but blocked”)
  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none select-none opacity-40 blur-[0.3px]">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">{lockedCard}</div>
      </div>
    </div>
  );
}
