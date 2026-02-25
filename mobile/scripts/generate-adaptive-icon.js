#!/usr/bin/env node
/**
 * Generates adaptive-icon.png from icon.png with proper padding for Android.
 * Android adaptive icons use a ~66% safe zone; full-bleed icons appear too big.
 * This scales the icon to 66% and centers it on a transparent 1024x1024 canvas.
 */
const fs = require("fs");
const path = require("path");

const ASSETS_DIR = path.resolve(__dirname, "../assets");
const ICON_SRC = path.join(ASSETS_DIR, "icon.png");
const ICON_OUT = path.join(ASSETS_DIR, "adaptive-icon.png");
const SIZE = 1024;
const SAFE_ZONE_RATIO = 0.66; // Android safe zone ~66%

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.warn(
      "sharp not found. Run: npm install --save-dev sharp\n" +
        "Then run: node scripts/generate-adaptive-icon.js"
    );
    process.exit(1);
  }

  if (!fs.existsSync(ICON_SRC)) {
    console.error("icon.png not found at", ICON_SRC);
    process.exit(1);
  }

  const iconSize = Math.round(SIZE * SAFE_ZONE_RATIO);
  const offset = Math.round((SIZE - iconSize) / 2);

  const resized = await sharp(ICON_SRC)
    .resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const output = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left: offset, top: offset }])
    .png()
    .toFile(ICON_OUT);

  console.log("Generated", ICON_OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
