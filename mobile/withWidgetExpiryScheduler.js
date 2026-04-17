const fs = require("fs");
const path = require("path");
const { withAppBuildGradle, withMainApplication, withDangerousMod } = require("@expo/config-plugins");

// ---------------------------------------------------------------------------
// 1. Add WorkManager dependency to android/app/build.gradle
// ---------------------------------------------------------------------------
function addWorkManagerDep(config) {
  return withAppBuildGradle(config, (mod) => {
    const dep = `    implementation("androidx.work:work-runtime-ktx:2.9.0")`;
    if (!mod.modResults.contents.includes("work-runtime-ktx")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n${dep}`
      );
    }
    return mod;
  });
}

// ---------------------------------------------------------------------------
// 2. Write the three Kotlin source files
// ---------------------------------------------------------------------------
function writeKotlinFiles(config) {
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const pkg = mod.modRequest.projectRoot;
      const androidPackage = mod.android?.package ?? "com.arda.instantstatusapp";
      const packagePath = androidPackage.replace(/\./g, "/");
      const srcDir = path.join(
        pkg,
        "android",
        "app",
        "src",
        "main",
        "java",
        packagePath
      );
      fs.mkdirSync(srcDir, { recursive: true });

      // WidgetExpiryWorker.kt
      fs.writeFileSync(
        path.join(srcDir, "WidgetExpiryWorker.kt"),
        `package ${androidPackage}

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import androidx.work.Worker
import androidx.work.WorkerParameters
import android.content.Context

/**
 * WorkManager worker that fires a widget update broadcast when a friend's status expires.
 * Sends ACTION_APPWIDGET_UPDATE to the widget receiver, which triggers widgetTaskHandler
 * via react-native-android-widget's onUpdate() — same path as requestWidgetUpdate().
 */
class WidgetExpiryWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        return try {
            val appWidgetManager = AppWidgetManager.getInstance(applicationContext)
            val componentName = ComponentName(
                applicationContext,
                "${androidPackage}.widget.InstantStatusWidget"
            )
            val appWidgetIds = appWidgetManager.getAppWidgetIds(componentName)

            if (appWidgetIds.isNotEmpty()) {
                val intent = Intent(applicationContext, Class.forName("${androidPackage}.widget.InstantStatusWidget"))
                intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, appWidgetIds)
                applicationContext.sendBroadcast(intent)
            }

            Result.success()
        } catch (e: Exception) {
            Result.failure()
        }
    }
}
`,
        "utf8"
      );

      // WidgetExpiryModule.kt
      fs.writeFileSync(
        path.join(srcDir, "WidgetExpiryModule.kt"),
        `package ${androidPackage}

import androidx.work.*
import com.facebook.react.bridge.*
import java.util.concurrent.TimeUnit

/**
 * React Native native module that schedules/cancels WorkManager one-shot tasks
 * to trigger a widget update when a friend's status expires.
 */
class WidgetExpiryModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "WidgetExpiryScheduler"

    @ReactMethod
    fun schedule(userId: String, expiresAtMs: Double) {
        val delayMs = expiresAtMs.toLong() - System.currentTimeMillis()
        if (delayMs <= 0) return

        val request = OneTimeWorkRequestBuilder<WidgetExpiryWorker>()
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .addTag(tag(userId))
            .build()

        WorkManager.getInstance(reactApplicationContext).enqueueUniqueWork(
            tag(userId),
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    @ReactMethod
    fun cancel(userId: String) {
        WorkManager.getInstance(reactApplicationContext).cancelUniqueWork(tag(userId))
    }

    private fun tag(userId: String) = "widget_expiry_\$userId"
}
`,
        "utf8"
      );

      // WidgetExpiryPackage.kt
      fs.writeFileSync(
        path.join(srcDir, "WidgetExpiryPackage.kt"),
        `package ${androidPackage}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class WidgetExpiryPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(WidgetExpiryModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
`,
        "utf8"
      );

      return mod;
    },
  ]);
}

// ---------------------------------------------------------------------------
// 3. Register WidgetExpiryPackage in MainApplication.kt
// ---------------------------------------------------------------------------
function registerPackage(config) {
  return withMainApplication(config, (mod) => {
    const src = mod.modResults.contents;
    const marker = "PackageList(this).packages.apply {";
    const injection = "add(WidgetExpiryPackage())";

    if (src.includes(injection)) return mod; // already added

    mod.modResults.contents = src.replace(
      marker,
      `${marker}\n              ${injection}`
    );
    return mod;
  });
}

// ---------------------------------------------------------------------------
// Compose all three modifications
// ---------------------------------------------------------------------------
function withWidgetExpiryScheduler(config) {
  config = addWorkManagerDep(config);
  config = writeKotlinFiles(config);
  config = registerPackage(config);
  return config;
}

module.exports = withWidgetExpiryScheduler;
