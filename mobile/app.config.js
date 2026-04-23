const appJson = require("./app.json");
const { resolveFromEnv } = require("./app-group.shared");

const iosAppGroup = resolveFromEnv();
const isProd = process.env.EXPO_PUBLIC_APP_ENVIRONMENT === "production";
const apsEnvironment = isProd ? "production" : "development";

/** @type {{ expo: import('@expo/config').ExpoConfig }} */
module.exports = {
  expo: {
    ...appJson.expo,
    ios: {
      ...appJson.expo.ios,
      entitlements: {
        ...appJson.expo.ios.entitlements,
        "aps-environment": apsEnvironment,
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
