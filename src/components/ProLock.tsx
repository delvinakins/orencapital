"use client";

import Link from "next/link";
import { useProStatus } from "@/hooks/useProStatus";

type ProLockProps = {
  feature: string;
  children: React.ReactNode;

  /**
   * "overlay" = show the UI blurred/disabled + overlay CTA
   * "replace" = hide UI and show CTA card only
   */
  mode?: "overlay" | "replace";

  /**
   * Optional: show a short line under the title
   */
  description?: string;

  className?: string;
};

export default function ProLock({
  feature,
  children,
  mode = "overlay",
  description,
  className = "",
}: ProLockProps) {
  const { isPro, loading } = useProStatus(true);

  if (loading) {
    return (
      <div className={`rounded-2xl border border-slate-800 bg-slate-950 p-4 ${className}`}>
        <div className="h-4 w-40 animate-pulse rounded bg-slate-800" />
        <div className="mt-3 h-3 w-72 animate-pulse rounded bg-slate-800" />
      </div>
    );
  }

  // Pro users: pass-through
  if (isPro) return <>{children}</>;

  const card = (
    <div className={`rounded-2xl border border-slate-800 bg-slate-950 p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{feature} is Pro</div>
          <div className="mt-1 text-sm text-slate-300">
            {description || "Upgrade to unlock this feature and the full Oren toolkit."}
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

  if (mode === "replace") return card;

  // Overlay mode: let users see it exists, but block interaction.
  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none select-none opacity-40 blur-[0.3px]">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">{card}</div>
      </div>
    </div>
  );
}
