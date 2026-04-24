# Instant Status

Real-time status sharing app. Friends see each other's current status (busy, available, etc.) via mobile app and home screen widgets.

## Architecture

- **Backend**: NestJS + TypeORM + PostgreSQL + Firebase Admin SDK
- **Mobile**: React Native (Expo 54) + Firebase Client SDK + RevenueCat
- **Widgets**: Android (`react-native-android-widget`), iOS (SwiftUI via `@bacons/apple-targets`)

## Entities

| Entity | Table | PK | Key columns |
|---|---|---|---|
| User | users | uuid | firebase_uid, email, first_name, last_name, premium_until, revenuecat_id |
| Status | statuses | user_id (FK) | option_id (FK), note, expires_at |
| StatusOption | status_options | uuid | user_id (nullable=system preset), emoji, label, color, is_default |
| Connection | connections | uuid | user_id, friend_id, a_shows_status, b_shows_status |
| InviteCode | invite_codes | uuid | owner (FK), code, redeemed_by |
| DeviceToken | device_tokens | uuid | user_id (FK), token, platform |
| ProcessedWebhook | processed_webhooks | uuid | event_id (idempotency) |

### Connection normalized pair rule

`user_id` must always be < `friend_id` (UUID alphabetical sort). This prevents duplicate rows (A-B and B-A become one row). `a_shows_status` = visibility for the smaller UUID, `b_shows_status` = visibility for the larger UUID. Enforce on every insert.

## API error response format

Global `HttpExceptionFilter` shapes all errors:
```json
{
  "statusCode": 400,
  "message": ["error message"] or [{"field": "name", "message": "..."}],
  "error": "Bad Request",
  "errorCode": "AUTH_REQUIRED|EMAIL_NOT_VERIFIED|UNAUTHORIZED|TOKEN_INVALID",
  "timestamp": "2026-04-04T...",
  "path": "/auth/sync"
}
```
Zod validation errors become `[{ field, message }]` arrays.

## Auth flow

- `/auth/sync` (POST) — bootstrap endpoint, NO AuthGuard. Verifies Firebase token, upserts user, returns `{ user, onboarding, emailVerified }` atomically.
- All other protected endpoints use `@UseGuards(AuthGuard)` which verifies the Bearer token, loads user from DB, enforces email verification (opt-out via `@AllowUnverifiedEmail()`).

## Premium

Single source of truth: `user.premium_until` (timestamptz). Use `utils/premium.ts`:
- `isUserPremium(user)` — boolean check
- `computePremiumGraceFlags(user)` — returns `{ is_in_grace_period, should_reset_custom_status }`
- 3-day grace period after expiry, 1-day window before custom status resets
- `LIFETIME_PREMIUM_UNTIL` — sentinel date for lifetime subscribers

Never inline premium checks. Always use these utils (backend) or `useIsPremium` hook (mobile).
