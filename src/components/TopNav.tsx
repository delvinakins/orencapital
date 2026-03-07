// src/components/TopNav.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import { useProStatus } from "@/hooks/useProStatus";
import { useSurvivalScore } from "@/lib/risk/useSurvivalScore";

function initialsFromEmail(email: string) {
  const local = email.split("@")[0] || "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? local[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? parts[0]?.[1] ?? "S").toUpperCase();
  return `${a}${b}`;
}

export default function TopNav() {
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const acctRef  = useRef<HTMLDivElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);

  const { isPro } = useProStatus(true);
  const survival  = useSurvivalScore();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [supabase]);

  const initials = useMemo(() => (email ? initialsFromEmail(email) : "OC"), [email]);
  const signedIn = !!email;

  const closeAll = () => { setToolsOpen(false); setAcctOpen(false); setMobileOpen(false); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeAll(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (acctRef.current?.contains(t))  return;
      if (toolsRef.current?.contains(t)) return;
      setAcctOpen(false);
      setToolsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const border = "border-[color:var(--border)]";
  const card   = "bg-[color:var(--card)]";
  const glass  = "bg-[color:var(--background)]/80";

  const survivalBadgeClass =
    survival?.tone === "accent"
      ? "hidden sm:inline-flex items-center rounded-full border border-emerald-700/40 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-200"
      : survival?.tone === "warn"
        ? "hidden sm:inline-flex items-center rounded-full border border-amber-700/40 bg-amber-600/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-amber-200"
        : "hidden sm:inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-200";

  return (
    <nav className={`sticky top-0 z-50 w-full border-b ${border} ${glass} backdrop-blur`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-[68px] items-center justify-between">

          {/* LEFT: Brand + primary nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="group inline-flex items-center gap-4" onClick={closeAll}>
              <span className="relative grid place-items-center">
                <span className="grid h-9 w-9 place-items-center">
                  <BrandMark />
                </span>
                <span className="pointer-events-none absolute -inset-2 rounded-full bg-emerald-600/10 blur-xl opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="text-lg font-semibold tracking-tight text-white">
                Oren <span className="text-slate-300">Capital</span>
              </span>
            </Link>

            {/* DESKTOP: Core workflow */}
            <div className="hidden lg:flex items-center gap-1 text-sm text-slate-300">
              <NavLink href="/how-it-works" label="How it works" onClick={closeAll} />
              <NavLink href="/risk"         label="Survivability"  onClick={closeAll} />
              <NavLink href="/risk-engine"  label="Position Risk"  onClick={closeAll} />
              <NavLink href="/journal"      label="Journal"        onClick={closeAll} />

              {/* Tools dropdown */}
              <div className="relative" ref={toolsRef}>
                <button
                  onClick={() => setToolsOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white transition-colors"
                  aria-expanded={toolsOpen}
                >
                  Tools <span className="text-slate-500 text-xs">▾</span>
                </button>

                {toolsOpen && (
                  <div className={`absolute left-0 mt-3 w-64 overflow-hidden rounded-2xl border ${border} ${card} shadow-2xl shadow-black/40`}>
                    <div className="px-3 pt-3 pb-1">
                      <div className="text-[10px] tracking-[0.18em] text-foreground/30 px-1 pb-1">RISK MANAGEMENT</div>
                      <MenuItem href="/risk/kill-switch" label="Kill Switch"  sub="Auto risk governor"     onClick={() => setToolsOpen(false)} />
                      <MenuItem href="/variance"         label="Simulator"    sub="Variance & drawdown"    onClick={() => setToolsOpen(false)} />
                      <MenuItem href="/portfolio"        label="Portfolio"    sub="Position overview"      onClick={() => setToolsOpen(false)} />
                    </div>

                    <div className={`my-1 h-px ${border}`} />

                    <div className="px-3 pb-3 pt-1">
                      <div className="text-[10px] tracking-[0.18em] text-foreground/30 px-1 pb-1">MARKET DATA</div>
                      <MenuItem href="/movers"       label="Movers"            sub="Top S&P 500 movers"        onClick={() => setToolsOpen(false)} />
                      <MenuItem href="/labs/kalshi"  label="Deviation Engine"  sub="Kalshi vs. vol model"      onClick={() => setToolsOpen(false)} />
                      <MenuItem href="/labs/nba"     label="NBA Watchlist"     sub="Game deviation signals"    onClick={() => setToolsOpen(false)} />
                      <MenuItem href="/labs/ufc"     label="UFC Hype Tax"      sub="Market vs Elo probability" onClick={() => setToolsOpen(false)} />
                    </div>
                  </div>
                )}
              </div>

              <NavLink href="/pricing" label="Pricing" onClick={closeAll} />
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-2">
            {survival && (
              <span title={survival.message ?? ""} className={survivalBadgeClass}>
                Survival {survival.score}
              </span>
            )}

            {signedIn && (
              <span className={
                isPro
                  ? "hidden sm:inline-flex items-center rounded-full border border-emerald-700/40 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-200"
                  : "hidden sm:inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-200"
              }>
                {isPro ? "PRO" : "FREE"}
              </span>
            )}

            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-label="Open menu"
              className={`lg:hidden inline-flex h-10 items-center justify-center rounded-xl border ${border} bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10`}
            >
              {mobileOpen ? "Close" : "Menu"}
            </button>

            {/* Account / Login */}
            {signedIn ? (
              <div className="relative" ref={acctRef}>
                <button
                  onClick={() => setAcctOpen((v) => !v)}
                  aria-expanded={acctOpen}
                  aria-label="Account menu"
                  className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl border ${border} bg-white/5 text-sm font-semibold text-white hover:bg-white/10`}
                >
                  {initials}
                </button>

                {acctOpen && (
                  <div className={`absolute right-0 mt-3 w-56 overflow-hidden rounded-2xl border ${border} ${card} shadow-2xl shadow-black/40`}>
                    <div className="px-3 pt-3 pb-1">
                      <div className="text-[10px] tracking-[0.18em] text-foreground/30 px-1 pb-1">ACCOUNT</div>
                      <MenuItem href="/account"         label="Settings" onClick={() => setAcctOpen(false)} />
                      <MenuItem href="/account/billing" label="Billing"  onClick={() => setAcctOpen(false)} />
                    </div>

                    <div className={`my-1 h-px ${border}`} />

                    <div className="px-3 pb-3 pt-1">
                      <div className="text-[10px] tracking-[0.18em] text-foreground/30 px-1 pb-1">LEGAL</div>
                      <MenuItem href="/terms"           label="Terms of Use"    onClick={() => setAcctOpen(false)} />
                      <MenuItem href="/privacy"         label="Privacy Policy"  onClick={() => setAcctOpen(false)} />
                      <MenuItem href="/risk-disclosure" label="Risk Disclosure" onClick={() => setAcctOpen(false)} />
                    </div>

                    <div className={`my-1 h-px ${border}`} />

                    <button
                      onClick={logout}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                onClick={closeAll}
                className={`rounded-xl border ${border} bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10`}
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE MENU */}
      {mobileOpen && (
        <div className="lg:hidden">
          <button
            className="fixed inset-0 z-40 bg-black/55"
            aria-label="Close menu overlay"
            onClick={() => setMobileOpen(false)}
          />

          <div className="fixed left-0 right-0 top-[68px] z-50 px-4 pb-4">
            <div className={`overflow-hidden rounded-2xl border ${border} ${card} shadow-2xl shadow-black/40`}>
              <div className="p-3 space-y-0.5">

                <div className="text-[10px] tracking-[0.18em] text-foreground/30 px-2 pt-1 pb-2">CORE WORKFLOW</div>
                <MobileItem href="/risk"        label="Survivability"  sub="Simulate drawdowns & ruin"   onClick={closeAll} />
                <MobileItem href="/risk-engine" label="Position Risk"  sub="Size positions structurally" onClick={closeAll} />
                <MobileItem href="/journal"     label="Journal"        sub="Track behavior & execution"  onClick={closeAll} />

                <div className={`my-2 h-px ${border}`} />

                <div className="text-[10px] tracking-[0.18em] text-foreground/30 px-2 pt-1 pb-2">TOOLS</div>
                <MobileItem href="/risk/kill-switch" label="Kill Switch"       sub="Auto risk governor"        onClick={closeAll} />
                <MobileItem href="/variance"         label="Simulator"         sub="Variance & drawdown"       onClick={closeAll} />
                <MobileItem href="/portfolio"        label="Portfolio"         sub="Position overview"         onClick={closeAll} />
                <MobileItem href="/movers"           label="Movers"            sub="Top S&P 500 movers"        onClick={closeAll} />
                <MobileItem href="/labs/kalshi"      label="Deviation Engine"  sub="Kalshi vs. vol model"      onClick={closeAll} />
                <MobileItem href="/labs/nba"         label="NBA Watchlist"     sub="Game deviation signals"    onClick={closeAll} />
                <MobileItem href="/labs/ufc"         label="UFC Hype Tax"      sub="Market vs Elo probability" onClick={closeAll} />

                <div className={`my-2 h-px ${border}`} />

                <MobileItem href="/pricing"      label="Pricing"      onClick={closeAll} />
                <MobileItem href="/how-it-works" label="How it works" onClick={closeAll} />
                {!signedIn && <MobileItem href="/login" label="Login" onClick={closeAll} />}

              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white transition-colors"
    >
      {label}
    </Link>
  );
}

function MenuItem({
  href, label, sub, onClick,
}: {
  href: string; label: string; sub?: string; onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex flex-col rounded-xl px-3 py-2.5 hover:bg-white/5 transition-colors"
    >
      <span className="text-sm text-slate-200">{label}</span>
      {sub && <span className="text-xs text-foreground/40 mt-0.5">{sub}</span>}
    </Link>
  );
}

function MobileItem({
  href, label, sub, onClick,
}: {
  href: string; label: string; sub?: string; onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-white/5 transition-colors"
    >
      <span className="text-sm text-slate-200">{label}</span>
      {sub && <span className="text-xs text-foreground/40">{sub}</span>}
    </Link>
  );
}