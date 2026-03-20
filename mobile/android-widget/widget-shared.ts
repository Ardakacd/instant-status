/** Shared constants and utilities used by both widget-task-handler and WidgetConfigurationScreen. */

export const WIDGET_DATA_KEY = "widget_status_data";
export const WIDGET_CONFIG_KEY_PREFIX = "widget_config_";
export const WIDGET_CONFIG_BACKGROUND_PREFIX = "widget_config_background_";
export const IS_PREMIUM_KEY = "is_premium";

/**
 * Map widget dimensions (dp) to layout size, matching iOS small/medium/large.
 * Uses width ranges — launchers vary, so we use conservative boundaries.
 */
export function getWidgetLayout(
  width: number,
  height: number
): "small" | "medium" | "large" {
  const minDim = Math.min(width, height);
  if (width < 200 || minDim < 140) return "small"; // ~2 cells
  if (width < 350 && height < 280) return "medium"; // ~4x2
  return "large";
}
