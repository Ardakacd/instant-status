/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  displayName: "Instant Status Widget",
  icon: "../../assets/icon.png",
  bundleIdentifier: "com.arda.instantstatus.dev.widget",
  entitlements: {
    "com.apple.security.application-groups": [
      "group.com.arda.instantstatus.dev",
    ],
  },
  // Exclude Firebase frameworks from widget extension since it doesn't use Firebase
  // Widget only reads from App Group storage (UserDefaults)
  buildSettings: {
    OTHER_LDFLAGS: [
      "$(inherited)",
      "-weak_framework FirebaseCore",
      "-weak_framework FirebaseMessaging",
    ],
  },
});
