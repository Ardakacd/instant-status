#!/usr/bin/env node
/**
 * Makes the foreground (white mark) larger in logo.png by trimming padding
 * and re-scaling the trimmed content to fill more of 1024×1024.
 *
 * Background uses assets/brand.json → splashBackground (same green everywhere).
 * Pixels close to that green in the scaled layer are snapped to the exact hex
 * so you don’t get two different teals (corner sample vs texture).
 *
 * Usage: node scripts/scale-logo-mark.mjs [fillRatio]
 *   fillRatio: 0.88 = mark uses ~88% of canvas max side (default 0.88)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOGO = path.join(ROOT, "assets", "logo.png");
const BRAND = path.join(ROOT, "assets", "brand.json");
const OUT = LOGO;
const CANVAS = 1024;

const fillRatio = Math.min(
  0.95,
  Math.max(0.65, Number.parseFloat(process.argv[2] ?? "0.88") || 0.88)
);

function hexToRgb(hex) {
  const n = String(hex).replace(/^#/, "");
  if (n.length !== 6) return { r: 16, g: 185, b: 129 };
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function loadBrandBg() {
  try {
    const j = JSON.parse(fs.readFileSync(BRAND, "utf8"));
    return hexToRgb(j.splashBackground || "#10B981");
  } catch {
    return hexToRgb("#10B981");
  }
}

/**
 * Snap “background teal” pixels to exact brand RGB so texture / JPEG-ish variance
 * doesn’t sit next to a flat fill (two greens).
 */
function normalizeBgPixelsToBrand(buf, width, height, brand, threshold = 62) {
  const { r: br, g: bg, b: bb } = brand;
  const out = Buffer.from(buf);
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    const a = buf[i + 3];
    const dist = Math.hypot(r - br, g - bg, b - bb);
    if (dist < threshold && a > 200) {
      out[i] = br;
      out[i + 1] = bg;
      out[i + 2] = bb;
    }
  }
  return out;
}

async function main() {
  if (!fs.existsSync(LOGO)) {
    console.error("Missing", LOGO);
    process.exit(1);
  }

  const brandBg = loadBrandBg();

  // Trim similar-colored border (teal background); threshold handles light texture
  let trimmed;
  let threshold = 45;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      trimmed = await sharp(LOGO)
        .trim({ threshold })
        .png()
        .toBuffer();
      break;
    } catch {
      threshold += 25;
    }
  }
  if (!trimmed) {
    trimmed = await sharp(LOGO).png().toBuffer();
  }

  const meta = await sharp(trimmed).metadata();
  const tw = meta.width ?? CANVAS;
  const th = meta.height ?? CANVAS;
  const targetMax = Math.round(CANVAS * fillRatio);
  const scale = Math.min(targetMax / tw, targetMax / th);
  const newW = Math.round(tw * scale);
  const newH = Math.round(th * scale);

  let resized = await sharp(trimmed)
    .resize(newW, newH, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const normalized = normalizeBgPixelsToBrand(
    resized.data,
    resized.info.width,
    resized.info.height,
    brandBg
  );

  const resizedPng = await sharp(normalized, {
    raw: {
      width: resized.info.width,
      height: resized.info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  const left = Math.round((CANVAS - newW) / 2);
  const top = Math.round((CANVAS - newH) / 2);

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 3,
      background: brandBg,
    },
  })
    .composite([{ input: resizedPng, left, top }])
    .png()
    .toFile(OUT);

  console.log(
    `Wrote ${path.relative(ROOT, OUT)} — mark scaled to ~${Math.round(fillRatio * 100)}% of canvas (trim ${tw}×${th} → ${newW}×${newH}), single bg from brand.json`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
