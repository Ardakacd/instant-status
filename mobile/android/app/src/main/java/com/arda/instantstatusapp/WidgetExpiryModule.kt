package com.arda.instantstatusapp

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

    private fun tag(userId: String) = "widget_expiry_$userId"
}
