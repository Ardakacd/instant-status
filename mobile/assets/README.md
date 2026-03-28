# App assets

## Checklist (after changing `logo.png` / `brand.json`)

Run **`npm run generate:logo-assets`** so these stay in sync:

| Asset | Where it’s used |
|-------|------------------|
| `logo.png` | `app.json` **icon**, favicons, widget target, iOS icon (via Expo) |
| `splash.png` | Root + **Android** `splash` in `app.json` (iOS: contain · Android: cover) |
| `adaptive-icon.png` | Android **adaptive** foreground; **layer color** in `app.json` matches **`splashBackground`** (no white ring) |
| `notification-icon.png` | Android status bar / tray (`app.json` `android.notification`) |
| `favicon.*`, `apple-touch-icon`, `web-app-manifest-*.png` | `assets/` (Expo web) + **`public/`** (Firebase Hosting) |
| `site.webmanifest` | **`assets/`** and **`public/`** (generator syncs theme from `brand.json`) |

## Logo (source file)

The repo includes a **placeholder** `logo.png` so builds work out of the box — **replace it** with your real square logo (1024×1024 PNG recommended).

**App icon looks small?** Usually the **mark doesn’t fill the square** (too much padding or tiny graphic). Re-export `logo.png` so the artwork is **larger in the frame** — that affects **iOS** and **Android** (and favicons). You don’t have to fill edge-to-edge, but the glyph should occupy most of the canvas.

**Android only:** `brand.json` → **`adaptiveIconScale`** (default **0.78**, was **0.66** in the script before). Raise toward **0.85–0.92** for a bolder launcher icon; too high can clip on some device masks.

**Bigger white mark inside `logo.png` (same file):** run **`npm run scale:logo-mark`** (optional size `0.88`–`0.95`, e.g. `npm run scale:logo-mark -- 0.92`). It uses **`brand.json` → `splashBackground`** as the **only** background color (no corner pixel sampling), and snaps similar teal pixels so you don’t get **two different greens**. Then run **`npm run generate:logo-assets`**.

1. Overwrite `logo.png` in this folder with your asset (square, can include a solid background for the app icon).
1b. **Optional:** add **`splash-logo.png`** — same mark but **transparent** background — only for generating `splash.png` (see table below). Skip if you’re fine using `logo.png` for everything.
2. **Brand / splash / Android icon:** edit **`brand.json`**
   - `splashBackground` — hex fill behind the logo on the splash.
   - `splashLogoScale` — how large the logo is on the generated **splash.png** (0.22–**0.95**). Default **0.93**.
   - `adaptiveIconScale` — Android **launcher** foreground size (0.55–**0.92**). **Lower = smaller icon in the circle** (default **0.64** if icon felt too big).
   The generator builds **`splash.png`** from that + your logo and syncs `app.json`.
3. From the `mobile` folder run:

```bash
npm run generate:logo-assets
```

That regenerates **all** derived assets: **`splash.png`**, Android adaptive + notification, PWA / web manifest sizes, Firebase Hosting favicons (`public/`), and the iOS **widget** App Icon set.

**Two files (recommended if your app icon needs a solid background):**

| File | Purpose |
|------|--------|
| **`logo.png`** | App icon, Android adaptive, favicons, widget icons — **keep your solid/green square** here so the home-screen icon looks right. |
| **`splash-logo.png`** (optional) | **Transparent** mark only. Used for **`splash.png`** and for **`notification-icon.png`** (Android wants **white + transparency** in the tray; we generate white using your shape’s alpha). If missing, both fall back to `logo.png` (splash seams + colored notification icon). |

**Filename:** **`splash-logo.png`** or **`splash-screen.png`** in `assets/` (both work).

**Splash color** still comes only from **`brand.json`** → `splashBackground`, then run `npm run generate:logo-assets`.

- **App icon** in `app.json` → `./assets/logo.png`
- **Splash** in `app.json` → `./assets/splash.png` (generated)

**Favicons (`favicon.ico`, `favicon.svg`, `favicon-96x96.png`, `apple-touch-icon.png`):** generated into **`assets/`** (Expo Web reads `app.json` → `web.favicon` and static hosting) **and** **`public/`** (Firebase Hosting HTML). Don’t delete the `assets/` copies — they were stale before because the script only wrote to `public/`; that’s fixed. Run `npm run generate:logo-assets` after logo changes.

## Old `icon.png`

If you still have `icon.png` from before, you can delete it after switching to `logo.png` and running the generator.
