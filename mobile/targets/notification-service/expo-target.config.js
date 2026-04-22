const { resolveFromEnv } = require("../../app-group.shared");

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "notification-service",
  displayName: "Instant Status Notifications",
  bundleIdentifier: "com.arda.instantstatusapp.notification-service",
  entitlements: {
    "com.apple.security.application-groups": [resolveFromEnv()],
  },
});
