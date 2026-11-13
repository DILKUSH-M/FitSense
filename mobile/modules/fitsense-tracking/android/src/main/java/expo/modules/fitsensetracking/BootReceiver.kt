package expo.modules.fitsensetracking

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.tasks.Tasks
import java.util.concurrent.TimeUnit

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    TrackingStore.disableAutomaticActivityTracking(context)
    try {
      Tasks.await(ActivityTransitions.remove(context), 10, TimeUnit.SECONDS)
    } catch (error: SecurityException) {
      TrackingStore.setSyncError(context, error.message ?: "Android denied disabling activity monitoring after restart.")
    } catch (error: java.util.concurrent.ExecutionException) {
      TrackingStore.setSyncError(context, error.cause?.message ?: error.message)
    } catch (error: java.util.concurrent.TimeoutException) {
      TrackingStore.setSyncError(context, error.message)
    } catch (error: InterruptedException) {
      Thread.currentThread().interrupt()
      TrackingStore.setSyncError(context, error.message)
    }

    val trackingEnabled = false
    val fallbackStepsEnabled = TrackingStore.dailyStepsEnabled(context) && !TrackingStore.healthConnectAvailable(context)
    if (!trackingEnabled && !fallbackStepsEnabled && !TrackingStore.hasPendingWork(context)
      && TrackingStore.currentSession(context) == null) return
    if (trackingEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
      && ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) !=
      PackageManager.PERMISSION_GRANTED) {
      TrackingStore.setStatus(context, "permission_required", "Reopen FitSense to restore activity monitoring after restart.")
    } else if (trackingEnabled) {
      try {
        Tasks.await(ActivityTransitions.request(context), 15, TimeUnit.SECONDS)
        TrackingStore.setStatus(context, "monitoring_enabled")
      } catch (error: SecurityException) {
        TrackingStore.setStatus(context, "permission_required", error.message ?: "Android denied tracking after restart.")
      } catch (error: java.util.concurrent.ExecutionException) {
        TrackingStore.setSyncError(context, error.cause?.message ?: error.message)
      } catch (error: java.util.concurrent.TimeoutException) {
        TrackingStore.setSyncError(context, error.message)
      } catch (error: InterruptedException) {
        Thread.currentThread().interrupt()
        TrackingStore.setSyncError(context, error.message)
      }
    }

    try {
      if (fallbackStepsEnabled) {
        ContextCompat.startForegroundService(context, Intent(context, StepCounterService::class.java))
      }
      val interruptedSession = TrackingStore.currentSession(context)
      if (interruptedSession != null) {
        val start = java.time.Instant.parse(interruptedSession.getString("startedAt")).toEpochMilli()
        val lastActive = interruptedSession.optLong("lastObservedAt", start)
        val stationaryStart = interruptedSession.optLong("stationaryStartedAt", 0L)
        val end = maxOf(start + 1_000L, if (stationaryStart > 0L) stationaryStart else lastActive)
        val duration = (end - start) / 1_000L
        val activityType = interruptedSession.optString("activityType")
        val met = if (activityType == "running") 8.0 else 3.5
        interruptedSession
          .put("status", "completed")
          .put("endedAt", java.time.Instant.ofEpochMilli(end).toString())
          .put("durationSeconds", duration)
          .put("caloriesBurned", met * TrackingStore.weightKg(context) * (duration / 3600.0))
          .remove("stationaryStartedAt")
          .remove("lastObservedAt")
        TrackingStore.enqueueSession(context, interruptedSession)
        TrackingStore.saveCurrentSession(context, null)
      }
      if (trackingEnabled) TrackingStore.setCurrentActivity(context, "unknown")
      ActivityTrackingService.schedulePeriodicSync(context)
      ActivityTrackingService.scheduleSync(context)
    } catch (error: SecurityException) {
      TrackingStore.setStatus(context, "permission_required", error.message ?: "Android denied tracking after restart.")
    } catch (error: android.app.ForegroundServiceStartNotAllowedException) {
      TrackingStore.setStatus(context, "permission_required", error.message ?: "Android restricted restarting tracking.")
    }
  }
}
