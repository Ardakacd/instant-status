/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  displayName: "Instant Status Widget",
  icon: "https://github.com/expo.png",
  bundleIdentifier: "com.arda.instantstatus.dev.widget",
  entitlements: {
    "com.apple.security.application-groups": [
      "group.com.arda.instantstatus.dev",
    ],
  },
});
