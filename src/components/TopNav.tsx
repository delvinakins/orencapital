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
  const [moreOpen, setMoreOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const acctRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // keep pro status for badge + other UI, but Labs link is public
  const { isPro } = useProStatus(true);

  // Survival score (from localStorage, updated by tools)
  const survival = useSurvivalScore();

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    }
    loadUser();
  }, [supabase]);

  const initials = useMemo(() => (email ? initialsFromEmail(email) : "OC"), [email]);
  const signedIn = !!email;

  const closeAll = () => {
    setMoreOpen(false);
    setAcctOpen(false);
    setMobileOpen(false);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAll();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      // IMPORTANT: stop the “click outside” handler from fighting menu clicks
      if (acctRef.current && acctRef.current.contains(t)) return;
      if (moreRef.current && moreRef.current.contains(t)) return;

      setAcctOpen(false);
      setMoreOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const border = "border-[color:var(--border)]";
  const card = "bg-[color:var(--card)]";
  const glass = "bg-[color:var(--background)]/80";

  const labsHref = "/labs/nba";
  const labsLabel = "Labs";

  // NEW shiny page
  const moversHref = "/movers";
  const moversLabel = "Movers";

  const survivalBadgeClass =
    survival?.tone === "accent"
      ? "hidden sm:inline-flex items-center rounded-full border border-emerald-700/40 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-200"
      : survival?.tone === "warn"
        ? "hidden sm:inline-flex items-center rounded-full border border-amber-700/40 bg-amber-600/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-amber-200"
        : "hidden sm:inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-200";

  // Pathway order (mirrors How It Works):
  // How it works → Survivability → Position Risk → Journal
  return (
    <nav className={`sticky top-0 z-50 w-full border-b ${border} ${glass} backdrop-blur`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-[68px] items-center justify-between">
          {/* LEFT */}
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

            {/* DESKTOP LINKS */}
            <div className="hidden lg:flex items-center gap-6 text-sm text-slate-300">
              <NavLink href="/how-it-works" label="How it works" onClick={closeAll} />
              <NavLink href="/risk" label="Survivability" onClick={closeAll} />
              <NavLink href="/risk-engine" label="Position Risk" onClick={closeAll} />
              <NavLink href="/journal" label="Journal" onClick={closeAll} />

              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5 hover:text-white"
                  aria-expanded={moreOpen}
                  aria-label="More menu"
                >
                  More <span className="text-slate-500">▾</span>
                </button>

                {moreOpen && (
                  <div
                    className={`absolute left-0 mt-3 w-56 overflow-hidden rounded-2xl border ${border} ${card} shadow-2xl shadow-black/40`}
                  >
                    {/* Tools */}
                    <MenuItem href="/variance" label="Simulator" onClick={() => setMoreOpen(false)} />
                    <MenuItem href="/portfolio" label="Portfolio" onClick={() => setMoreOpen(false)} />

                    <div className={`my-1 h-px ${border}`} />

                    {/* Explore */}
                    <MenuItem href={moversHref} label={moversLabel} onClick={() => setMoreOpen(false)} />
                    <MenuItem href={labsHref} label={labsLabel} onClick={() => setMoreOpen(false)} />
                    <MenuItem href="/risk-death" label="Blow-Up Risk" onClick={() => setMoreOpen(false)} />

                    <div className={`my-1 h-px ${border}`} />

                    {/* Monetize */}
                    <MenuItem href="/pricing" label="Pricing" onClick={() => setMoreOpen(false)} />

                    <div className={`my-1 h-px ${border}`} />

                    {/* Legal */}
                    <MenuItem href="/terms" label="Terms" onClick={() => setMoreOpen(false)} />
                    <MenuItem href="/privacy" label="Privacy" onClick={() => setMoreOpen(false)} />
                    <MenuItem href="/risk-disclosure" label="Risk Disclosure" onClick={() => setMoreOpen(false)} />
                  </div>
                )}
              </div>
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
              <span
                className={
                  isPro
                    ? "hidden sm:inline-flex items-center rounded-full border border-emerald-700/40 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-200"
                    : "hidden sm:inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-200"
                }
              >
                {isPro ? "PRO" : "FREE"}
              </span>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-label="Open menu"
              className={`lg:hidden inline-flex h-10 items-center justify-center rounded-xl border ${border} bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10`}
            >
              {mobileOpen ? "Close" : "Menu"}
            </button>

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
                  <div
                    className={`absolute right-0 mt-3 w-56 overflow-hidden rounded-2xl border ${border} ${card} shadow-2xl shadow-black/40`}
                  >
                    <MenuItem href="/account" label="Account" onClick={() => setAcctOpen(false)} />
                    <MenuItem href="/account/billing" label="Billing" onClick={() => setAcctOpen(false)} />

                    <div className={`my-1 h-px ${border}`} />

                    {/* Legal (easy to find when signed in) */}
                    <MenuItem href="/terms" label="Terms" onClick={() => setAcctOpen(false)} />
                    <MenuItem href="/privacy" label="Privacy" onClick={() => setAcctOpen(false)} />
                    <MenuItem href="/risk-disclosure" label="Risk Disclosure" onClick={() => setAcctOpen(false)} />

                    <div className={`my-1 h-px ${border}`} />

                    <button
                      onClick={logout}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                    >
                      Logout
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
              <div className="p-2 flex flex-col gap-1">
                {/* Flow-first */}
                <MobileItem href="/how-it-works" label="How it works" onClick={() => setMobileOpen(false)} />
                <MobileItem href="/risk" label="Survivability" onClick={() => setMobileOpen(false)} />
                <MobileItem href="/risk-engine" label="Position Risk" onClick={() => setMobileOpen(false)} />
                <MobileItem href="/journal" label="Journal" onClick={() => setMobileOpen(false)} />

                <div className={`my-1 h-px ${border}`} />

                {/* Tools */}
                <MobileItem href="/variance" label="Simulator" onClick={() => setMobileOpen(false)} />
                <MobileItem href="/portfolio" label="Portfolio" onClick={() => setMobileOpen(false)} />

                <div className={`my-1 h-px ${border}`} />

                {/* Explore */}
                <MobileItem href={moversHref} label={moversLabel} onClick={() => setMobileOpen(false)} />
                <MobileItem href={labsHref} label={labsLabel} onClick={() => setMobileOpen(false)} />
                <MobileItem href="/risk-death" label="Blow-Up Risk" onClick={() => setMobileOpen(false)} />

                <div className={`my-1 h-px ${border}`} />

                {/* Monetize */}
                <MobileItem href="/pricing" label="Pricing" onClick={() => setMobileOpen(false)} />
                {!signedIn && <MobileItem href="/login" label="Login" onClick={() => setMobileOpen(false)} />}

                <div className={`my-1 h-px ${border}`} />

                {/* Legal */}
                <MobileItem href="/terms" label="Terms" onClick={() => setMobileOpen(false)} />
                <MobileItem href="/privacy" label="Privacy" onClick={() => setMobileOpen(false)} />
                <MobileItem href="/risk-disclosure" label="Risk Disclosure" onClick={() => setMobileOpen(false)} />
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
    <Link href={href} onClick={onClick} className="rounded-lg px-2 py-2 hover:bg-white/5 hover:text-white">
      {label}
    </Link>
  );
}

function MenuItem({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
    >
      {label}
    </Link>
  );
}

function MobileItem({ href, label, onClick }: { href: string; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="rounded-xl px-3 py-3 text-sm text-slate-200 hover:bg-white/5">
      {label}
    </Link>
  );
}