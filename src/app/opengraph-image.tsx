// src/app/opengraph-image.tsx
import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logoPath = path.join(process.cwd(), "public", "oren-logo.png");
  const logo = fs.readFileSync(logoPath);
  const logoBase64 = logo.toString("base64");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background:
            "radial-gradient(circle at 50% 40%, rgba(43,203,119,0.08), transparent 55%), #0b0f0d",
          color: "white",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: 40,
            borderRadius: 200,
            background: "rgba(43,203,119,0.08)",
            boxShadow: "0 0 80px rgba(43,203,119,0.15)",
          }}
        >
          <img
            src={`data:image/png;base64,${logoBase64}`}
            width="220"
            height="220"
            alt="Oren Capital"
          />
        </div>

        {/* Brand */}
        <div
          style={{
            marginTop: 48,
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          Oren Capital
        </div>

        {/* Positioning */}
        <div
          style={{
            marginTop: 20,
            fontSize: 30,
            color: "#9ca3af",
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          Protect capital. Survive volatility. Trade with structure.
        </div>
      </div>
    ),
    size
  );
}