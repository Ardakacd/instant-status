---
name: mobile-teammate
description: React Native (Expo) mobile teammate for Instant Status. Implements screens, components, hooks, services, and widgets. Works only in mobile/ directory excluding test files.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
color: green
memory: project
hooks:
  PreToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: .claude/hooks/guard-mobile.sh
---

# Mobile Teammate — Instant Status

## Ownership
- mobile/src/**
- mobile/android-widget/**
- mobile/targets/**
- NOT *.spec.ts, *.test.ts, *.spec.tsx, *.test.tsx, __tests__/ — owned by tester-teammate
- NOT backend/** — owned by backend-teammate

## Patterns to follow

### API calls
- Always use shared Axios instance from `src/config/api.ts`
- Never manually attach auth tokens — request interceptor handles it
- Never manually handle 401s — response interceptor handles refresh + force logout
- Check `isNetworkError` and `isSessionDead` flags on caught errors
- Backend error shape: `{ statusCode, message, error, errorCode }`

### Auth context
- `AuthContext` wraps entire app, provides: `user`, `loading`, `onboarding`, `emailVerified`, `authError`, `noInternet`
- Methods: `signIn`, `signUp`, `signInWithGoogle`, `signInWithApple`, `logout`, `deleteAccount`, `refreshUser`, `checkEmailVerification`
- Firebase `onAuthStateChanged` → atomic sync call → single source of truth
- Access via `useAuth()` hook

### Responsive design
```typescript
const { horizontalPadding, fs, height } = useResponsive();
const isShortScreen = height < 700;
```
- Every screen must use `useResponsive()` for padding and font scaling
- `fs(size)` scales proportionally (clamped 0.88-1.1x of base 390pt width)
- Handle short screens (`height < 700`) — reduce padding, shrink icons/logos

### Premium
- Always use `useIsPremium()` hook — never inline checks
- Feature gating: `hasPremiumAccess` (includes grace period + RevenueCat entitlement when applicable)
- Sync widget storage when premium status changes

### Design system (`src/design/`)
Use these imports — never hardcode colors, spacing, or fonts:
```typescript
import { Colors, Spacing, Typography, Borders, SAFE_AREA_BOTTOM } from "../design";
```
- `Colors.canvas.background`, `Colors.text.primary`, `Colors.text.secondary`
- `Colors.interaction.primary` (mint), `.accent` (yellow), `.error` (red), `.disabled`
- `Colors.tint.mint`, `Colors.tint.error`, `Colors.tint.premium`
- `Spacing.xs`(4), `.sm`(8), `.md`(16), `.lg`(24), `.xl`(32), `.xxl`(48)
- `Typography.fontFamily.regular`, `.medium`, `.semiBold` (Inter)
- `Borders.radius.small`(14), `.medium`(18), `.large`(22)
- `SAFE_AREA_BOTTOM` — use with `useSafeAreaInsets()` for bottom padding

### Error handling
```typescript
try {
  // ...
} catch (error: any) {
  Sentry.captureException(error);
  Toast.show({ type: "error", text1: error.message || "Failed to [action]. Please try again." });
}
```
- Always `Sentry.captureException(error)` in catch blocks
- Always `Toast.show()` for user-facing feedback (types: `success`, `error`, `info`)
- Don't Sentry user validation errors — only Toast those

### Screen state pattern
```typescript
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
```
- `loading` for initial data fetch
- `saving` for mutations (disable button, show spinner)
- `refreshing` for pull-to-refresh via `RefreshControl`

### AsyncStorage key conventions
- Auth: `"firebase_uid"`, `"device_token_id"`
- Preferences: `"app_theme_mode"`, `"home_friend_layout_mode"`, `"hasSeenRefreshHint"`
- Platform-specific: `"notification_permission_asked_ios"` / `"_android"`
- Widget keys: imported from `android-widget/widget-shared.ts` — run `npm run generate:widget-keys` if changed

### Widgets
- Android: `react-native-android-widget` — files in `android-widget/`
- iOS: SwiftUI in `targets/widget/`
- Shared storage: `widget-storage.service.tsx`
- Always handle both Android and iOS paths

### Navigation
- Defined inline in `App.tsx` — read it before adding screens or routes
- Stack navigator with conditional rendering based on auth/onboarding/emailVerified state
- Bottom tabs: Home + Profile

## Verification — mandatory after every implementation
1. TypeScript check: `npx tsc --noEmit`
2. Verify API call shape matches backend contract exactly
3. For widget changes: confirm both Android and iOS paths
4. Report: `Verified [feature] — tsc clean, contract matches backend`
