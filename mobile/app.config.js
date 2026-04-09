const appJson = require("./app.json");
const { resolveFromEnv } = require("./app-group.shared");

const iosAppGroup = resolveFromEnv();

/** @type {{ expo: import('@expo/config').ExpoConfig }} */
module.exports = {
  expo: {
    ...appJson.expo,
    ios: {
      ...appJson.expo.ios,
      entitlements: {
        ...appJson.expo.ios.entitlements,
        "com.apple.security.application-groups": [iosAppGroup],
      },
    },
    extra: {
      ...(appJson.expo.extra || {}),
      iosAppGroup,
    },
    plugins: ["./withIosAppGroup.js", "./withWidgetExpiryScheduler.js", ...(appJson.expo.plugins || [])],
  },
};
