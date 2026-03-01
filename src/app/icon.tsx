// src/app/icon.tsx
import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  const filePath = path.join(process.cwd(), "public", "brandmark.png");
  const png = fs.readFileSync(filePath);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${png.toString("base64")}`}
          width={512}
          height={512}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          alt="Oren Capital"
        />
      </div>
    ),
    size
  );
}