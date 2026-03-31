/**
 * Development-only switches. `__DEV__` must guard usage — never rely on these in production logic paths alone.
 *
 * When true (and running a dev build), `useIsPremium` behaves as if the user has no premium access,
 * so paywalls and upgrade flows show even if the backend / RevenueCat say otherwise.
 *
 * `true` = app treats you as non‑premium (paywalls, manage custom status, etc.).
 * Set back to `false` when testing real subscription state; production ignores this (`__DEV__` only).
 */
export const DEV_ALWAYS_SHOW_PAYWALL = false;
