package expo.modules.fitsensetracking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat

internal object TrackingNotifications {
  private const val CHANNEL_ID = "fitsense_activity_tracking"
  private const val NOTIFICATION_ID = 4211

  fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Activity monitoring", NotificationManager.IMPORTANCE_LOW)
        .apply { description = "Shows when FitSense is confirming or recording an activity." },
    )
  }

  fun build(context: Context, content: String): Notification {
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        context,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT
          or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0,
      )
    }
    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_fitsense_notification)
      .setContentTitle("FitSense activity tracking")
      .setContentText(content)
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  fun notificationId() = NOTIFICATION_ID

  fun foregroundType(location: Boolean): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return 0
    return ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH or
      if (location) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
  }
}
