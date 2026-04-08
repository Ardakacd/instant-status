/** Shared constants and utilities used by both widget-task-handler and WidgetConfigurationScreen. */

/** After changing these two, run `npm run generate:widget-keys` to refresh iOS `WidgetStorageKeys.generated.swift`. */
export const WIDGET_DATA_KEY = "widget_status_data";
/** iOS: set when widget JSON/premium changed; AppDelegate reloads timeline on background only if still set. Saves WidgetKit reload budget. */
export const WIDGET_PENDING_TIMELINE_RELOAD_KEY = "widget_pending_timeline_reload";
export const WIDGET_CONFIG_KEY_PREFIX = "widget_config_";
export const WIDGET_CONFIG_BACKGROUND_PREFIX = "widget_config_background_";
export const IS_PREMIUM_KEY = "is_premium";

export const WIDGET_COL_OPTIONS = [1, 2, 3] as const;
export const WIDGET_ROW_OPTIONS = [3, 5, 8] as const;
export type WidgetColCount = typeof WIDGET_COL_OPTIONS[number];
export type WidgetRowCount = typeof WIDGET_ROW_OPTIONS[number];

/**
 * Map widget dimensions (dp) to layout size, matching iOS small/medium/large.
 * Uses width ranges — launchers vary, so we use conservative boundaries.
 */
export function getWidgetLayout(
  width: number,
  height: number
): "small" | "medium" | "large" {
  // Columns are driven by width only; height is irrelevant to column count.
  // Thresholds based on minimum comfortable column widths:
  //   3-col needs ~250dp  (3 × ~80dp per cell)
  //   2-col needs ~180dp  (2 × ~80dp per cell)
  if (width < 180) return "small";
  if (width < 250) return "medium";
  return "large";
}
