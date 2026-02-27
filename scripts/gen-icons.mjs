import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "public", "brandmark.svg");

// Output targets
const OUT_FAVICON = path.join(ROOT, "public", "favicon.ico");
const OUT_APPLE = path.join(ROOT, "public", "apple-touch-icon.png");
const OUT_ICON_PNG = path.join(ROOT, "public", "icon.png");

// Ensure input exists
if (!fs.existsSync(INPUT)) {
  console.error("Missing input:", INPUT);
  process.exit(1);
}

// Generate PNGs (multiple sizes) for ICO
const sizes = [16, 32, 48, 64, 128, 256];

const pngBuffers = [];
for (const s of sizes) {
  const buf = await sharp(INPUT, { density: 300 })
    .resize(s, s, { fit: "contain" })
    .png()
    .toBuffer();
  pngBuffers.push(buf);
}

// Write real ICO
const icoBuf = await toIco(pngBuffers);
fs.writeFileSync(OUT_FAVICON, icoBuf);

// Write apple touch icon (180x180)
await sharp(INPUT, { density: 300 })
  .resize(180, 180, { fit: "contain" })
  .png()
  .toFile(OUT_APPLE);

// Write generic icon.png (512x512)
await sharp(INPUT, { density: 300 })
  .resize(512, 512, { fit: "contain" })
  .png()
  .toFile(OUT_ICON_PNG);

console.log("✅ Wrote:");
console.log(" -", OUT_FAVICON);
console.log(" -", OUT_APPLE);
console.log(" -", OUT_ICON_PNG);