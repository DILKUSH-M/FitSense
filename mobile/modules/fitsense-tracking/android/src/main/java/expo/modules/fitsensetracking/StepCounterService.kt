package expo.modules.fitsensetracking

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class StepCounterService : Service(), SensorEventListener {
  private var sensorManager: SensorManager? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    TrackingNotifications.createChannel(this)
    val notification = TrackingNotifications.build(this, "Counting steps using the device's low-power step sensor.")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        TrackingNotifications.notificationId() + 1,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH,
      )
    } else {
      startForeground(TrackingNotifications.notificationId() + 1, notification)
    }

    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val sensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    if (sensor == null) {
      TrackingStore.setStatus(this, "permission_required", "Health Connect is unavailable and this device has no step counter.")
      stopSelf()
      return
    }
    if (sensorManager?.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL) != true) {
      TrackingStore.setStatus(this, "permission_required", "The device step counter could not be started.")
      stopSelf()
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!TrackingStore.dailyStepsEnabled(this) || TrackingStore.healthConnectAvailable(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type != Sensor.TYPE_STEP_COUNTER || event.values.isEmpty()) return
    val current = event.values[0]
    val previous = TrackingStore.lastStepCounter(this)
    TrackingStore.setLastStepCounter(this, current)
    if (previous < 0 || current < previous) return
    val delta = (current - previous).toInt()
    if (delta <= 0) return

    val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply {
      timeZone = TimeZone.getTimeZone(TrackingStore.timeZone(this@StepCounterService))
    }
    val dayKey = formatter.format(Date())
    TrackingStore.addFallbackSteps(this, dayKey, delta)
    ActivityTrackingService.scheduleSync(this)
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  override fun onDestroy() {
    sensorManager?.unregisterListener(this)
    super.onDestroy()
  }
}
