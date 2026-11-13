package expo.modules.fitsensetracking

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.tasks.Tasks
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class FitSenseTrackingModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FitSenseTracking")

    AsyncFunction("configure") {
      preferences: Map<String, Any?>,
      apiBaseUrl: String,
      token: String,
      accountId: String,
      weightKg: Double,
      healthConnectAvailable: Boolean,
      healthConnectBackgroundRead: Boolean,
      ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      val storedPreferences = JSONObject(preferences)
        .put("enabled", false)
        .put("paused", false)
        .put("storeRoute", false)
        .put("weightKg", weightKg)
      TrackingStore.saveConfiguration(
        context,
        storedPreferences,
        apiBaseUrl,
        token,
        accountId,
        weightKg,
        healthConnectAvailable,
        healthConnectBackgroundRead,
      )

      val enabled = TrackingStore.trackingEnabled(context)
      val paused = TrackingStore.trackingPaused(context)
      if (!enabled || paused) {
        stopActivityTransitions(context)
        TrackingStore.clearCandidate(context)
        if (TrackingStore.currentSession(context) != null) {
          val stopIntent = Intent(context, ActivityTrackingService::class.java)
            .setAction(ActivityTrackingService.ACTION_STOP)
          try {
            context.startService(stopIntent)
          } catch (_: IllegalStateException) {
            TrackingStore.setStatus(context, "permission_required", "Reopen FitSense to safely finish the active session.")
          }
        } else {
          context.stopService(Intent(context, ActivityTrackingService::class.java))
          TrackingStore.setStatus(context, if (enabled && paused) "tracking_paused" else "disabled")
        }
      } else {
        val recognitionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
          || ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) ==
          PackageManager.PERMISSION_GRANTED
        if (!recognitionGranted) {
          TrackingStore.setStatus(
            context,
            "permission_required",
            "Allow physical activity access before FitSense can monitor walking or running.",
          )
        } else {
          Tasks.await(ActivityTransitions.request(context), 20, TimeUnit.SECONDS)
          val fineLocationGranted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION,
          ) == PackageManager.PERMISSION_GRANTED
          val backgroundLocationGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
          val notificationsGranted = Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
          if (!fineLocationGranted || !backgroundLocationGranted || !notificationsGranted) {
            val reason = when {
              !fineLocationGranted -> "Location permission is required for GPS distance."
              !backgroundLocationGranted -> "Allow location access all the time to start GPS after a background activity transition."
              else -> "Allow notifications so Android can show the persistent activity-tracking notification."
            }
            TrackingStore.setStatus(context, "permission_required", reason)
          } else {
            TrackingStore.setStatus(context, "monitoring_enabled")
          }
        }
      }
      configureFallbackSteps(context)
      ActivityTrackingService.scheduleSync(context)
      ActivityTrackingService.schedulePeriodicSync(context)
      statusWithSyncError(context)
    }

    AsyncFunction("getStatus") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      statusWithSyncError(context)
    }

    AsyncFunction("getPendingSessions") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      TrackingStore.pendingSessions(context)
    }

    AsyncFunction("acknowledgeSession") { clientSessionId: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      TrackingStore.acknowledgeSession(context, clientSessionId)
    }

    AsyncFunction("getFallbackSteps") { dayKey: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      TrackingStore.fallbackSteps(context, dayKey)
    }
  }

  private fun configureFallbackSteps(context: Context) {
    if (!TrackingStore.dailyStepsEnabled(context) || TrackingStore.healthConnectAvailable(context)) {
      context.stopService(Intent(context, StepCounterService::class.java))
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
      && ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) !=
      PackageManager.PERMISSION_GRANTED) {
      TrackingStore.setStatus(context, "permission_required", "Allow physical activity access to use the device step-counter fallback.")
      return
    }
    if (Build.VERSION.SDK_INT >= 33
      && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED) {
      TrackingStore.setStatus(context, "permission_required", "Allow notifications to use the device step-counter foreground service.")
      return
    }
    try {
      ContextCompat.startForegroundService(context, Intent(context, StepCounterService::class.java))
    } catch (error: SecurityException) {
      TrackingStore.setStatus(context, "permission_required", error.message ?: "Android denied the step-counter foreground service.")
    } catch (error: android.app.ForegroundServiceStartNotAllowedException) {
      TrackingStore.setStatus(context, "permission_required", error.message ?: "Android restricted starting the step-counter service.")
    }
  }

  private fun stopActivityTransitions(context: Context) {
    try {
      Tasks.await(ActivityTransitions.remove(context), 10, TimeUnit.SECONDS)
    } catch (error: SecurityException) {
      TrackingStore.setStatus(context, "permission_required", error.message ?: "Activity transitions could not be disabled.")
    } catch (error: java.util.concurrent.ExecutionException) {
      TrackingStore.setSyncError(context, error.cause?.message ?: error.message)
    } catch (error: java.util.concurrent.TimeoutException) {
      TrackingStore.setSyncError(context, error.message)
    } catch (error: InterruptedException) {
      Thread.currentThread().interrupt()
      TrackingStore.setSyncError(context, error.message)
    }
  }

  private fun statusWithSyncError(context: Context): Map<String, Any?> {
    val status = TrackingStore.status(context).toMutableMap()
    TrackingStore.syncError(context)?.let { status["syncError"] = it }
    return status
  }
}
