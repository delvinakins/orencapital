// /components/TopNav.tsx
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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
        setMobileOpen(false);
        setAcctOpen(false);
        setMoreOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;

      if (acctOpen && acctRef.current && !acctRef.current.contains(t)) setAcctOpen(false);
      if (moreOpen && moreRef.current && !moreRef.current.contains(t)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [acctOpen, moreOpen]);

  function closeAll() {
    setMobileOpen(false);
    setAcctOpen(false);
    setMoreOpen(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Brand */}
          <Link
            href="/"
            className="shrink-0 font-semibold tracking-tight text-slate-100 hover:text-white"
            onClick={closeAll}
          >
            Oren Capital
          </Link>

          {/* Desktop links (lg+) */}
          <div className="hidden lg:flex items-center gap-5">
            <TopLink href="/risk-engine">Risk Engine</TopLink>
            <TopLink href="/variance">Simulator</TopLink>
            <TopLink href="/portfolio">Portfolio</TopLink>

            {/* More menu */}
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-label="More menu"
                className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
              >
                More
                <span className="text-slate-500">▾</span>
              </button>

              {moreOpen && (
                <div className="absolute left-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
                  <MenuLink href="/journal" onClick={() => { setMoreOpen(false); }}>
                    Journal
                  </MenuLink>
                  <MenuLink href="/pricing" onClick={() => { setMoreOpen(false); }}>
                    Pricing
                  </MenuLink>

                  <div className="h-px bg-slate-800" />

                  {signedIn && (
                    <MenuLink
                      href="/account"
                      onClick={() => {
                        setMoreOpen(false);
                      }}
                    >
                      Account
                    </MenuLink>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Desktop right cluster (lg+) */}
          <div className="hidden lg:flex items-center gap-3">
            {signedIn && (
              <span className="rounded-full border border-slate-800 bg-slate-950/40 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                Pro
              </span>
            )}

            {signedIn ? (
              <div className="relative" ref={acctRef}>
                <button
                  type="button"
                  onClick={() => setAcctOpen((v) => !v)}
                  aria-expanded={acctOpen}
                  aria-label="Account menu"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 text-sm font-semibold text-slate-200 hover:bg-slate-900 active:scale-[0.99]"
                >
                  {initials}
                </button>

                {acctOpen && (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
                    <MenuLink
                      href="/account"
                      onClick={() => {
                        setAcctOpen(false);
                      }}
                    >
                      Account
                    </MenuLink>

                    <div className="h-px bg-slate-800" />

                    <button
                      onClick={logout}
                      className="w-full px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-900"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900"
              >
                Login
              </Link>
            )}
          </div>

          {/* Mobile button (< lg) */}
          <button
            type="button"
            onClick={() => {
              setMobileOpen((v) => !v);
              setAcctOpen(false);
              setMoreOpen(false);
            }}
            aria-expanded={mobileOpen}
            aria-label="Open menu"
            className="lg:hidden inline-flex h-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 px-3 text-sm font-semibold text-slate-200 hover:bg-slate-900 active:scale-[0.99]"
          >
            {signedIn ? initials : mobileOpen ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className="lg:hidden">
          <button
            aria-label="Close menu overlay"
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />

          <div className="fixed left-0 right-0 top-16 z-50 px-4 pb-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
              <div className="p-3 flex flex-col gap-1">
                <NavItem href="/risk-engine" onClick={closeAll}>
                  Risk Engine
                </NavItem>
                <NavItem href="/variance" onClick={closeAll}>
                  Simulator
                </NavItem>
                <NavItem href="/portfolio" onClick={closeAll}>
                  Portfolio
                </NavItem>

                <div className="my-2 h-px bg-slate-800" />

                <NavItem href="/journal" onClick={closeAll}>
                  Journal
                </NavItem>
                <NavItem href="/pricing" onClick={closeAll}>
                  Pricing
                </NavItem>

                {signedIn && (
                  <NavItem href="/account" onClick={closeAll}>
                    Account
                  </NavItem>
                )}

                <div className="my-2 h-px bg-slate-800" />

                {signedIn ? (
                  <button
                    onClick={logout}
                    className="rounded-xl px-3 py-3 text-left text-sm text-slate-200 hover:bg-slate-900"
                  >
                    Logout
                  </button>
                ) : (
                  <NavItem href="/login" onClick={closeAll}>
                    Login
                  </NavItem>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function TopLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-slate-300 hover:text-white">
      {children}
    </Link>
  );
}

function MenuLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={() => {
        onClick();
      }}
      className="block px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-900"
    >
      {children}
    </Link>
  );
}

function NavItem({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="rounded-xl px-3 py-3 text-sm text-slate-200 hover:bg-slate-900"
    >
      {children}
    </Link>
  );
}
