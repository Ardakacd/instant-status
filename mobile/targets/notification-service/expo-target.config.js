const { resolveFromEnv } = require("../../app-group.shared");

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "notification-service",
  displayName: "Instant Status Notifications",
  bundleIdentifier: "com.arda.instantstatusapp.notification-service",
  deploymentTarget: "17.0",
  entitlements: {
    "com.apple.security.application-groups": [resolveFromEnv()],
  },
});
