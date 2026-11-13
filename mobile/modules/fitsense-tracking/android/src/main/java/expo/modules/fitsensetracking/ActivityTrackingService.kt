package expo.modules.fitsensetracking

import android.Manifest
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.max

class ActivityTrackingService : Service(), LocationListener {
  private val handler = Handler(Looper.getMainLooper())
  private var locationManager: LocationManager? = null
  private var lastAcceptedLocation: Location? = null
  private var stationaryStartedAt = 0L
  private var locationActive = false
  private var validationRunnable: Runnable? = null
  private var stationaryRunnable: Runnable? = null
  private var candidateIsResume = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    TrackingNotifications.createChannel(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!TrackingStore.trackingEnabled(this) || TrackingStore.trackingPaused(this)) {
      finishSession(System.currentTimeMillis())
      stopSelf()
      return START_NOT_STICKY
    }

    if (!startForegroundSafely("Monitoring activity. GPS starts only after a sustained walk or run.", false)) {
      return START_NOT_STICKY
    }
    when (intent?.action) {
      ACTION_TRANSITION -> handleTransition(
        intent.getStringExtra(EXTRA_ACTIVITY_TYPE) ?: "unknown",
        intent.getLongExtra(EXTRA_EVENT_TIME, System.currentTimeMillis()),
      )
      ACTION_CANCEL_CANDIDATE -> cancelCandidate()
      ACTION_STOP -> {
        finishSession(System.currentTimeMillis())
        stopSelf()
      }
      ACTION_RECOVER -> recoverSession()
      else -> recoverSession()
    }
    return START_STICKY
  }

  private fun handleTransition(activityType: String, eventTime: Long) {
    when (activityType) {
      "walking", "running" -> {
        stationaryRunnable?.let(handler::removeCallbacks)
        stationaryRunnable = null
        stationaryStartedAt = 0L
        val current = TrackingStore.currentSession(this)
        candidateIsResume = current != null
        current?.put("lastObservedAt", eventTime)?.let { TrackingStore.saveCurrentSession(this, it) }
        TrackingStore.setCandidate(this, activityType, eventTime)
        TrackingStore.setStatus(this, "walking_detected", "Confirming sustained $activityType before starting GPS.", activityType)
        updateNotification("Confirming sustained $activityType. Location has not started yet.")
        scheduleValidation()
      }
      "still" -> {
        TrackingStore.clearCandidate(this)
        val session = TrackingStore.currentSession(this)
        if (session == null) {
          TrackingStore.setStatus(this, "stationary")
          stopSelfIfNoFallbackSteps()
          return
        }
        stationaryStartedAt = eventTime
        session.put("stationaryStartedAt", eventTime)
        session.put("lastObservedAt", eventTime)
        TrackingStore.saveCurrentSession(this, session)
        stopLocationUpdates()
        TrackingStore.setStatus(this, "stationary", "GPS paused while you are stationary.", session.optString("activityType"))
        updateNotification("Stationary. GPS is paused while FitSense waits to end the session.")
        scheduleStationaryEnd(session.optString("clientSessionId"))
      }
      "on_bicycle", "in_vehicle" -> {
        TrackingStore.clearCandidate(this)
        stationaryRunnable?.let(handler::removeCallbacks)
        stopLocationUpdates()
        finishSession(eventTime)
        stopSelfIfNoFallbackSteps()
      }
    }
  }

  private fun scheduleValidation() {
    validationRunnable?.let(handler::removeCallbacks)
    val expectedType = TrackingStore.candidateType(this)
    val expectedStart = TrackingStore.candidateStart(this)
    if (expectedStart <= 0L) {
      cancelCandidate()
      return
    }
    validationRunnable = Runnable {
      if (!TrackingStore.trackingEnabled(this) || TrackingStore.trackingPaused(this)) return@Runnable
      if (TrackingStore.currentActivity(this) != expectedType || expectedType !in listOf("walking", "running")) {
        cancelCandidate()
        return@Runnable
      }
      val existing = TrackingStore.currentSession(this)
      if (candidateIsResume && existing != null) {
        existing.remove("stationaryStartedAt")
        TrackingStore.saveCurrentSession(this, existing)
        startLocationUpdates()
      } else if (existing == null) {
        createSession(expectedType, expectedStart)
        startLocationUpdates()
      }
      TrackingStore.clearCandidate(this)
    }
    val elapsed = (System.currentTimeMillis() - expectedStart).coerceAtLeast(0L)
    handler.postDelayed(validationRunnable!!, (SUSTAINED_ACTIVITY_MILLIS - elapsed).coerceAtLeast(0L))
  }

  private fun createSession(activityType: String, startTime: Long) {
    val session = JSONObject()
      .put("clientSessionId", UUID.randomUUID().toString())
      .put("activityType", activityType)
      .put("status", "active")
      .put("startedAt", java.time.Instant.ofEpochMilli(startTime).toString())
      .put("distanceMeters", 0.0)
      .put("averagePaceSecondsPerKm", 0.0)
      .put("caloriesBurned", 0.0)
      .put("route", JSONArray())
    TrackingStore.saveCurrentSession(this, session)
  }

  private fun scheduleStationaryEnd(
    clientSessionId: String,
    delayMillis: Long = TrackingStore.stationaryEndMinutes(this) * 60_000L,
  ) {
    stationaryRunnable?.let(handler::removeCallbacks)
    stationaryRunnable = Runnable {
      val session = TrackingStore.currentSession(this)
      if (session?.optString("clientSessionId") == clientSessionId
        && TrackingStore.currentActivity(this) == "still"
        && stationaryStartedAt > 0L) {
        finishSession(stationaryStartedAt)
        stopSelfIfNoFallbackSteps()
      }
    }
    handler.postDelayed(stationaryRunnable!!, delayMillis.coerceAtLeast(0L))
  }

  private fun cancelCandidate() {
    validationRunnable?.let(handler::removeCallbacks)
    validationRunnable = null
    TrackingStore.clearCandidate(this)
    if (TrackingStore.currentSession(this) == null) {
      TrackingStore.setStatus(this, "monitoring_enabled")
      stopSelfIfNoFallbackSteps()
    }
  }

  private fun recoverSession() {
    val session = TrackingStore.currentSession(this)
    if (session?.has("stationaryStartedAt") == true) {
      stationaryStartedAt = session.optLong("stationaryStartedAt")
      stopLocationUpdates()
      val stationaryLimit = TrackingStore.stationaryEndMinutes(this) * 60_000L
      val stationaryElapsed = (System.currentTimeMillis() - stationaryStartedAt).coerceAtLeast(0L)
      if (stationaryElapsed >= stationaryLimit) {
        finishSession(stationaryStartedAt)
        stopSelfIfNoFallbackSteps()
      } else {
        scheduleStationaryEnd(
          session.optString("clientSessionId"),
          stationaryLimit - stationaryElapsed,
        )
      }
    } else if (session != null) {
      startLocationUpdates()
    } else {
      val candidateType = TrackingStore.candidateType(this)
      if (candidateType in listOf("walking", "running")
        && TrackingStore.currentActivity(this) == candidateType) {
        candidateIsResume = false
        scheduleValidation()
      } else {
        TrackingStore.clearCandidate(this)
        TrackingStore.setStatus(this, "monitoring_enabled")
        stopSelf()
      }
    }
  }

  private fun startLocationUpdates() {
    val fineGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED
    val backgroundGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
      || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
      PackageManager.PERMISSION_GRANTED
    val notificationsGranted = Build.VERSION.SDK_INT < 33
      || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
    if (!fineGranted || !backgroundGranted) {
      val reason = if (!fineGranted) {
        "Location permission is required for GPS distance."
      } else {
        "Allow FitSense location access all the time to start GPS while the app is in the background."
      }
      TrackingStore.setStatus(this, "permission_required", reason)
      updateNotification(reason)
      return
    }
    if (!notificationsGranted) {
      val reason = "Allow notifications so Android can display the persistent GPS tracking notification."
      TrackingStore.setStatus(this, "permission_required", reason)
      updateNotification(reason)
      return
    }

    val manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    if (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
      TrackingStore.setStatus(this, "permission_required", "Turn on device location to record a GPS route.")
      updateNotification("Device location is off. Activity time will continue without GPS.")
      return
    }
    locationManager = manager
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(
          TrackingNotifications.notificationId(),
          TrackingNotifications.build(this, "GPS tracking active for a confirmed activity."),
          TrackingNotifications.foregroundType(true),
        )
      }
      manager.requestLocationUpdates(
        LocationManager.GPS_PROVIDER,
        LOCATION_INTERVAL_MILLIS,
        LOCATION_MIN_DISTANCE_METERS,
        this,
        Looper.getMainLooper(),
      )
      locationActive = true
      TrackingStore.setStatus(
        this,
        "gps_tracking_active",
        "GPS tracking is active for this confirmed activity.",
        TrackingStore.currentSession(this)?.optString("activityType"),
      )
      updateNotification("GPS tracking active for your confirmed activity.")
    } catch (error: SecurityException) {
      TrackingStore.setStatus(this, "permission_required", error.message ?: "Android denied location access.")
    } catch (error: IllegalArgumentException) {
      TrackingStore.setStatus(this, "permission_required", error.message ?: "GPS is unavailable on this device.")
    }
  }

  override fun onLocationChanged(location: Location) {
    if (!location.hasAccuracy() || location.accuracy > MAX_ACCURACY_METERS) return
    if (location.time <= 0L || location.time > System.currentTimeMillis() + 60_000L) return
    val previous = lastAcceptedLocation
    if (previous != null) {
      val elapsedSeconds = max(1.0, (location.time - previous.time) / 1000.0)
      val segmentMeters = previous.distanceTo(location).toDouble()
      val activityType = TrackingStore.currentSession(this)?.optString("activityType") ?: "walking"
      val maxMetersPerSecond = if (activityType == "running") MAX_RUNNING_SPEED else MAX_WALKING_SPEED
      if (segmentMeters < LOCATION_MIN_SEGMENT_METERS
        || segmentMeters / elapsedSeconds > maxMetersPerSecond) return

      val session = TrackingStore.currentSession(this) ?: return
      val distance = session.optDouble("distanceMeters", 0.0) + segmentMeters
      session.put("distanceMeters", distance)
      session.put("lastObservedAt", location.time)
      val elapsed = max(0L, (location.time - java.time.Instant.parse(session.getString("startedAt")).toEpochMilli()) / 1000L)
      session.put("averagePaceSecondsPerKm", if (distance > 0) (elapsed / (distance / 1000.0)).coerceAtMost(86_400.0) else 0.0)
      val weight = TrackingStore.weightKg(this)
      val met = if (activityType == "running") 8.0 else 3.5
      session.put("caloriesBurned", met * weight * (elapsed / 3600.0))
      if (TrackingStore.storeRoute(this)) {
        val route = session.optJSONArray("route") ?: JSONArray()
        if (route.length() < MAX_ROUTE_POINTS) {
          route.put(
            JSONObject()
              .put("latitude", location.latitude)
              .put("longitude", location.longitude)
              .put("timestamp", java.time.Instant.ofEpochMilli(location.time).toString())
              .put("accuracyMeters", location.accuracy.toDouble()),
          )
        }
        session.put("route", route)
      }
      TrackingStore.saveCurrentSession(this, session)
    } else {
      val session = TrackingStore.currentSession(this) ?: return
      session.put("lastObservedAt", location.time)
      if (TrackingStore.storeRoute(this)) appendRoutePoint(session, location)
      TrackingStore.saveCurrentSession(this, session)
    }
    lastAcceptedLocation = Location(location)
  }

  private fun appendRoutePoint(session: JSONObject, location: Location) {
    val route = session.optJSONArray("route") ?: JSONArray()
    if (route.length() >= MAX_ROUTE_POINTS) return
    route.put(
      JSONObject()
        .put("latitude", location.latitude)
        .put("longitude", location.longitude)
        .put("timestamp", java.time.Instant.ofEpochMilli(location.time).toString())
        .put("accuracyMeters", location.accuracy.toDouble()),
    )
    session.put("route", route)
  }

  override fun onProviderDisabled(provider: String) {
    if (provider == LocationManager.GPS_PROVIDER) {
      stopLocationUpdates()
      TrackingStore.setStatus(this, "permission_required", "Device location was turned off; activity timing continues without GPS.")
      updateNotification("Device location is off. Activity timing continues without GPS.")
    }
  }

  private fun finishSession(endTime: Long) {
    val session = TrackingStore.currentSession(this) ?: return
    stopLocationUpdates()
    val startTime = java.time.Instant.parse(session.getString("startedAt")).toEpochMilli()
    val safeEndTime = max(startTime + 1_000L, endTime)
    val durationSeconds = max(0L, (safeEndTime - startTime) / 1_000L)
    val distance = session.optDouble("distanceMeters", 0.0)
    session
      .put("status", "completed")
      .put("endedAt", java.time.Instant.ofEpochMilli(safeEndTime).toString())
      .put("durationSeconds", durationSeconds)
      .put("averagePaceSecondsPerKm", if (distance > 0) (durationSeconds / (distance / 1000.0)).coerceAtMost(86_400.0) else 0.0)
      .remove("stationaryStartedAt")
      .remove("lastObservedAt")
    val met = if (session.optString("activityType") == "running") 8.0 else 3.5
    session.put("caloriesBurned", (met * TrackingStore.weightKg(this) * (durationSeconds / 3600.0)).coerceAtMost(20_000.0))
    TrackingStore.enqueueSession(this, session)
    TrackingStore.saveCurrentSession(this, null)
    TrackingStore.clearCandidate(this)
    stationaryRunnable?.let(handler::removeCallbacks)
    validationRunnable?.let(handler::removeCallbacks)
    scheduleSync()
    if (TrackingStore.trackingEnabled(this) && !TrackingStore.trackingPaused(this)) {
      TrackingStore.setStatus(this, "monitoring_enabled")
    }
  }

  private fun stopLocationUpdates() {
    if (!locationActive) return
    locationManager?.removeUpdates(this)
    locationActive = false
    locationManager = null
    lastAcceptedLocation = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      try {
        startForeground(
          TrackingNotifications.notificationId(),
          TrackingNotifications.build(this, "Activity monitoring is active; GPS is paused."),
          TrackingNotifications.foregroundType(false),
        )
      } catch (_: IllegalStateException) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      }
    }
  }

  private fun startForegroundSafely(message: String, withLocation: Boolean): Boolean {
    try {
      val notification = TrackingNotifications.build(this, message)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(
          TrackingNotifications.notificationId(),
          notification,
          TrackingNotifications.foregroundType(withLocation),
        )
      } else {
        startForeground(TrackingNotifications.notificationId(), notification)
      }
      return true
    } catch (error: SecurityException) {
      TrackingStore.setStatus(this, "permission_required", error.message ?: "Android denied foreground tracking.")
      stopSelf()
      return false
    }
  }

  private fun updateNotification(message: String) {
    val manager = getSystemService(NotificationManager::class.java)
    manager.notify(TrackingNotifications.notificationId(), TrackingNotifications.build(this, message))
  }

  private fun stopSelfIfNoFallbackSteps() {
    stopSelf()
  }

  override fun onDestroy() {
    validationRunnable?.let(handler::removeCallbacks)
    stationaryRunnable?.let(handler::removeCallbacks)
    stopLocationUpdates()
    super.onDestroy()
  }

  companion object {
    const val ACTION_TRANSITION = "expo.modules.fitsensetracking.TRANSITION"
    const val ACTION_CANCEL_CANDIDATE = "expo.modules.fitsensetracking.CANCEL_CANDIDATE"
    const val ACTION_STOP = "expo.modules.fitsensetracking.STOP"
    const val ACTION_RECOVER = "expo.modules.fitsensetracking.RECOVER"
    const val EXTRA_ACTIVITY_TYPE = "activityType"
    const val EXTRA_EVENT_TIME = "eventTime"
    const val EXTRA_SHOULD_END = "shouldEnd"
    private const val SUSTAINED_ACTIVITY_MILLIS = 120_000L
    private const val LOCATION_INTERVAL_MILLIS = 15_000L
    private const val LOCATION_MIN_DISTANCE_METERS = 5f
    private const val LOCATION_MIN_SEGMENT_METERS = 3.0
    private const val MAX_ACCURACY_METERS = 35f
    private const val MAX_WALKING_SPEED = 8.0
    private const val MAX_RUNNING_SPEED = 12.0
    private const val MAX_ROUTE_POINTS = 5000

    fun scheduleSync(context: Context) {
      val request = OneTimeWorkRequestBuilder<FitSenseSyncWorker>()
        .setConstraints(
          Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
        )
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(
        "fitsense-tracking-sync",
        ExistingWorkPolicy.KEEP,
        request,
      )
    }

    fun schedulePeriodicSync(context: Context) {
      val request = PeriodicWorkRequestBuilder<FitSenseSyncWorker>(6, java.util.concurrent.TimeUnit.HOURS)
        .setConstraints(
          Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
        )
        .build()
      WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        "fitsense-tracking-periodic",
        ExistingPeriodicWorkPolicy.UPDATE,
        request,
      )
    }
  }
}
