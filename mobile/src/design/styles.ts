import { Colors } from './tokens';

/**
 * Color Contrast Helper
 *
 * Returns white text for dark backgrounds and charcoal for light backgrounds.
 * Uses the YIQ color space formula for accurate contrast calculation.
 */
export const getContrastingTextColor = (hexColor: string): string => {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? Colors.text.primary : Colors.canvas.background;
};
