const { withProjectBuildGradle } = require("@expo/config-plugins");

/**
 * Expo config plugin to add Notifee's local Maven repository to build.gradle
 * This ensures the repository is added every time expo prebuild runs
 */
module.exports = function withNotifeeMavenRepo(config) {
  return withProjectBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;

    // Check if the notifee repository is already added
    if (buildGradle.includes("@notifee/react-native/android/libs")) {
      return config;
    }

    // Find the allprojects.repositories block and add the notifee repository
    const repositoriesPattern = /(allprojects\s*\{[\s\S]*?repositories\s*\{)/;
    const match = buildGradle.match(repositoriesPattern);

    if (match) {
      const notifeeRepo = `
    // Notifee local Maven repository
    def notifeeLibsDir = new File(rootDir, "../node_modules/@notifee/react-native/android/libs")
    if (notifeeLibsDir.exists()) {
      maven { url notifeeLibsDir.absolutePath }
    }`;

      config.modResults.contents = buildGradle.replace(
        match[1],
        match[1] + notifeeRepo
      );
    }

    return config;
  });
};
