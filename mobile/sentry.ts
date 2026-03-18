import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

/** Redact sensitive keys from objects (recursively) */
function scrubSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(scrubSensitive);

  const sensitiveKeys = [
    "password",
    "token",
    "secret",
    "authorization",
    "auth",
    "cookie",
    "credential",
    "apiKey",
    "api_key",
    "oobCode",
    "idToken",
    "accessToken",
    "refreshToken",
    "email",
  ];
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (sensitiveKeys.some((s) => lower.includes(s))) {
      result[key] = "[redacted]";
    } else {
      result[key] = scrubSensitive(value);
    }
  }
  return result;
}

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__,
  debug: false,
  tracesSampleRate: 0.1,
  environment:
    Constants.expoConfig?.extra?.environment || process.env.NODE_ENV,
  beforeSend(event) {
    // Scrub exception message if it contains token-like patterns (long base64, etc.)
    if (event.exception?.values?.[0]?.value) {
      const msg = event.exception.values[0].value;
      event.exception.values[0].value = msg.replace(
        /(password|token|secret|oobCode|idToken|authorization)=["']?[^\s"']+["']?/gi,
        "$1=[redacted]"
      );
    }
    // Scrub breadcrumbs (URLs, messages with secrets)
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((b) => ({
        ...b,
        message: b.message?.replace(
          /(password|token|secret|oobCode|idToken|code)=[^&\s"']+/gi,
          "$1=[redacted]"
        ),
      }));
    }
    // Scrub extra context
    if (event.extra && typeof event.extra === "object") {
      event.extra = scrubSensitive(event.extra) as Record<string, unknown>;
    }
    return event;
  },
});

export default Sentry;