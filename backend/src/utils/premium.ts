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

/** Far-future date for lifetime purchases (RevenueCat sends null expiration) */
export const LIFETIME_PREMIUM_UNTIL = new Date("9999-12-31T23:59:59.999Z");
