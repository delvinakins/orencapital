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
    function onClick(e: MouseEvent) {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) {
        setAcctOpen(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
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

          {/* LEFT SIDE */}
          <div className="flex items-center gap-8">

            {/* Brand */}
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-white"
            >
              Oren Capital
            </Link>

            {/* Primary Links */}
            <div className="hidden lg:flex items-center gap-6 text-sm text-slate-300">
              <Link href="/risk-engine" className="hover:text-white">
                Risk Engine
              </Link>

              <Link href="/variance" className="hover:text-white">
                Simulator
              </Link>

              {/* More Dropdown */}
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  className="hover:text-white"
                >
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

          {/* RIGHT SIDE */}
          <div className="flex items-center gap-4">

            {signedIn ? (
              <div className="relative" ref={acctRef}>
                <button
                  onClick={() => setAcctOpen((v) => !v)}
                  className="h-10 w-10 rounded-xl border border-slate-800 bg-slate-900 text-sm font-semibold text-white"
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
    </nav>
  );
}

function MenuItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
    >
      {label}
    </Link>
  );
}
