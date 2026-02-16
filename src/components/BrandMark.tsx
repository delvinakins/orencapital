import React from "react";

type BrandMarkProps = {
  className?: string;
  title?: string;
};

/**
 * Oren Capital — Final Strategic Mark
 * - Slightly enlarged pine mass
 * - Enlarged centered rising structure
 * - Balanced proportions
 */
export default function BrandMark({
  className = "h-8 w-8",
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

      {/* Pine silhouette (less scaled down now) */}
      <g transform="translate(1 1) scale(0.94)">
        <path
          d="
            M24 6
            L14 18
            H19
            L12 28
            H18.5
            L12.5 37
            H22
            V41
            H26
            V37
            H35.5
            L29.5 28
            H36
            L29 18
            H34
            L24 6
            Z
          "
          className="fill-slate-100"
          opacity="0.96"
        />
      </g>

      {/* Enlarged rising structure */}
      <path
        d="
          M14.5 33.5
          L21.5 28.5
          L26.5 30.8
          L32 25.5
          L35 27.5
          L40 22.5
        "
        className="stroke-emerald-600"
        strokeWidth="2.6"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        fill="none"
      />
    </svg>
  );
}
