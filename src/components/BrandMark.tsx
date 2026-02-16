import React from "react";

type BrandMarkProps = {
  className?: string;
  title?: string;
};

/**
 * Oren Capital — Strategic Mark
 * Geometric pine silhouette whose right edge forms
 * a rising stair-step price structure.
 */
export default function BrandMark({
  className = "h-7 w-7",
  title = "Oren Capital",
}: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>

      {/* Base geometric mass */}
      <path
        d="
          M24 6
          L10 34
          H19
          L15 42
          H33
          L29 36
          L38 20
          L30 20
          L33 14
          L26 14
          L28 10
          Z
        "
        className="fill-slate-100"
      />

      {/* Ascending edge (structural, not decorative) */}
      <path
        d="
          M20 32
          L24 28
          L27 30
          L33 23
          "
        className="stroke-emerald-400"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Arrow head */}
      <path
        d="M32.6 23.1 L35 22.9 L34.8 25.3"
        className="stroke-emerald-400"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
