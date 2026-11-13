package expo.modules.fitsensetracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionEvent
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

internal object ActivityTransitions {
  fun request(context: Context) = ActivityRecognition.getClient(context)
    .requestActivityTransitionUpdates(
      com.google.android.gms.location.ActivityTransitionRequest(
        listOf(
          DetectedActivity.WALKING,
          DetectedActivity.RUNNING,
          DetectedActivity.ON_BICYCLE,
          DetectedActivity.IN_VEHICLE,
          DetectedActivity.STILL,
        ).flatMap { activityType ->
          listOf(
            ActivityTransition.Builder()
              .setActivityType(activityType)
              .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
              .build(),
            ActivityTransition.Builder()
              .setActivityType(activityType)
              .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
              .build(),
          )
        },
      ),
      transitionPendingIntent(context),
    )

  fun remove(context: Context) = ActivityRecognition.getClient(context)
    .removeActivityTransitionUpdates(transitionPendingIntent(context))

  private fun transitionPendingIntent(context: Context) = android.app.PendingIntent.getBroadcast(
    context,
    817,
    Intent(context, ActivityTransitionReceiver::class.java),
    android.app.PendingIntent.FLAG_UPDATE_CURRENT
      or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) android.app.PendingIntent.FLAG_MUTABLE else 0,
  )
}

class ActivityTransitionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) return
    if (!TrackingStore.trackingEnabled(context) || TrackingStore.trackingPaused(context)) return

    val result = ActivityTransitionResult.extractResult(intent) ?: return
    result.transitionEvents.forEach { event ->
      processEvent(context, event)
    }
  }

  private fun processEvent(context: Context, event: ActivityTransitionEvent) {
    val activityType = when (event.activityType) {
      DetectedActivity.WALKING -> "walking"
      DetectedActivity.RUNNING -> "running"
      DetectedActivity.ON_BICYCLE -> "on_bicycle"
      DetectedActivity.IN_VEHICLE -> "in_vehicle"
      DetectedActivity.STILL -> "still"
      else -> return
    }
    val eventTime = System.currentTimeMillis() - (
      (SystemClock.elapsedRealtimeNanos() - event.elapsedRealTimeNanos) / 1_000_000L
    ).coerceAtLeast(0L)
    val isEnter = event.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER
    if (isEnter) TrackingStore.setCurrentActivity(context, activityType)
    else if (TrackingStore.currentActivity(context) == activityType) TrackingStore.setCurrentActivity(context, "unknown")

    val sessionActive = TrackingStore.currentSession(context) != null
    if (isEnter && activityType == "still" && !sessionActive) {
      TrackingStore.clearCandidate(context)
      TrackingStore.setStatus(context, "stationary")
      return
    }
    if (isEnter && activityType in listOf("on_bicycle", "in_vehicle") && !sessionActive) {
      TrackingStore.clearCandidate(context)
      TrackingStore.setStatus(context, "monitoring_enabled", "Vehicle and bicycle movement are not counted as walking.")
      return
    }
    if (isEnter && activityType in listOf("walking", "running")) {
      TrackingStore.setCandidate(context, activityType, eventTime)
      startService(context, activityType, eventTime, false)
      return
    }
    if (isEnter && activityType == "still" && sessionActive) {
      startService(context, activityType, eventTime, true)
      return
    }
    if (isEnter && activityType in listOf("on_bicycle", "in_vehicle") && sessionActive) {
      startService(context, activityType, eventTime, true)
      return
    }
    if (!isEnter && activityType in listOf("walking", "running") && !sessionActive) {
      val action = Intent(context, ActivityTrackingService::class.java)
        .setAction(ActivityTrackingService.ACTION_CANCEL_CANDIDATE)
        .putExtra(ActivityTrackingService.EXTRA_ACTIVITY_TYPE, activityType)
      startServiceSafely(context, action)
    }
  }

  private fun startService(context: Context, activityType: String, eventTime: Long, shouldEnd: Boolean) {
    val action = Intent(context, ActivityTrackingService::class.java)
      .setAction(ActivityTrackingService.ACTION_TRANSITION)
      .putExtra(ActivityTrackingService.EXTRA_ACTIVITY_TYPE, activityType)
      .putExtra(ActivityTrackingService.EXTRA_EVENT_TIME, eventTime)
      .putExtra(ActivityTrackingService.EXTRA_SHOULD_END, shouldEnd)
    startServiceSafely(context, action)
  }

  private fun startServiceSafely(context: Context, intent: Intent) {
    try {
      androidx.core.content.ContextCompat.startForegroundService(context, intent)
    } catch (error: SecurityException) {
      TrackingStore.setStatus(context, "permission_required", error.message ?: "Android denied background activity tracking.")
    } catch (error: android.app.ForegroundServiceStartNotAllowedException) {
      TrackingStore.setStatus(context, "permission_required", error.message ?: "Android restricted starting the tracking service.")
    }
  }
}
