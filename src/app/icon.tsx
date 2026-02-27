// src/app/icon.tsx
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0f0d",
        }}
      >
        {/* Your BrandMark as a standalone SVG */}
        <svg width="380" height="380" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(1 1) scale(0.94)">
            <path
              d="M24 6 L14 18 H19 L12 28 H18.5 L12.5 37 H22 V41 H26 V37 H35.5 L29.5 28 H36 L29 18 H34 L24 6 Z"
              fill="#E7EBE8"
              opacity="0.96"
            />
          </g>
          <path
            d="M14.5 33.5 L21.5 28.5 L26.5 30.8 L32 25.5 L35 27.5 L40 22.5"
            stroke="#2BCB77"
            strokeWidth="2.6"
            strokeLinecap="butt"
            strokeLinejoin="miter"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}