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
          background: "#0b0f0d",
          color: "white",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <img
          src={`data:image/png;base64,${logoBase64}`}
          width="220"
          height="220"
          alt="Oren Capital"
        />

        <div
          style={{
            marginTop: 40,
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Oren Capital
        </div>

        <div
          style={{
            marginTop: 20,
            fontSize: 28,
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