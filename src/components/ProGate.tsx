"use client";

import { useEffect, useMemo, useState } from "react";
import ProLock from "@/components/ProLock";

type ProStatus =
  | { ok: true; pro: true }
  | { ok: true; pro: false }
  | { ok: false; reason?: "unauthorized" | "offline" | "error" };

type Props = {
  children: React.ReactNode;
  /** Optional: change lock copy per page */
  lockTitle?: string;
  lockSubtitle?: string;
  /** Optional: where to send user for upgrade/sign-in */
  pricingHref?: string;
  loginHref?: string;
  /** If you want to show something else while checking */
  loadingFallback?: React.ReactNode;
};

function isJsonResponse(res: Response) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json");
}

export default function ProGate({
  children,
  lockTitle,
  lockSubtitle,
  pricingHref = "/pricing",
  loginHref = "/login",
  loadingFallback,
}: Props) {
  const [status, setStatus] = useState<"loading" | "pro" | "locked" | "error">("loading");
  const [detail, setDetail] = useState<ProStatus | null>(null);

  async function check() {
    setStatus("loading");

    try {
      const res = await fetch("/api/pro/status", { cache: "no-store" });

      // Server truth:
      // - 200 => pro
      // - 402 => not pro
      // - 401/403 => not signed in (treat as locked)
      // Anything else => error
      if (res.status === 200) {
        setDetail({ ok: true, pro: true });
        setStatus("pro");
        return;
      }

      if (res.status === 402) {
        setDetail({ ok: true, pro: false });
        setStatus("locked");
        return;
      }

      if (res.status === 401 || res.status === 403) {
        setDetail({ ok: false, reason: "unauthorized" });
        setStatus("locked");
        return;
      }

      // If it returns JSON, try to parse but never show raw details to users
      if (isJsonResponse(res)) {
        await res.json().catch(() => null);
      }

      setDetail({ ok: false, reason: "error" });
      setStatus("error");
    } catch {
      setDetail({ ok: false, reason: "offline" });
      setStatus("error");
    }
  }

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockCopy = useMemo(() => {
    // Default copy stays calm & aligned with brand
    if (status === "error") {
      return {
        title: lockTitle ?? "Unable to verify access",
        subtitle:
          lockSubtitle ??
          "We couldn’t verify Pro access right now. Please refresh or try again in a moment.",
        primaryHref: pricingHref,
        primaryLabel: "View Pricing",
        secondaryHref: loginHref,
        secondaryLabel: "Sign in",
      };
    }

    // locked
    const unauthorized = detail?.ok === false && detail.reason === "unauthorized";
    return {
      title: lockTitle ?? (unauthorized ? "Sign in required" : "Pro required"),
      subtitle:
        lockSubtitle ??
        (unauthorized
          ? "Please sign in to continue. If you already have Pro, sign in with the email linked to your subscription."
          : "This section is available on Pro. Upgrade to unlock advanced risk tools and market labs."),
      primaryHref: unauthorized ? loginHref : pricingHref,
      primaryLabel: unauthorized ? "Sign in" : "View Pricing",
      secondaryHref: unauthorized ? pricingHref : loginHref,
      secondaryLabel: unauthorized ? "View Pricing" : "Sign in",
    };
  }, [status, detail, lockTitle, lockSubtitle, pricingHref, loginHref]);

  if (status === "loading") {
    return (
      loadingFallback ?? (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 text-foreground/70">
          Loading…
        </div>
      )
    );
  }

  if (status === "pro") return <>{children}</>;

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden">
      <ProLock
        title={lockCopy.title}
        subtitle={lockCopy.subtitle}
        primaryHref={lockCopy.primaryHref}
        primaryLabel={lockCopy.primaryLabel}
        secondaryHref={lockCopy.secondaryHref}
        secondaryLabel={lockCopy.secondaryLabel}
      />
    </div>
  );
}