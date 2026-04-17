/**
 * iOS App Group for main app + widget extension (UserDefaults suite).
 * Set EXPO_PUBLIC_IOS_APP_GROUP for production EAS builds; must match Xcode / Apple Developer identifier.
 */
const DEFAULT_IOS_APP_GROUP = "group.com.arda.instantstatusapp";

function resolveFromEnv() {
  return process.env.EXPO_PUBLIC_IOS_APP_GROUP || DEFAULT_IOS_APP_GROUP;
}

/** Prefer merged app.config extra (set in app.config.js) when plugins run after merge. */
function resolveForPlugin(config) {
  return config?.extra?.iosAppGroup || resolveFromEnv();
}

module.exports = {
  DEFAULT_IOS_APP_GROUP,
  resolveFromEnv,
  resolveForPlugin,
};
