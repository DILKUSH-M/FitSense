package expo.modules.fitsensetracking

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

internal object TrackingStore {
  private const val PREFS = "fitsense_tracking"
  private const val PREFERENCES = "preferences"
  private const val STATUS = "status"
  private const val CURRENT_ACTIVITY = "current_activity"
  private const val CANDIDATE_TYPE = "candidate_type"
  private const val CANDIDATE_START = "candidate_start"
  private const val CURRENT_SESSION = "current_session"
  private const val PENDING_SESSIONS = "pending_sessions"
  private const val PENDING_STEPS = "pending_steps"
  private const val TOKEN_ALIAS = "fitsense-background-sync"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun trackingEnabled(context: Context) = preferences(context).optBoolean("enabled", false)
  fun trackingPaused(context: Context) = preferences(context).optBoolean("paused", false)
  fun dailyStepsEnabled(context: Context) = preferences(context).optBoolean("dailyStepsEnabled", false)
  fun storeRoute(context: Context) = preferences(context).optBoolean("storeRoute", false)
  fun stationaryEndMinutes(context: Context) = preferences(context).optInt("stationaryEndMinutes", 5).coerceIn(2, 60)
  fun timeZone(context: Context) = preferences(context).optString("timeZone", "UTC")
  fun weightKg(context: Context) = prefs(context).getFloat("weight_kg", 68f).toDouble().coerceIn(25.0, 400.0)
  fun healthConnectAvailable(context: Context) = prefs(context).getBoolean("health_connect_available", false)
  fun healthConnectBackgroundRead(context: Context) = prefs(context).getBoolean("health_connect_background_read", false)
  fun apiBaseUrl(context: Context) = prefs(context).getString("api_base_url", "") ?: ""
  fun accountId(context: Context) = prefs(context).getString("account_id", "") ?: ""
  fun authToken(context: Context): String {
    val encrypted = prefs(context).getString("auth_token_encrypted", null) ?: return ""
    return try {
      val payload = Base64.decode(encrypted, Base64.NO_WRAP)
      val iv = payload.copyOfRange(0, GCM_IV_LENGTH)
      val ciphertext = payload.copyOfRange(GCM_IV_LENGTH, payload.size)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, tokenKey(), GCMParameterSpec(GCM_TAG_LENGTH, iv))
      String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    } catch (error: Exception) {
      setSyncError(context, "The saved mobile session could not be decrypted. Sign in again to synchronize queued activity.")
      ""
    }
  }

  fun preferences(context: Context): JSONObject {
    val serialized = prefs(context).getString(PREFERENCES, null)
    return if (serialized.isNullOrBlank()) JSONObject() else JSONObject(serialized)
  }

  fun saveConfiguration(
    context: Context,
    preferences: JSONObject,
    apiBaseUrl: String,
    token: String,
    accountId: String,
    weightKg: Double,
    healthConnectAvailable: Boolean,
    healthConnectBackgroundRead: Boolean,
  ) {
    val editor = prefs(context).edit()
      .putString(PREFERENCES, preferences.toString())
      .putString("api_base_url", apiBaseUrl.trimEnd('/'))
      .putString("account_id", accountId)
      .putFloat("weight_kg", weightKg.toFloat())
      .putBoolean("health_connect_available", healthConnectAvailable)
      .putBoolean("health_connect_background_read", healthConnectBackgroundRead)
    if (token.isBlank()) {
      editor.remove("auth_token_encrypted")
    } else {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, tokenKey())
      val payload = cipher.iv + cipher.doFinal(token.toByteArray(Charsets.UTF_8))
      editor.putString("auth_token_encrypted", Base64.encodeToString(payload, Base64.NO_WRAP))
    }
    editor.apply()
  }

  fun disableAutomaticActivityTracking(context: Context) {
    val disabledPreferences = preferences(context)
      .put("enabled", false)
      .put("paused", false)
      .put("storeRoute", false)
    prefs(context).edit().putString(PREFERENCES, disabledPreferences.toString()).apply()
  }

  fun setStatus(context: Context, state: String, message: String? = null, activityType: String? = null) {
    val status = JSONObject().put("state", state)
    if (!message.isNullOrBlank()) status.put("message", message)
    if (!activityType.isNullOrBlank()) status.put("activityType", activityType)
    prefs(context).edit().putString(STATUS, status.toString()).apply()
  }

  fun status(context: Context): Map<String, Any?> {
    val serialized = prefs(context).getString(STATUS, null)
    val value = if (serialized.isNullOrBlank()) JSONObject() else JSONObject(serialized)
    return mapOf(
      "state" to value.optString("state", "disabled"),
      "message" to value.optString("message").takeIf { it.isNotBlank() },
      "activityType" to value.optString("activityType").takeIf { it.isNotBlank() },
    )
  }

  fun currentActivity(context: Context) = prefs(context).getString(CURRENT_ACTIVITY, "unknown") ?: "unknown"
  fun setCurrentActivity(context: Context, value: String) {
    prefs(context).edit().putString(CURRENT_ACTIVITY, value).apply()
  }

  fun setCandidate(context: Context, activityType: String, startTime: Long) {
    prefs(context).edit()
      .putString(CANDIDATE_TYPE, activityType)
      .putLong(CANDIDATE_START, startTime)
      .apply()
  }

  fun candidateType(context: Context) = prefs(context).getString(CANDIDATE_TYPE, "") ?: ""
  fun candidateStart(context: Context) = prefs(context).getLong(CANDIDATE_START, 0L)
  fun clearCandidate(context: Context) {
    prefs(context).edit().remove(CANDIDATE_TYPE).remove(CANDIDATE_START).apply()
  }

  fun currentSession(context: Context): JSONObject? {
    val serialized = prefs(context).getString(CURRENT_SESSION, null) ?: return null
    return JSONObject(serialized)
  }

  fun saveCurrentSession(context: Context, session: JSONObject?) {
    val editor = prefs(context).edit()
    if (session == null) editor.remove(CURRENT_SESSION) else editor.putString(CURRENT_SESSION, session.toString())
    editor.apply()
  }

  @Synchronized
  fun enqueueSession(context: Context, session: JSONObject) {
    session.put("ownerUserId", accountId(context))
    val entries = pendingSessionsJson(context)
    val id = session.optString("clientSessionId")
    val replacement = JSONArray()
    for (index in 0 until entries.length()) {
      val existing = entries.optJSONObject(index) ?: continue
      if (existing.optString("clientSessionId") != id) replacement.put(existing)
    }
    replacement.put(session)
    prefs(context).edit().putString(PENDING_SESSIONS, replacement.toString()).apply()
  }

  @Synchronized
  fun pendingSessions(context: Context): List<Map<String, Any?>> {
    val entries = pendingSessionsJson(context)
    return (0 until entries.length()).mapNotNull { index -> entries.optJSONObject(index)?.toMapSafe() }
  }

  fun hasPendingWork(context: Context) =
    pendingSessions(context).isNotEmpty() || pendingStepSummaries(context).isNotEmpty()

  @Synchronized
  fun acknowledgeSession(context: Context, clientSessionId: String) {
    val entries = pendingSessionsJson(context)
    val remaining = JSONArray()
    for (index in 0 until entries.length()) {
      val session = entries.optJSONObject(index) ?: continue
      if (session.optString("clientSessionId") != clientSessionId) remaining.put(session)
    }
    prefs(context).edit().putString(PENDING_SESSIONS, remaining.toString()).apply()
  }

  fun addFallbackSteps(context: Context, dayKey: String, delta: Int) {
    if (delta <= 0) return
    val entries = pendingStepsJson(context)
    val key = "${accountId(context)}|$dayKey"
    val summary = entries.optJSONObject(key) ?: JSONObject()
    summary.put("steps", summary.optInt("steps", 0) + delta)
    summary.put("timeZone", timeZone(context))
    summary.put("source", "android_sensor")
    summary.put("ownerUserId", accountId(context))
    entries.put(key, summary)
    prefs(context).edit().putString(PENDING_STEPS, entries.toString()).apply()
  }

  fun fallbackSteps(context: Context, dayKey: String): Int {
    val key = "${accountId(context)}|$dayKey"
    return pendingStepsJson(context).optJSONObject(key)?.optInt("steps", 0) ?: 0
  }

  @Synchronized
  fun pendingStepSummaries(context: Context): List<Map<String, Any?>> {
    val entries = pendingStepsJson(context)
    val output = mutableListOf<Map<String, Any?>>()
    val keys = entries.keys()
    while (keys.hasNext()) {
      val dayKey = keys.next()
      val summary = entries.optJSONObject(dayKey) ?: continue
      output.add(
        mapOf(
          "dayKey" to dayKey.substringAfter('|'),
          "steps" to summary.optInt("steps", 0),
          "timeZone" to summary.optString("timeZone", "UTC"),
          "source" to summary.optString("source", "android_sensor"),
          "ownerUserId" to summary.optString("ownerUserId", ""),
        ),
      )
    }
    return output
  }

  @Synchronized
  fun acknowledgeStepSummary(context: Context, dayKey: String, syncedSteps: Int, ownerUserId: String) {
    val entries = pendingStepsJson(context)
    val key = "$ownerUserId|$dayKey"
    val current = entries.optJSONObject(key) ?: return
    if (current.optInt("steps", 0) == syncedSteps) entries.remove(key)
    prefs(context).edit().putString(PENDING_STEPS, entries.toString()).apply()
  }

  fun lastStepCounter(context: Context) = prefs(context).getFloat("last_step_counter", -1f)
  fun setLastStepCounter(context: Context, value: Float) {
    prefs(context).edit().putFloat("last_step_counter", value).apply()
  }

  fun setSyncError(context: Context, message: String?) {
    val editor = prefs(context).edit()
    if (message.isNullOrBlank()) editor.remove("sync_error") else editor.putString("sync_error", message)
    editor.apply()
  }

  fun syncError(context: Context) = prefs(context).getString("sync_error", null)
  fun lastHealthConnectSync(context: Context) = prefs(context).getString("last_health_connect_sync", null)
  fun setLastHealthConnectSync(context: Context, dayKey: String) {
    prefs(context).edit().putString("last_health_connect_sync", dayKey).apply()
  }

  private fun pendingSessionsJson(context: Context) =
    JSONArray(prefs(context).getString(PENDING_SESSIONS, "[]") ?: "[]")

  private fun pendingStepsJson(context: Context) =
    JSONObject(prefs(context).getString(PENDING_STEPS, "{}") ?: "{}")

  private fun tokenKey(): java.security.Key {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (keyStore.containsAlias(TOKEN_ALIAS)) return keyStore.getKey(TOKEN_ALIAS, null)
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        TOKEN_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }

  private const val GCM_IV_LENGTH = 12
  private const val GCM_TAG_LENGTH = 128

  private fun JSONObject.toMapSafe(): Map<String, Any?> {
    val result = mutableMapOf<String, Any?>()
    val keys = keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val value = get(key)
      result[key] = when (value) {
        JSONObject.NULL -> null
        is JSONObject -> value.toMapSafe()
        is JSONArray -> (0 until value.length()).mapNotNull { index ->
          when (val item = value.get(index)) {
            JSONObject.NULL -> null
            is JSONObject -> item.toMapSafe()
            else -> item
          }
        }
        else -> value
      }
    }
    return result
  }
}
