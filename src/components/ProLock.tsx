"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Mode = "overlay" | "inline" | "card" | "minimal" | string;

type ProLockProps = {
  // ✅ New API (recommended)
  title?: string;
  subtitle?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;

  // ✅ Back-compat for your existing callsites
  feature?: string;
  description?: string;
  mode?: Mode;

  children?: ReactNode;
};

export default function ProLock(props: ProLockProps) {
  const accentStyle = { "--accent": "#2BCB77" } as CSSProperties;
  const pathname = usePathname();

  // Back-compat mapping:
  const title = props.title ?? props.feature ?? "Pro required";
  const subtitle =
    props.subtitle ??
    props.description ??
    "This section is available on Pro. Upgrade to unlock advanced risk tools and market labs.";

  const primaryHref = props.primaryHref ?? "/pricing";
  const primaryLabel = props.primaryLabel ?? "View Pricing";
  const secondaryHref = props.secondaryHref ?? "/login";
  const secondaryLabel = props.secondaryLabel ?? "Sign in";

  // Mode only affects whether we draw the full-page overlay layer.
  // Keep calm defaults; allow existing 'mode' prop to keep working.
  const mode = props.mode ?? "overlay";
  const showBackdrop = mode === "overlay";

  const content = (
    <div
      className={cn(
        "w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]",
        "p-6 sm:p-7",
        "shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
      )}
    >
      <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-foreground/70">
        Oren Capital • Access restricted
      </div>

      <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        <span className="oren-accent relative inline-block align-baseline">
          <span className="relative z-10 text-[color:var(--accent)]">{title}</span>

          <span
            key={`underline-${pathname}`}
            aria-hidden
            className="oren-underline pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-[0.9]"
          />

          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-[0.10]"
          />
        </span>
      </h2>

      <p className="mt-3 max-w-prose text-sm leading-relaxed text-foreground/70">{subtitle}</p>

      {props.children ? <div className="mt-4">{props.children}</div> : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href={primaryHref}
          className="oc-primary inline-flex w-full items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-medium text-black active:scale-[0.98] sm:w-auto"
        >
          {primaryLabel}
        </a>

        <a
          href={secondaryHref}
          className="inline-flex w-full items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-5 py-3 text-sm font-medium text-foreground/90 hover:bg-white/5 active:scale-[0.98] sm:w-auto"
        >
          {secondaryLabel}
        </a>
      </div>

      <div className="mt-6 text-xs text-foreground/55">Discipline across markets. Calm by design.</div>

      <style>{`
        .oc-primary {
          background: #ffffff;
          transition: opacity 150ms ease, transform 150ms ease;
        }
        .oc-primary:hover {
          background: #ffffff;
          opacity: 0.92;
        }

        @media (prefers-reduced-motion: no-preference) {
          .oren-underline {
            transform-origin: left;
            transform: scaleX(0);
            animation: oren_underline 700ms cubic-bezier(0.2, 0.8, 0.2, 1) 120ms forwards;
          }
        }
        @keyframes oren_underline {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );

  return (
    <div className="relative" style={accentStyle}>
      {showBackdrop ? <div className="absolute inset-0 z-10 bg-black/35 backdrop-blur-[6px]" /> : null}

      <div className={cn("relative z-20 mx-auto", showBackdrop ? "flex min-h-[420px] max-w-2xl items-center justify-center px-6 py-14" : "max-w-2xl px-0 py-0")}>
        {content}
      </div>
    </div>
  );
}