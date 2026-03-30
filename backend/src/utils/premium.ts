/**
 * Premium status is derived from premium_until only.
 * Formula: isPremium = (premium_until != null) AND (now < premium_until)
 */
export function isUserPremium(user: {
  premium_until: Date | null;
}): boolean {
  if (!user.premium_until) return false;
  return new Date() < new Date(user.premium_until);
}

/** After `premium_until`, user still has full premium access for this window (see connections, status-option). */
export const PREMIUM_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

/** After `premium_until`, custom-status reset logic uses this window (see user controller). */
export const CUSTOM_STATUS_POST_EXPIRY_RESET_MS = 24 * 60 * 60 * 1000;

/**
 * Grace flags derived from `premium_until` only — keep in sync with API behavior
 * (auth sync, GET /user/me, status-option grace access).
 */
export function computePremiumGraceFlags(
  user: { premium_until: Date | null },
  now: Date = new Date(),
): { is_in_grace_period: boolean; should_reset_custom_status: boolean } {
  if (!user.premium_until) {
    return { is_in_grace_period: false, should_reset_custom_status: false };
  }
  const expirationDate = new Date(user.premium_until);
  const expMs = expirationDate.getTime();
  const is_in_grace_period =
    now >= expirationDate &&
    now < new Date(expMs + PREMIUM_GRACE_PERIOD_MS);
  const should_reset_custom_status =
    now >= new Date(expMs + CUSTOM_STATUS_POST_EXPIRY_RESET_MS);
  return { is_in_grace_period, should_reset_custom_status };
}

/** Far-future date for lifetime purchases (RevenueCat sends null expiration) */
export const LIFETIME_PREMIUM_UNTIL = new Date("9999-12-31T23:59:59.999Z");
