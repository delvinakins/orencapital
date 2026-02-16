import React from "react";

type BrandMarkProps = {
  className?: string;
  title?: string;
};

/**
 * Oren Capital mark:
 * Pine tree silhouette whose right edge reads like an ascending price chart.
 * Pure SVG (no deps), safe for Next/App Router.
 */
export default function BrandMark({ className = "h-6 w-6", title = "Oren Capital" }: BrandMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>

      {/* Subtle background badge */}
      <path
        d="M10.5 6.5h27c2.2 0 4 1.8 4 4v27c0 2.2-1.8 4-4 4h-27c-2.2 0-4-1.8-4-4v-27c0-2.2 1.8-4 4-4Z"
        className="fill-slate-900/40"
      />

      {/* Pine/tree mass */}
      <path
        d="M24 8
           L14 20
           H19
           L12 28
           H18.5
           L13 36
           H22
           V40
           H26
           V36
           H35
           L31 30.5
           L34.5 26
           L29 26
           L31.5 20
           H34
           L24 8Z"
        className="fill-slate-100"
        opacity="0.92"
      />

      {/* Rising chart edge (cuts/overlays the right side to imply ascent) */}
      <path
        d="M22.5 33.5
           L26.5 29.5
           L29 31.5
           L35.5 25
           "
        className="stroke-emerald-300"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />

      {/* Arrow head */}
      <path
        d="M34.7 25.1 L36.6 25.0 L36.5 26.9"
        className="stroke-emerald-300"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
    </svg>
  );
}
