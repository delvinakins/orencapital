"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import { useProStatus } from "@/hooks/useProStatus";

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

  const { isPro } = useProStatus(true);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    }
    loadUser();
  }, [supabase]);

  const initials = useMemo(() => (email ? initialsFromEmail(email) : "OC"), [email]);
  const signedIn = !!email;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAcctOpen(false);
        setMoreOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as Node;

      if (acctRef.current && !acctRef.current.contains(t)) setAcctOpen(false);
      if (moreRef.current && !moreRef.current.contains(t)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur supports-[backdrop-filter]:bg-slate-950/70">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* LEFT */}
          <div className="flex items-center gap-6">
            <Link href="/" className="group inline-flex items-center gap-3">
              <span className="relative grid place-items-center">
                <BrandMark className="h-7 w-7" />
                {/* subtle glow */}
                <span className="pointer-events-none absolute -inset-2 rounded-full bg-emerald-400/10 blur-xl opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="text-base font-semibold tracking-tight text-white">
                Oren <span className="text-slate-300">Capital</span>
              </span>
            </Link>

            {/* DESKTOP LINKS */}
            <div className="hidden lg:flex items-center gap-5 text-sm text-slate-300">
              <NavLink href="/risk-engine" label="Risk Engine" />
              <NavLink href="/variance" label="Simulator" />

              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-900/60 hover:text-white"
                  aria-expanded={moreOpen}
                  aria-label="More menu"
                >
                  More
                  <span className="text-slate-500">▾</span>
                </button>

                {moreOpen && (
                  <div className="absolute left-0 mt-3 w-52 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40">
                    <MenuItem href="/portfolio" label="Portfolio" />
                    <MenuItem href="/journal" label="Journal" />
                    <div className="my-1 h-px bg-slate-800" />
                    <MenuItem href="/pricing" label="Pricing" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-2">
            {/* PRO BADGE */}
            {signedIn && (
              <span
                className={
                  isPro
                    ? "hidden sm:inline-flex items-center rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-200"
                    : "hidden sm:inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-200"
                }
              >
                {isPro ? "PRO" : "FREE"}
              </span>
            )}

            {/* MOBILE MENU BUTTON */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-label="Open menu"
              className="lg:hidden inline-flex h-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {mobileOpen ? "Close" : "Menu"}
            </button>

            {/* ACCOUNT / LOGIN */}
            {signedIn ? (
              <div className="relative" ref={acctRef}>
                <button
                  onClick={() => setAcctOpen((v) => !v)}
                  aria-expanded={acctOpen}
                  aria-label="Account menu"
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {initials}
                  {/* small pro dot */}
                  {isPro && (
                    <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-slate-950 bg-emerald-400" />
                  )}
                </button>

                {acctOpen && (
                  <div className="absolute right-0 mt-3 w-52 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40">
                    <MenuItem href="/account" label="Account" />
                    <MenuItem href="/account/billing" label="Billing" />
                    <div className="my-1 h-px bg-slate-800" />
                    <button
                      onClick={logout}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-900"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-sm text-white hover:bg-slate-800"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE MENU SHEET */}
      {mobileOpen && (
        <div className="lg:hidden">
          <button
            className="fixed inset-0 z-40 bg-black/50"
            aria-label="Close menu overlay"
            onClick={() => setMobileOpen(false)}
          />

          <div className="fixed left-0 right-0 top-16 z-50 px-4 pb-4">
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40">
              <div className="p-2">
                <div className="p-2">
                  <div className="flex items-center gap-3">
                    <BrandMark className="h-7 w-7" />
                    <div className="text-sm font-semibold text-white">
                      Oren <span className="text-slate-300">Capital</span>
                    </div>
                    {signedIn && (
                      <span
                        className={
                          isPro
                            ? "ml-auto inline-flex items-center rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-200"
                            : "ml-auto inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-200"
                        }
                      >
                        {isPro ? "PRO" : "FREE"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="h-px bg-slate-800" />

                <div className="p-2 flex flex-col gap-1">
                  <MobileItem href="/risk-engine" label="Risk Engine" onClick={() => setMobileOpen(false)} />
                  <MobileItem href="/variance" label="Simulator" onClick={() => setMobileOpen(false)} />
                  <MobileItem href="/portfolio" label="Portfolio" onClick={() => setMobileOpen(false)} />
                  <MobileItem href="/journal" label="Journal" onClick={() => setMobileOpen(false)} />
                  <MobileItem href="/pricing" label="Pricing" onClick={() => setMobileOpen(false)} />
                  {signedIn && (
                    <>
                      <div className="my-2 h-px bg-slate-800" />
                      <MobileItem href="/account" label="Account" onClick={() => setMobileOpen(false)} />
                      <MobileItem href="/account/billing" label="Billing" onClick={() => setMobileOpen(false)} />
                      <button
                        onClick={logout}
                        className="rounded-xl px-3 py-3 text-left text-sm text-slate-200 hover:bg-slate-900"
                      >
                        Logout
                      </button>
                    </>
                  )}
                  {!signedIn && (
                    <>
                      <div className="my-2 h-px bg-slate-800" />
                      <MobileItem href="/login" label="Login" onClick={() => setMobileOpen(false)} />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 text-center text-xs text-slate-500">
              Tap outside to close
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-2 py-2 hover:bg-slate-900/60 hover:text-white"
    >
      {label}
    </Link>
  );
}

function MenuItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-900 hover:text-white">
      {label}
    </Link>
  );
}

function MobileItem({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="rounded-xl px-3 py-3 text-sm text-slate-200 hover:bg-slate-900"
    >
      {label}
    </Link>
  );
}
