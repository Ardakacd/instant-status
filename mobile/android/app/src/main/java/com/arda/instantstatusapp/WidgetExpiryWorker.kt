package com.arda.instantstatusapp

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
                "com.arda.instantstatusapp.widget.InstantStatusWidget"
            )
            val appWidgetIds = appWidgetManager.getAppWidgetIds(componentName)

            if (appWidgetIds.isNotEmpty()) {
                val intent = Intent(applicationContext, Class.forName("com.arda.instantstatusapp.widget.InstantStatusWidget"))
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
