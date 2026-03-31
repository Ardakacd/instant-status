/**
 * Design Tokens
 *
 * Usage Hierarchy:
 * 1. Clarity
 * 2. Calm
 * 3. Visual delight (last, optional)
 */

// ============================================================================
// 1. COLOR SYSTEM (Strict Roles)
// ============================================================================

export type ColorPalette = {
  canvas: { background: string; card: string; subtle: string };
  text: { primary: string; secondary: string };
  interaction: { primary: string; accent: string; informational: string; disabled: string; error: string };
  tint: { mint: string; error: string; premium: string };
};

export const lightColors: ColorPalette = {
  canvas: { background: '#FFFFFF', card: '#F3F4F6', subtle: '#E5E7EB' },
  text: { primary: '#2C2C2C', secondary: '#6B7280' },
  interaction: { primary: '#10B981', accent: '#F59E0B', informational: '#A78BFA', disabled: '#D1D5DB', error: '#FF5C5C' },
  tint: { mint: '#ECFDF5', error: '#FEF2F2', premium: '#F0FDF8' },
};

export const darkColors: ColorPalette = {
  canvas: { background: '#111827', card: '#1F2937', subtle: '#374151' },
  text: { primary: '#F9FAFB', secondary: '#9CA3AF' },
  interaction: { primary: '#10B981', accent: '#F59E0B', informational: '#A78BFA', disabled: '#4B5563', error: '#FF5C5C' },
  tint: { mint: '#064E3B', error: '#7F1D1D', premium: '#052E16' },
};

// Backward compat — static light colors for anything that can't use the hook
export const Colors = lightColors;

// Color usage rules:
// - Primary Action Color (Mint): Set/update status, confirm actions, primary CTA
// - Accent Color (Yellow): Premium highlight, "best value" badge, one emphasis per screen max
//   ❌ Never use yellow as a full background
//   ❌ Never stack yellow with mint on the same element
// - Informational Color (Lavender): Info boxes, pending state indicators, non-actionable notices
// - Disabled State: Soft grey, desaturated, no border emphasis, no physical shift

// ============================================================================
// 2. BORDERS & GEOMETRY
// ============================================================================

export const Borders = {
  width: 2, // 2px everywhere, no exceptions
  radius: {
    small: 14, // Small: 14px
    medium: 18, // Medium (default): 18px
    large: 22, // Large (special cards): 22px
  },
} as const;

// Rules:
// ❌ No sharp corners
// ❌ No circles with stroke-only borders unless they represent presence

// ============================================================================
// 3. MOTION TOKENS
// ============================================================================

export const Motion = {
  duration: {
    fast: 100, // 100-120ms
    normal: 160, // 160-200ms
  },
  easing: {
    // Use React Native's default easing (ease-in-out)
    default: 'ease-in-out',
  },
} as const;

// Motion exists to:
// - Confirm intent
// - Maintain spatial continuity
// 
// Allowed Motion:
// - Position shift
// - Size expansion
// - Opacity fade (secondary only)
// 
// ❌ No bounce
// ❌ No spring overshoot
// ❌ No looping animations

// ============================================================================
// 4. HAPTICS RULES
// ============================================================================

export const Haptics = {
  strength: 'light' as const, // Light only
  allowed: [
    'set_status', // Set status
    'confirm_add_friend', // Confirm add friend
    'confirm_upgrade', // Confirm upgrade
  ],
  forbidden: [
    'navigation', // Navigation
    'toggles', // Toggles
    'scrolling', // Scrolling
    'sign_up', // Sign-up
  ],
} as const;

// Haptics are rare and meaningful.
// Haptic strength: Light only

// ============================================================================
// 5. TYPOGRAPHY RULES
// ============================================================================

export const Typography = {
  fontFamily: {
    regular: 'Inter-Regular', // Regular weight (400)
    medium: 'Inter-Medium', // Medium weight (500)
    semiBold: 'Inter-SemiBold', // SemiBold weight (600)
  },
  weight: {
    heading: '600' as const, // Headings: 600 (React Native accepts string weights)
    body: '400' as const, // Body: 400
    cta: '500' as const, // CTA: 500
  },
  lineHeight: {
    // Generous, never cramped
    // Use React Native's default line height multipliers
    default: 1.5,
    heading: 1.4,
  },
} as const;

// Rules:
// ❌ No playful fonts
// ❌ No ultra-bold weights

// ============================================================================
// 6. ICONOGRAPHY
// ============================================================================

export const Icons = {
  style: 'stroke-based' as const, // Stroke-based icons
  color: Colors.text.primary, // Charcoal only
  filled: {
    lock: true, // No filled icons except lock (small)
  },
} as const;

// Rules:
// - Icons never draw attention
// - Stroke-based icons, charcoal only
// - No filled icons except lock (small)

// ============================================================================
// 7. SPACING SYSTEM
// ============================================================================

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Base padding added with insets.bottom for modals/sheets to avoid nav bar overlap */
export const SAFE_AREA_BOTTOM = Spacing.md;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ColorKey = keyof ColorPalette;
export type BorderRadius = keyof typeof Borders.radius;
export type MotionDuration = keyof typeof Motion.duration;
export type SpacingKey = keyof typeof Spacing;

