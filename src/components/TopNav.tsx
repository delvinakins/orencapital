"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

function initialsFromEmail(email: string) {
  const local = email.split("@")[0] || "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? local[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? parts[0]?.[1] ?? "S").toUpperCase();
  return `${a}${b}`;
}

type NavLink = { href: string; label: string };

const PRIMARY_LINKS: NavLink[] = [
  { href: "/risk-engine", label: "Risk Engine" },
  { href: "/variance", label: "Simulator" },
];

const MORE_LINKS: NavLink[] = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/journal", label: "Journal" },
  { href: "/pricing", label: "Pricing" },
];

export default function TopNav() {
  const supabase = supabaseBrowser();
  const pathname = usePathname();

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

  // Close menus on Escape
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

  // Close dropdowns on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;

      if (acctOpen) {
        const el = acctRef.current;
        if (el && !el.contains(t)) setAcctOpen(false);
      }

      if (moreOpen) {
        const el = moreRef.current;
        if (el && !el.contains(t)) setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [acctOpen, moreOpen]);

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setAcctOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Brand */}
          <Link href="/" className="font-semibold tracking-tight text-slate-100 hover:text-white">
            Oren Capital
          </Link>

          {/* Desktop: primary links + More menu */}
          <div className="hidden lg:flex items-center gap-5">
            {PRIMARY_LINKS.map((l) => (
              <TopLink key={l.href} href={l.href} active={pathname === l.href}>
                {l.label}
              </TopLink>
            ))}

            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-label="More menu"
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  moreOpen
                    ? "border-slate-700 bg-slate-900 text-white"
                    : "border-slate-800 bg-slate-950/40 text-slate-200 hover:bg-slate-900"
                }`}
              >
                More
                <span className="text-slate-400">▾</span>
              </button>

              {moreOpen && (
                <div className="absolute left-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
                  {MORE_LINKS.map((l) => (
                    <MenuLink key={l.href} href={l.href}>
                      {l.label}
                    </MenuLink>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Desktop: account */}
          <div className="hidden lg:flex items-center gap-3">
            {signedIn ? (
              <div className="relative" ref={acctRef}>
                <button
                  type="button"
                  onClick={() => setAcctOpen((v) => !v)}
                  aria-expanded={acctOpen}
                  aria-label="Account menu"
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold active:scale-[0.99] ${
                    acctOpen
                      ? "border-slate-700 bg-slate-900 text-white"
                      : "border-slate-800 bg-slate-950/40 text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  {initials}
                </button>

                {acctOpen && (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
                    <MenuLink href="/account">Account</MenuLink>
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

          {/* Mobile: keep as-is for now */}
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

      {/* Mobile sheet (unchanged structure, but includes More links directly) */}
      {mobileOpen && (
        <div className="lg:hidden">
          <button className="fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />

          <div className="fixed left-0 right-0 top-16 z-50 px-4 pb-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
              <div className="p-3 flex flex-col gap-1">
                {PRIMARY_LINKS.map((l) => (
                  <NavItem key={l.href} href={l.href}>
                    {l.label}
                  </NavItem>
                ))}

                {MORE_LINKS.map((l) => (
                  <NavItem key={l.href} href={l.href}>
                    {l.label}
                  </NavItem>
                ))}

                <div className="my-2 h-px bg-slate-800" />

                {signedIn ? (
                  <>
                    <NavItem href="/account">Account</NavItem>
                    <button
                      onClick={logout}
                      className="rounded-xl px-3 py-3 text-left text-sm text-slate-200 hover:bg-slate-900"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <NavItem href="/login">Login</NavItem>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function TopLink({
  href,
  children,
  active,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`text-sm hover:text-white ${
        active ? "text-white" : "text-slate-300"
      }`}
    >
      {children}
    </Link>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-900">
      {children}
    </Link>
  );
}

function NavItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-xl px-3 py-3 text-sm text-slate-200 hover:bg-slate-900">
      {children}
    </Link>
  );
}
