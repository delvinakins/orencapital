// src/app/opengraph-image.tsx
// Auto-generates the OG image for orencapital.com social previews.
// Next.js serves this at /opengraph-image and wires it into <meta> automatically.

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Oren Capital — Risk discipline for serious traders.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          background: "#080808",
          padding: "72px 80px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Subtle grid lines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Accent glow */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -80,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(220,38,38,0.12) 0%, transparent 70%)",
          }}
        />

        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
          }}
        >
          {/* O mark */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "2.5px solid rgba(220,38,38,0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "rgba(220,38,38,0.7)",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: "rgba(255,255,255,0.9)",
              letterSpacing: "-0.5px",
            }}
          >
            Oren Capital
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.1,
            letterSpacing: "-1.5px",
            marginBottom: 20,
            maxWidth: 800,
          }}
        >
          Risk discipline for serious traders.
        </div>

        {/* Sub */}
        <div
          style={{
            fontSize: 22,
            color: "rgba(255,255,255,0.4)",
            fontWeight: 400,
            letterSpacing: "-0.2px",
          }}
        >
          orencapital.com
        </div>
      </div>
    ),
    { ...size }
  );
}
