const { withAppDelegate } = require("@expo/config-plugins");
const {
  mergeContents,
} = require("@expo/config-plugins/build/utils/generateCode");
const { resolveForPlugin } = require("./app-group.shared");

const TAG_IMPORT = "instant-status-widgetkit-import";
const TAG_METHOD = "instant-status-widget-reload-background";
/** Keep in sync with `targets/widget/widgets.swift` InstantStatusWidget.kind */
const WIDGET_KIND = "InstantStatusWidget";
/** Keep in sync with `android-widget/widget-shared.ts` WIDGET_PENDING_TIMELINE_RELOAD_KEY */
const PENDING_RELOAD_KEY = "widget_pending_timeline_reload";

/**
 * If JS marked widget data dirty (debounce may not fire before suspend), reload that
 * widget kind only — not reloadAllTimelines (saves WidgetKit budget).
 *
 * When `ExtensionStorage.reloadWidget` already ran, JS clears the pending flag.
 */
function withWidgetReloadOnBackground(config) {
  const IOS_APP_GROUP = resolveForPlugin(config);

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
        `    if let suite = UserDefaults(suiteName: "${IOS_APP_GROUP}") {`,
        `      if suite.string(forKey: "${PENDING_RELOAD_KEY}") == "1" {`,
        `        WidgetCenter.shared.reloadTimelines(ofKind: "${WIDGET_KIND}")`,
        `        suite.removeObject(forKey: "${PENDING_RELOAD_KEY}")`,
        "      }",
        "    }",
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
