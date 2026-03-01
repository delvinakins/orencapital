// src/app/icon.tsx
import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
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
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0f0d", // dark brand background
        }}
      >
        <img
          src={`data:image/png;base64,${logoBase64}`}
          width="360"
          height="360"
          alt="Oren Capital"
        />
      </div>
    ),
    size
  );
}