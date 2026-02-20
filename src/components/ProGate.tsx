"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import ProLock from "@/components/ProLock";

type Mode = "overlay" | "inline" | "card" | "minimal" | string;

type Props = {
  children?: ReactNode;

  // ✅ New API (recommended)
  lockTitle?: string;
  lockSubtitle?: string;

  pricingHref?: string;
  loginHref?: string;

  mode?: Mode;
  loadingFallback?: ReactNode;

  // ✅ Back-compat (if older callsites used these names)
  feature?: string;
  description?: string;
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
  mode = "overlay",
  loadingFallback,

  // back-compat
  feature,
  description,
}: Props) {
  const [status, setStatus] = useState<"loading" | "pro" | "locked" | "unauthorized" | "error">("loading");

  async function check() {
    setStatus("loading");
    try {
      const res = await fetch("/api/pro/status", { cache: "no-store" });

      // ✅ Server truth contract
      if (res.status === 200) {
        setStatus("pro");
        return;
      }

      if (res.status === 402) {
        setStatus("locked");
        return;
      }

      if (res.status === 401 || res.status === 403) {
        setStatus("unauthorized");
        return;
      }

      // Don't leak details; just attempt parse so runtime doesn't explode
      if (isJsonResponse(res)) {
        await res.json().catch(() => null);
      }

      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockCopy = useMemo(() => {
    // Prefer new props; fall back to legacy ones
    const baseTitle = lockTitle ?? feature ?? "Pro required";
    const baseSubtitle =
      lockSubtitle ??
      description ??
      "This section is available on Pro. Upgrade to unlock advanced risk tools and market labs.";

    if (status === "unauthorized") {
      return {
        title: "Sign in required",
        subtitle:
          "Please sign in to continue. If you already have Pro, sign in with the email linked to your subscription.",
        primaryHref: loginHref,
        primaryLabel: "Sign in",
        secondaryHref: pricingHref,
        secondaryLabel: "View Pricing",
      };
    }

    if (status === "error") {
      return {
        title: "Unable to verify access",
        subtitle: "We couldn’t verify Pro access right now. Please refresh or try again in a moment.",
        primaryHref: pricingHref,
        primaryLabel: "View Pricing",
        secondaryHref: loginHref,
        secondaryLabel: "Sign in",
      };
    }

    // locked (not pro)
    return {
      title: baseTitle,
      subtitle: baseSubtitle,
      primaryHref: pricingHref,
      primaryLabel: "View Pricing",
      secondaryHref: loginHref,
      secondaryLabel: "Sign in",
    };
  }, [status, lockTitle, lockSubtitle, feature, description, pricingHref, loginHref]);

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

  // locked / unauthorized / error
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden">
      <ProLock
        // ✅ Back-compat: ProLock supports both title/subtitle and feature/description
        title={lockCopy.title}
        subtitle={lockCopy.subtitle}
        primaryHref={lockCopy.primaryHref}
        primaryLabel={lockCopy.primaryLabel}
        secondaryHref={lockCopy.secondaryHref}
        secondaryLabel={lockCopy.secondaryLabel}
        mode={mode}
      />
    </div>
  );
}