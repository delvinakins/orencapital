// src/components/LegalGate.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function shouldSkip(pathname: string) {
  // Allow viewing legal + auth pages without looping
  if (pathname.startsWith("/terms")) return true;
  if (pathname.startsWith("/privacy")) return true;
  if (pathname.startsWith("/risk-disclosure")) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/auth")) return true;
  return false;
}

export default function LegalGate() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    if (!pathname) return;
    if (shouldSkip(pathname)) return;

    // prevent double-firing in React strict mode
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const r = await fetch("/api/legal/status", { method: "GET" });
        const j = await r.json();

        if (!j?.ok) return;

        // Only gate signed-in users
        if (j.signedIn && !j.accepted) {
          const qs = searchParams?.toString();
          const returnTo = qs ? `${pathname}?${qs}` : pathname;
          window.location.href = `/terms/accept?returnTo=${encodeURIComponent(returnTo)}`;
        }
      } catch {
        // fail-open (don’t brick the app if network hiccups)
      }
    })();
  }, [pathname, searchParams]);

  return null;
}