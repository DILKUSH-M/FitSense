package expo.modules.fitsensetracking

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.aggregate.AggregateRequest
import androidx.health.connect.client.aggregate.AggregateGroupByPeriodRequest
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId

class FitSenseSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val token = TrackingStore.authToken(applicationContext)
    val baseUrl = TrackingStore.apiBaseUrl(applicationContext)
    val accountId = TrackingStore.accountId(applicationContext)
    if (token.isBlank() || baseUrl.isBlank()) return Result.success()

    return try {
      syncPendingSessions(baseUrl, token, accountId)
      syncPendingStepSummaries(baseUrl, token, accountId)
      syncHealthConnectHistory(baseUrl, token)
      TrackingStore.setSyncError(applicationContext, null)
      Result.success()
    } catch (error: IOException) {
      TrackingStore.setSyncError(applicationContext, "Tracking data is queued until the network is available.")
      Result.retry()
    } catch (error: SecurityException) {
      TrackingStore.setSyncError(applicationContext, "Health Connect or location permission was revoked. Reopen FitSense to review permissions.")
      Result.success()
    } catch (error: IllegalArgumentException) {
      TrackingStore.setSyncError(applicationContext, error.message ?: "Tracking data could not be synchronized.")
      Result.failure()
    }
  }

  private suspend fun syncPendingSessions(baseUrl: String, token: String, accountId: String) {
    for (session in TrackingStore.pendingSessions(applicationContext)) {
      if (session["ownerUserId"] != accountId) continue
      val clientId = session["clientSessionId"] as? String ?: continue
      val payload = JSONObject(session).apply { remove("ownerUserId") }
      if (!session.containsKey("steps")) {
        sessionStepCount(session)?.let { payload.put("steps", it) }
      }
      val responseCode = putJson(
        "$baseUrl/tracking/sessions/${java.net.URLEncoder.encode(clientId, Charsets.UTF_8.name())}",
        token,
        payload,
      )
      if (responseCode in 200..299) TrackingStore.acknowledgeSession(applicationContext, clientId)
      else handleResponse(responseCode)
    }
  }

  private suspend fun sessionStepCount(session: Map<String, Any?>): Int? {
    if (!TrackingStore.dailyStepsEnabled(applicationContext)
      || !TrackingStore.healthConnectAvailable(applicationContext)
      || !TrackingStore.healthConnectBackgroundRead(applicationContext)) return null

    val client = HealthConnectClient.getOrCreate(applicationContext)
    val granted = client.permissionController.getGrantedPermissions()
    if (HealthPermission.getReadPermission(StepsRecord::class) !in granted
      || HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND !in granted) return null
    val startTime = java.time.Instant.parse(session["startedAt"] as String)
    val endTime = java.time.Instant.parse(session["endedAt"] as String)
    if (endTime <= startTime) return null
    val result = client.aggregate(
      AggregateRequest(
        metrics = setOf(StepsRecord.COUNT_TOTAL),
        timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
      ),
    )
    return (result[StepsRecord.COUNT_TOTAL] ?: 0L).toInt().coerceIn(0, 200_000)
  }

  private suspend fun syncPendingStepSummaries(baseUrl: String, token: String, accountId: String) {
    for (summary in TrackingStore.pendingStepSummaries(applicationContext)) {
      if (summary["ownerUserId"] != accountId) continue
      val dayKey = summary["dayKey"] as? String ?: continue
      val steps = summary["steps"] as? Int ?: 0
      val responseCode = putJson(
        "$baseUrl/tracking/daily-steps/$dayKey",
        token,
        JSONObject(summary).apply {
          remove("dayKey")
          remove("ownerUserId")
        },
      )
      if (responseCode in 200..299) {
        TrackingStore.acknowledgeStepSummary(applicationContext, dayKey, steps, accountId)
      } else {
        handleResponse(responseCode)
      }
    }
  }

  private suspend fun syncHealthConnectHistory(baseUrl: String, token: String) {
    if (!TrackingStore.dailyStepsEnabled(applicationContext)
      || !TrackingStore.healthConnectAvailable(applicationContext)
      || !TrackingStore.healthConnectBackgroundRead(applicationContext)) return

    val client = HealthConnectClient.getOrCreate(applicationContext)
    val granted = client.permissionController.getGrantedPermissions()
    if (HealthPermission.getReadPermission(StepsRecord::class) !in granted
      || HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND !in granted) return

    val zone = ZoneId.of(TrackingStore.timeZone(applicationContext))
    val today = LocalDate.now(zone)
    val fullHistory = TrackingStore.lastHealthConnectSync(applicationContext) != today.toString()
    val firstDay = if (fullHistory) today.minusDays(29) else today
    val range = TimeRangeFilter.between(
      firstDay.atStartOfDay(zone).toInstant(),
      today.plusDays(1).atStartOfDay(zone).toInstant(),
    )
    val buckets = client.aggregateGroupByPeriod(
      AggregateGroupByPeriodRequest(
        metrics = setOf(StepsRecord.COUNT_TOTAL),
        timeRangeFilter = range,
        timeRangeSlicer = Period.ofDays(1),
      ),
    )
    val stepsByDate = buckets.associate { bucket ->
      bucket.startTime.atZone(zone).toLocalDate().toString() to
        (bucket.result[StepsRecord.COUNT_TOTAL] ?: 0L).toInt().coerceIn(0, 200_000)
    }

    val dayCount = if (fullHistory) 30 else 1
    for (offset in 0 until dayCount) {
      val day = firstDay.plusDays(offset.toLong())
      val responseCode = putJson(
        "$baseUrl/tracking/daily-steps/$day",
        token,
        JSONObject()
          .put("steps", stepsByDate[day.toString()] ?: 0)
          .put("source", "health_connect")
          .put("timeZone", zone.id),
      )
      handleResponse(responseCode)
    }
    TrackingStore.setLastHealthConnectSync(applicationContext, today.toString())
  }

  private suspend fun putJson(url: String, token: String, payload: JSONObject): Int = withContext(Dispatchers.IO) {
    val connection = URL(url).openConnection() as HttpURLConnection
    try {
      connection.requestMethod = "PUT"
      connection.connectTimeout = 15_000
      connection.readTimeout = 15_000
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { stream -> stream.write(payload.toString().toByteArray(Charsets.UTF_8)) }
      val status = connection.responseCode
      val responseStream = if (status in 200..399) connection.inputStream else connection.errorStream
      responseStream?.use { it.readBytes() }
      status
    } finally {
      connection.disconnect()
    }
  }

  private fun handleResponse(statusCode: Int) {
    if (statusCode in 200..299) return
    if (statusCode >= 500 || statusCode == 408 || statusCode == 429) throw IOException("Tracking sync failed with HTTP $statusCode.")
    if (statusCode == 401 || statusCode == 403) {
      TrackingStore.setSyncError(applicationContext, "Sign in again or enable tracking to synchronize queued activity.")
      throw IllegalArgumentException("The server rejected the tracking credentials or preference.")
    }
    TrackingStore.setSyncError(applicationContext, "The server rejected tracking data (HTTP $statusCode).")
    throw IllegalArgumentException("Tracking sync failed with HTTP $statusCode.")
  }
}
