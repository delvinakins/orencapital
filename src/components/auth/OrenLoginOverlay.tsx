"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";

type Props = {
  title?: string;
  subtitle?: string;
  ctaPrimaryHref?: string;
  ctaPrimaryLabel?: string;
  ctaSecondaryHref?: string;
  ctaSecondaryLabel?: string;
  children?: ReactNode;
};

export default function OrenLoginOverlay({
  title = "Sign in to continue",
  subtitle = "Oren is built for discipline across markets. Sign in to view this section.",
  ctaPrimaryHref = "/login",
  ctaPrimaryLabel = "Sign in",
  ctaSecondaryHref = "/pricing",
  ctaSecondaryLabel = "View Pricing",
  children,
}: Props) {
  const accentStyle = { "--accent": "#2BCB77" } as CSSProperties;
  const pathname = usePathname();

  return (
    <div className="relative" style={accentStyle}>
      {/* Frosted overlay */}
      <div className="absolute inset-0 z-10 bg-black/35 backdrop-blur-[6px]" />

      <div className="relative z-20 mx-auto flex min-h-[420px] max-w-2xl items-center justify-center px-6 py-16">
        <div className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-black/20 px-3 py-1 text-xs text-foreground/70">
            Oren Capital • Protected view
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

          {children ? <div className="mt-4">{children}</div> : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={ctaPrimaryHref}
              className="oc-home-primary inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-medium text-black active:scale-[0.98]"
            >
              {ctaPrimaryLabel}
            </a>

            <a
              href={ctaSecondaryHref}
              className="inline-flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-5 py-3 text-sm font-medium text-foreground/90 hover:bg-white/5 active:scale-[0.98]"
            >
              {ctaSecondaryLabel}
            </a>
          </div>

          <div className="mt-6 text-xs text-foreground/55">
            Calm by design. No hype. Just discipline.
          </div>
        </div>
      </div>

      <style>{`
        .oc-home-primary {
          background: #ffffff;
          transition: opacity 150ms ease, transform 150ms ease;
        }
        .oc-home-primary:hover {
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
}