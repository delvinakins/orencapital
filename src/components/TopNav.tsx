"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

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
    <nav className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex h-16 items-center justify-between">
          {/* LEFT */}
          <div className="flex items-center gap-8">
            <Link href="/" className="text-lg font-semibold tracking-tight text-white">
              Oren Capital
            </Link>

            {/* DESKTOP LINKS */}
            <div className="hidden lg:flex items-center gap-6 text-sm text-slate-300">
              <Link href="/risk-engine" className="hover:text-white">
                Risk Engine
              </Link>
              <Link href="/variance" className="hover:text-white">
                Simulator
              </Link>

              <div className="relative" ref={moreRef}>
                <button onClick={() => setMoreOpen((v) => !v)} className="hover:text-white">
                  More
                </button>

                {moreOpen && (
                  <div className="absolute left-0 mt-3 w-48 rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
                    <MenuItem href="/portfolio" label="Portfolio" />
                    <MenuItem href="/journal" label="Journal" />
                    <MenuItem href="/pricing" label="Pricing" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-3">
            {/* MOBILE MENU BUTTON */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-label="Open menu"
              className="lg:hidden inline-flex h-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
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
                  className="h-10 w-10 rounded-xl border border-slate-800 bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {initials}
                </button>

                {acctOpen && (
                  <div className="absolute right-0 mt-3 w-48 rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
                    <MenuItem href="/account" label="Account" />
                    <button
                      onClick={logout}
                      className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-900"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
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
            className="fixed inset-0 z-40 bg-black/40"
            aria-label="Close menu overlay"
            onClick={() => setMobileOpen(false)}
          />

          <div className="fixed left-0 right-0 top-16 z-50 px-4 pb-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
              <div className="p-3 flex flex-col gap-1">
                <MobileItem href="/risk-engine" label="Risk Engine" onClick={() => setMobileOpen(false)} />
                <MobileItem href="/variance" label="Simulator" onClick={() => setMobileOpen(false)} />
                <MobileItem href="/portfolio" label="Portfolio" onClick={() => setMobileOpen(false)} />
                <MobileItem href="/journal" label="Journal" onClick={() => setMobileOpen(false)} />
                <MobileItem href="/pricing" label="Pricing" onClick={() => setMobileOpen(false)} />
                {signedIn && (
                  <>
                    <div className="my-2 h-px bg-slate-800" />
                    <MobileItem href="/account" label="Account" onClick={() => setMobileOpen(false)} />
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
        </div>
      )}
    </nav>
  );
}

function MenuItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">
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
