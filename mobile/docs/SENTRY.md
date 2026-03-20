# Sentry (Expo / EAS)

## 1. Sentry.io

- Create/use project **react-native** under org **arda-kabadayi** (matches `app.json` plugin).
- Copy the **DSN** (Client Keys).

## 2. EAS secrets (required for production)

Do **not** commit the DSN or auth token. Set them for EAS builds:

```bash
cd mobile
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value "https://...@...ingest.sentry.io/..."
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value "sntrys_..."
```

- **`EXPO_PUBLIC_SENTRY_DSN`** — bundled into the app; without it, **no events** are sent in release builds.
- **`SENTRY_AUTH_TOKEN`** — used at **build time** by `@sentry/react-native/expo` to **upload source maps**. Without it you still get events, but stack traces may stay **minified**.

Token scopes (Sentry): **project:releases**, **org:read** (and artifact upload as per current Sentry docs).

## 3. Local `.env` (optional)

For local `expo run:ios` **release**-style testing you can use:

```env
EXPO_PUBLIC_SENTRY_DSN=https://...
EXPO_PUBLIC_APP_ENVIRONMENT=development
```

`EXPO_PUBLIC_*` is picked up when Metro starts with env loaded (e.g. `dotenv` or Expo’s env file support). **Dev** (`__DEV__`): Sentry stays **disabled** in `sentry.ts`.

## 4. Verify

1. Run **EAS production** (or **preview**) build after secrets exist.
2. Install build, trigger a test error (or temporary `Sentry.captureMessage("test")` with `enabled` forced on — remove after).
3. In Sentry: check **Issues**; open an event and confirm **unminified** frames (if token was set).
4. Confirm **environment** is `production` / `preview` (`EXPO_PUBLIC_APP_ENVIRONMENT` in `eas.json`).

## 5. Backend

Nest **backend** is not wired to Sentry. Add `@sentry/nestjs` separately if you want server errors in the same org.
