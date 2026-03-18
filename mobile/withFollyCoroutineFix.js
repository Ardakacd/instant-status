const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin to fix folly/coro/Coroutine.h file not found (RN 0.74+)
 * Injects FOLLY_CFG_NO_COROUTINES=1 into the Podfile post_install.
 * Runs during prebuild so the fix persists when Podfile is regenerated.
 */
function withFollyCoroutineFix(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      if (!fs.existsSync(podfilePath)) {
        return config;
      }
      let contents = fs.readFileSync(podfilePath, "utf-8");

      if (contents.includes("FOLLY_CFG_NO_COROUTINES")) {
        return config;
      }

      const follyFix = `
    # Fix: folly/coro/Coroutine.h file not found (RN 0.74+)
    installer.pods_project.build_configurations.each do |config|
      config.build_settings['OTHER_CPLUSPLUSFLAGS'] ||= ['$(OTHER_CFLAGS)']
      config.build_settings['OTHER_CPLUSPLUSFLAGS'] << '-DFOLLY_CFG_NO_COROUTINES=1'
    end`;

      // Inject after react_native_post_install(...) - match full call (inner ) in podfile_properties, then outer )
      const postInstallRegex = /(react_native_post_install\(\s*installer,\s*config\[:reactNativePath\],[\s\S]*?\),\s*\)\s*)/m;
      if (postInstallRegex.test(contents)) {
        contents = contents.replace(
          postInstallRegex,
          `$1${follyFix}\n`
        );
        fs.writeFileSync(podfilePath, contents);
      }
      return config;
    },
  ]);
}

module.exports = withFollyCoroutineFix;
