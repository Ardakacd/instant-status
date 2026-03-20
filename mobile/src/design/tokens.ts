/**
 * Phase 1 — Design Tokens (LOCKED)
 * 
 * These tokens are the constitution of the app.
 * Everything else must obey them.
 * 
 * Usage Hierarchy:
 * 1. Clarity
 * 2. Calm
 * 3. Physical feedback
 * 4. Visual delight (last, optional)
 */

// ============================================================================
// 1. COLOR SYSTEM (Strict Roles)
// ============================================================================

export const Colors = {
  // 1.1 Canvas
  canvas: {
    background: '#FFFFFF', // App background: White
    // No dark mode (for now)
  },

  // 1.2 Text
  text: {
    primary: '#2C2C2C', // Charcoal - Used for titles, status text, names
    secondary: '#6B7280', // Muted charcoal - Used for timestamps, hints, labels
    // ❌ Never use pure black
    // ❌ Never reduce opacity for primary text
  },

  // 1.3 Interaction Colors
  interaction: {
    primary: '#10B981', // Mint - Set/update status, confirm actions, primary CTA
    accent: '#F59E0B', // Yellow - Premium highlight, "best value" badge (rare use)
    informational: '#A78BFA', // Lavender - Info boxes, pending state indicators, non-actionable notices
    disabled: '#D1D5DB', // Soft grey - Desaturated, no border emphasis, no physical shift
    error: '#FF5C5C', // Red - Error messages, validation failures
  },
} as const;

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
// 3. PHYSICAL SHIFT SYSTEM (Physical Offset Only)
// ============================================================================

export const PhysicalShift = {
  offset: {
    x: 4, // 4px right
    y: 4, // 4px down
  },
  transition: {
    duration: 120, // ≤ 120ms
  },
} as const;

// Physical Shift Rules:
// - Physical shift is physical, not optical
// - No blur
// - No glow
// - No shadows
// - Offset: 4px right, 4px down
// - Pressed State: Foreground moves to cover the offset
// - Transition ≤ 120ms
// ❌ No floating elements
// ❌ No z-axis illusions
// ❌ Never use React Native's `elevation` prop (Android creates unwanted shadows)

// ============================================================================
// 4. MOTION TOKENS
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
// 5. HAPTICS RULES
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
// 6. TYPOGRAPHY RULES (No Exceptions)
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
// 7. ICONOGRAPHY
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
// 8. SPACING SYSTEM
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

export type ColorKey = keyof typeof Colors;
export type BorderRadius = keyof typeof Borders.radius;
export type MotionDuration = keyof typeof Motion.duration;
export type SpacingKey = keyof typeof Spacing;

