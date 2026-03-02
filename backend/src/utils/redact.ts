/**
 * Redact sensitive data from logs.
 * Use in production to avoid leaking PII (email, UIDs) while keeping logs useful for debugging.
 */

/** Redact email: "a***b@domain.com" */
export function redactEmail(email: string | undefined | null): string {
  if (!email || typeof email !== "string") return "[email]";
  const idx = email.indexOf("@");
  if (idx < 0) return "[email]";
  const [local, domain] = [email.slice(0, idx), email.slice(idx + 1)];
  const masked =
    local.length <= 2 ? "**" : local[0] + "***" + local[local.length - 1];
  return `${masked}@${domain}`;
}

/** Redact UID/identifier: "****abcd" (last 4 chars for correlation) */
export function redactUid(uid: string | undefined | null): string {
  if (!uid || typeof uid !== "string") return "[uid]";
  if (uid.length <= 4) return "****";
  return "****" + uid.slice(-4);
}
