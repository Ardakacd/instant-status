/** Shared constants and utilities used by both widget-task-handler and WidgetConfigurationScreen. */

/** After changing these, run `npm run generate:widget-keys` to refresh iOS `WidgetStorageKeys.generated.swift`. */
export const WIDGET_DATA_KEY = "widget_status_data";
export const WIDGET_CONFIG_KEY_PREFIX = "widget_config_";
export const WIDGET_CONFIG_BACKGROUND_PREFIX = "widget_config_background_";
export const IS_PREMIUM_KEY = "is_premium";
/** Set to "true" on logout so the NSE won't re-populate widget data from stale pushes. Cleared on login. */
export const WIDGET_LOGGED_OUT_KEY = "widget_logged_out";
