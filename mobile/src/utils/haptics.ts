/**
 * Global Haptic Feedback Utility
 * 
 * Standardizes haptic feedback throughout the app for a "Premium Calm" feel.
 * 
 * Types:
 * - Light (Success): For switching colors or emojis, successful selections
 * - Medium (Action): For "Set Status" or "Send" - primary actions
 * - Heavy (Destructive): For "Delete" or "Clear" - destructive actions
 * 
 * Rules:
 * - Haptics are rare and meaningful
 * - Use sparingly to maintain the "Calm" design pillar
 * - Never use for navigation, toggles, scrolling, or sign-up
 */

import * as Haptics from 'expo-haptics';

/**
 * Light haptic feedback
 * 
 * Use for:
 * - Switching colors or emojis
 * - Successful selections
 * - Subtle confirmations
 */
export const hapticSuccess = (): void => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

/**
 * Medium haptic feedback
 * 
 * Use for:
 * - "Set Status" actions
 * - "Send" actions
 * - Primary confirmations
 * - Important actions that commit something
 */
export const hapticAction = (): void => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

/**
 * Heavy haptic feedback
 * 
 * Use for:
 * - "Delete" actions
 * - "Clear" actions
 * - Destructive confirmations
 * - Actions that remove or destroy data
 */
export const hapticDestructive = (): void => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};

/**
 * Selection haptic feedback (alias for Light)
 * 
 * Use for:
 * - Selecting items from lists
 * - Picker selections
 * - Toggle selections
 */
export const hapticSelection = hapticSuccess;

