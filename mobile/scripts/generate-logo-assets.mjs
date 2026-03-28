#!/usr/bin/env node
/**
 * - assets/logo.png — full app icon WITH brand-color background baked in (iOS icon, Expo display, favicons, widget icons).
 * - assets/logo-foreground.png — RECOMMENDED: mark/symbol ONLY on a fully transparent background (Android adaptive icon foreground).
 *     Without this, logo.png is used as the adaptive foreground and its solid background causes white/color edges on the launcher icon.
 * - assets/splash-logo.png — optional; if present, used for splash.png and for notification-icon.png (white + alpha; Android status-bar style). If missing, logo.png is used for both (notification may look wrong in the tray).
 *
 * Generates:
 * - assets/adaptive-icon.png — Android adaptive (safe zone)
 * - assets/notification-icon.png — Android notification (256×256)
 * - assets/web-app-manifest-*.png — Expo web
 * - assets/ + public/ — favicon.ico, .svg, favicon-96x96, apple-touch (Expo uses assets/; Firebase Hosting uses public/)
 * - targets/widget/.../AppIcon.appiconset — iOS widget extension icons
 *
 * Usage: npm run generate:logo-assets
 *
 * Splash color: edit assets/brand.json → splashBackground (single source of truth).
 * Regenerates assets/splash.png and syncs app.json splash + web theme colors.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const PUBLIC = path.join(ROOT, "public");
const BRAND_PATH = path.join(ASSETS, "brand.json");
const APP_JSON_PATH = path.join(ROOT, "app.json");
const LOGO_SRC = path.join(ASSETS, "logo.png");
/** Transparent-bg mark used as Android adaptive foreground. Falls back to logo.png with a warning. */
const LOGO_FOREGROUND_SRC = path.join(ASSETS, "logo-foreground.png");

/**
 * Resolve the best source for the Android adaptive icon foreground (transparent-bg mark).
 * Priority: logo-foreground.png → splash-logo.png / splash-screen.png → logo.png (warn).
 */
function resolveAdaptiveForegroundSource() {
  if (fs.existsSync(LOGO_FOREGROUND_SRC)) {
    return { path: LOGO_FOREGROUND_SRC, label: "logo-foreground.png", warn: false };
  }
  const splashArt = findSplashArtPath();
  if (splashArt) {
    return { path: splashArt, label: path.basename(splashArt), warn: false };
  }
  return { path: LOGO_SRC, label: "logo.png ⚠️", warn: true };
}

/** Prefer splash-logo.png; also accepts splash-screen.png if you used that name. */
function findSplashArtPath() {
  const candidates = [
    path.join(ASSETS, "splash-logo.png"),
    path.join(ASSETS, "splash-screen.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** For splash + notification: transparent mark if you add splash art; else same as app icon. */
function resolveSplashLogoSource() {
  const found = findSplashArtPath();
  if (found) {
    return {
      path: found,
      label: `${path.basename(found)} (splash + notification art)`,
    };
  }
  return { path: LOGO_SRC, label: "logo.png (same as app icon)" };
}

/** iPhone 14 Pro Max portrait @3x — common Expo splash canvas */
const SPLASH_W = 1284;
const SPLASH_H = 2778;
const WIDGET_APPICON_DIR = path.join(
  ROOT,
  "targets/widget/Assets.xcassets/AppIcon.appiconset"
);

const ADAPTIVE_SIZE = 1024;

function loadBrand() {
  const defaults = {
    splashBackground: "#10B981",
    splashLogoScale: 0.97,
    /** Android adaptive foreground: fraction of 1024² canvas (0.55–0.92). Lower = smaller mark in launcher circle. */
    adaptiveIconScale: 0.64,
    /**
     * Android 12+ system splash icon width in dp (the icon shown before JS loads).
     * Default is ~200dp which looks small. 300 is a good starting point.
     * Increase this to make the splash logo bigger on modern Android.
     */
    android12SplashIconWidth: 300,
  };
  if (!fs.existsSync(BRAND_PATH)) return defaults;
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(BRAND_PATH, "utf8")) };
  } catch {
    return defaults;
  }
}

/** "#RRGGBB" → { r, g, b } for sharp */
function hexToRgb(hex) {
  const n = hex.replace(/^#/, "");
  if (n.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

const SITE_WEBMANIFEST_PATH = path.join(ASSETS, "site.webmanifest");

function syncAppJsonFromBrand(brand) {
  const raw = fs.readFileSync(APP_JSON_PATH, "utf8");
  const app = JSON.parse(raw);
  const hex = brand.splashBackground;
  app.expo.splash = app.expo.splash || {};
  app.expo.splash.image = "./assets/splash.png";
  // "cover" on both platforms so the bitmap fills the screen (no letterboxed tiny logo + wrong bg).
  app.expo.splash.resizeMode = "cover";
  app.expo.splash.backgroundColor = hex;
  if (app.expo.web) {
    app.expo.web.themeColor = hex;
    app.expo.web.backgroundColor = hex;
  }
  if (app.expo.android) {
    app.expo.android.adaptiveIcon = app.expo.android.adaptiveIcon || {};
    app.expo.android.adaptiveIcon.foregroundImage = "./assets/adaptive-icon.png";
    // Was #ffffff — caused white rings/halos around the mark; match brand green.
    app.expo.android.adaptiveIcon.backgroundColor = hex;
    app.expo.android.splash = app.expo.android.splash || {};
    app.expo.android.splash.image = "./assets/splash.png";
    app.expo.android.splash.resizeMode = "cover";
    app.expo.android.splash.backgroundColor = hex;
  }
  // Ensure expo-splash-screen plugin is present with Android 12+ splash icon width.
  // Android 12+ shows the system splash using the plugin config (not android.splash.image).
  // imageWidth controls how large the icon appears in the center of the splash on Android 12+.
  const splashIconWidth =
    typeof brand.android12SplashIconWidth === "number"
      ? brand.android12SplashIconWidth
      : 300;
  app.expo.plugins = app.expo.plugins || [];
  const splashPluginIdx = app.expo.plugins.findIndex(
    (p) => (Array.isArray(p) ? p[0] : p) === "expo-splash-screen"
  );
  // Keep resizeMode aligned with expo.splash (cover). imageWidth helps Android 12+ center icon size.
  const splashPluginConfig = [
    "expo-splash-screen",
    {
      backgroundColor: hex,
      image: "./assets/splash.png",
      imageWidth: splashIconWidth,
      resizeMode: "cover",
      android: {
        backgroundColor: hex,
        image: "./assets/splash.png",
        imageWidth: splashIconWidth,
        resizeMode: "cover",
      },
      ios: {
        backgroundColor: hex,
        image: "./assets/splash.png",
        resizeMode: "cover",
      },
    },
  ];
  if (splashPluginIdx >= 0) {
    app.expo.plugins[splashPluginIdx] = splashPluginConfig;
  } else {
    app.expo.plugins.unshift(splashPluginConfig);
  }

  fs.writeFileSync(APP_JSON_PATH, JSON.stringify(app, null, 2) + "\n");
  console.log("Synced app.json splash + web colors from brand.json:", hex);
}

function syncSiteWebmanifest(brand) {
  const hex = brand.splashBackground;
  const paths = [
    SITE_WEBMANIFEST_PATH,
    path.join(PUBLIC, "site.webmanifest"),
  ];
  for (const manifestPath of paths) {
    if (!fs.existsSync(manifestPath)) continue;
    const man = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    man.theme_color = hex;
    man.background_color = hex;
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2) + "\n");
    console.log("Synced", path.relative(ROOT, manifestPath), "theme colors:", hex);
  }
}

async function writeSplashPng(brand) {
  const { path: src, label } = resolveSplashLogoSource();
  const rgb = hexToRgb(brand.splashBackground);
  const raw = brand.splashLogoScale;
  const logoScale =
    typeof raw === "number" && !Number.isNaN(raw)
      ? Math.min(0.98, Math.max(0.22, raw))
      : 0.97;
  const maxLogo = Math.round(Math.min(SPLASH_W, SPLASH_H) * logoScale);
  const logoBuf = await sharp(src)
    .resize(maxLogo, maxLogo, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();
  const meta = await sharp(logoBuf).metadata();
  const w = meta.width ?? maxLogo;
  const h = meta.height ?? maxLogo;
  const left = Math.round((SPLASH_W - w) / 2);
  const top = Math.round((SPLASH_H - h) / 2);

  const out = path.join(ASSETS, "splash.png");
  await sharp({
    create: {
      width: SPLASH_W,
      height: SPLASH_H,
      channels: 3,
      background: rgb,
    },
  })
    .composite([{ input: logoBuf, left, top }])
    .png()
    .toFile(out);

  console.log(
    "Wrote",
    path.relative(ROOT, out),
    `(${SPLASH_W}×${SPLASH_H}, bg ${brand.splashBackground}, logo scale ${logoScale}, art from ${label})`
  );
}

function pixelDims(sizeStr, scaleStr) {
  const [w, h] = sizeStr.split("x").map(parseFloat);
  const s =
    scaleStr === "1x" ? 1 : scaleStr === "2x" ? 2 : scaleStr === "3x" ? 3 : 1;
  return {
    width: Math.round(w * s),
    height: Math.round(h * s),
  };
}

async function ensureLogo() {
  if (!fs.existsSync(LOGO_SRC)) {
    console.error(
      "Missing assets/logo.png — add your square logo there, then run again."
    );
    process.exit(1);
  }
}

async function writeAdaptiveIcon(brand) {
  const { path: src, label: srcLabel, warn } = resolveAdaptiveForegroundSource();
  if (warn) {
    console.warn(
      "\n⚠️  No transparent-bg source found for Android adaptive icon — falling back to logo.png." +
      "\n   This causes white/solid-background edges on the launcher icon." +
      "\n   Fix: save your mark (symbol only, transparent background) as assets/logo-foreground.png or assets/splash-screen.png.\n"
    );
  }

  const raw = brand.adaptiveIconScale;
  const ratio =
    typeof raw === "number" && !Number.isNaN(raw)
      ? Math.min(0.92, Math.max(0.55, raw))
      : 0.64;
  // Android safe zone is 66% of the total adaptive icon canvas.
  // Keep the mark inside that zone so it's never clipped by the launcher shape.
  const iconSize = Math.round(ADAPTIVE_SIZE * ratio);
  const offset = Math.round((ADAPTIVE_SIZE - iconSize) / 2);
  const resized = await sharp(src)
    .resize(iconSize, iconSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const out = path.join(ASSETS, "adaptive-icon.png");
  await sharp({
    create: {
      width: ADAPTIVE_SIZE,
      height: ADAPTIVE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left: offset, top: offset }])
    .png()
    .toFile(out);

  console.log(
    "Wrote",
    path.relative(ROOT, out),
    `(adaptive foreground scale ${ratio}, source: ${srcLabel})`
  );
}

const NOTIFICATION_ICON_SIZE = 256;

/**
 * Android small notification icons: white glyph on transparent (Material).
 * If splash-logo.png exists, we force RGB white and keep alpha. Otherwise full-color from logo.png (fallback).
 */
async function writeAndroidNotificationIcon() {
  const out = path.join(ASSETS, "notification-icon.png");
  const splashArt = findSplashArtPath();
  const useSplashSrc = splashArt !== null;
  const src = useSplashSrc ? splashArt : LOGO_SRC;

  if (!useSplashSrc) {
    console.warn(
      "No splash-logo.png / splash-screen.png: notification-icon is built from logo.png (full color). Android prefers white-on-transparent — add one of those for a proper tray icon."
    );
    await sharp(src)
      .resize(NOTIFICATION_ICON_SIZE, NOTIFICATION_ICON_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(out);
    console.log("Wrote", path.relative(ROOT, out), "(fallback)");
    return;
  }

  const { data, info } = await sharp(src)
    .resize(NOTIFICATION_ICON_SIZE, NOTIFICATION_ICON_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const outBuf = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
    const a = channels >= 4 ? data[i + 3] : 255;
    outBuf[j] = 255;
    outBuf[j + 1] = 255;
    outBuf[j + 2] = 255;
    outBuf[j + 3] = a;
  }

  await sharp(outBuf, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(out);

  console.log(
    "Wrote",
    path.relative(ROOT, out),
    "(white + alpha from splash-logo.png — Android notification style)"
  );
}

async function writePngResize(relPath, width, height, fromLogo = LOGO_SRC) {
  const dest = path.join(ROOT, relPath);
  await sharp(fromLogo)
    .resize(width, height, { fit: "cover" })
    .png()
    .toFile(dest);
  console.log("Wrote", path.relative(ROOT, dest));
}

async function copyToBothAssetsAndPublic(filename, w, h) {
  const buf = await sharp(LOGO_SRC)
    .resize(w, h, { fit: "cover" })
    .png()
    .toBuffer();
  for (const dir of [ASSETS, PUBLIC]) {
    const dest = path.join(dir, filename);
    fs.writeFileSync(dest, buf);
    console.log("Wrote", path.relative(ROOT, dest));
  }
}

async function writeFaviconIco() {
  const tmp = path.join(os.tmpdir(), `instant-status-favicon-${Date.now()}.png`);
  await sharp(LOGO_SRC)
    .resize(256, 256, { fit: "cover" })
    .png()
    .toFile(tmp);
  const ico = await pngToIco(tmp);
  fs.unlinkSync(tmp);
  for (const dir of [ASSETS, PUBLIC]) {
    const dest = path.join(dir, "favicon.ico");
    fs.writeFileSync(dest, ico);
    console.log("Wrote", path.relative(ROOT, dest));
  }
}

async function writeFaviconSvg() {
  const png96 = await sharp(LOGO_SRC)
    .resize(96, 96, { fit: "cover" })
    .png()
    .toBuffer();
  const b64 = png96.toString("base64");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 96 96">
  <image width="96" height="96" xlink:href="data:image/png;base64,${b64}"/>
</svg>
`;
  for (const dir of [ASSETS, PUBLIC]) {
    const dest = path.join(dir, "favicon.svg");
    fs.writeFileSync(dest, svg);
    console.log("Wrote", path.relative(ROOT, dest));
  }
}

/** Expo `app.json` web.favicon + Firebase static pages — keep assets + public in sync. */
async function writeFavicon96AndAppleTouch() {
  const w96 = path.join("favicon-96x96.png");
  const apple = path.join("apple-touch-icon.png");
  for (const rel of [w96, apple]) {
    const w = rel.includes("96") ? 96 : 180;
    const buf = await sharp(LOGO_SRC)
      .resize(w, w, { fit: "cover" })
      .png()
      .toBuffer();
    for (const dir of [ASSETS, PUBLIC]) {
      const dest = path.join(dir, rel);
      fs.writeFileSync(dest, buf);
      console.log("Wrote", path.relative(ROOT, dest));
    }
  }
}

async function writeWidgetAppIcons() {
  const contentsPath = path.join(WIDGET_APPICON_DIR, "Contents.json");
  if (!fs.existsSync(contentsPath)) {
    console.warn("Skip widget AppIcon: Contents.json not found");
    return;
  }
  const { images } = JSON.parse(fs.readFileSync(contentsPath, "utf8"));
  for (const img of images) {
    const { size, scale, filename } = img;
    const { width, height } = pixelDims(size, scale);
    const dest = path.join(WIDGET_APPICON_DIR, filename);
    await sharp(LOGO_SRC)
      .resize(width, height, { fit: "cover" })
      .png()
      .toFile(dest);
    console.log("Wrote", path.relative(ROOT, dest));
  }
}

async function main() {
  await ensureLogo();

  const brand = loadBrand();
  await writeSplashPng(brand);
  syncAppJsonFromBrand(brand);
  syncSiteWebmanifest(brand);

  await writeAdaptiveIcon(brand);
  await writeAndroidNotificationIcon();

  await copyToBothAssetsAndPublic("web-app-manifest-192x192.png", 192, 192);
  await copyToBothAssetsAndPublic("web-app-manifest-512x512.png", 512, 512);

  await writeFavicon96AndAppleTouch();

  await writeFaviconIco();
  await writeFaviconSvg();

  await writeWidgetAppIcons();

  console.log(
    "\nDone. Icon: assets/logo.png · Splash: generated assets/splash.png + brand.json color."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
