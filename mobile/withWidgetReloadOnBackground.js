const { withAppDelegate } = require("@expo/config-plugins");
const {
  mergeContents,
} = require("@expo/config-plugins/build/utils/generateCode");

const TAG_IMPORT = "instant-status-widgetkit-import";
const TAG_METHOD = "instant-status-widget-reload-background";

/**
 * Reload WidgetKit timelines when the app enters background so debounced JS reload
 * (setTimeout) is not lost if the runtime suspends before the timer fires.
 * Data is already written to the App Group synchronously from JS.
 */
function withWidgetReloadOnBackground(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== "swift") {
      return config;
    }

    let { contents } = config.modResults;

    const importMerge = mergeContents({
      src: contents,
      newSrc: "import WidgetKit",
      tag: TAG_IMPORT,
      anchor: /^import ReactAppDependencyProvider$/,
      offset: 1,
      comment: "//",
    });
    contents = importMerge.contents;

    const methodMerge = mergeContents({
      src: contents,
      newSrc: [
        "  public override func applicationDidEnterBackground(_ application: UIApplication) {",
        "    WidgetCenter.shared.reloadAllTimelines()",
        "    super.applicationDidEnterBackground(application)",
        "  }",
        "",
      ].join("\n"),
      tag: TAG_METHOD,
      anchor: /^  \/\/ Linking API$/,
      offset: 0,
      comment: "//",
    });
    contents = methodMerge.contents;

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withWidgetReloadOnBackground;
