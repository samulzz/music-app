package com.samulsz.nationmusics

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.IBinder
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

class OfflineDownloadService : Service() {
  private val executor = Executors.newSingleThreadExecutor()
  private lateinit var notificationManager: NotificationManager

  override fun onCreate() {
    super.onCreate()
    notificationManager = getSystemService(NotificationManager::class.java)
    ensureNotificationChannel()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val taskId = intent?.getStringExtra("taskId") ?: return START_NOT_STICKY
    val songsJson = intent.getStringExtra("songs") ?: "[]"
    val headersJson = intent.getStringExtra("headers") ?: "{}"
    val songs = JSONArray(songsJson)
    val headers = JSONObject(headersJson)

    startForeground(
      NOTIFICATION_ID,
      buildNotification(
        title = "Baixando para offline",
        text = "Preparando downloads...",
        bigText = "Preparando downloads...",
        maxProgress = max(1, songs.length() * 100),
        progress = 0,
        indeterminate = true,
        ongoing = true
      )
    )

    executor.execute {
      runDownloadTask(taskId, songs, headers)
      stopSelf(startId)
    }

    return START_REDELIVER_INTENT
  }

  private fun runDownloadTask(taskId: String, songs: JSONArray, headers: JSONObject) {
    val downloaded = JSONArray()
    val failures = JSONArray()
    val total = songs.length()

    try {
      for (index in 0 until total) {
        val song = songs.getJSONObject(index)
        try {
          val file = downloadSong(taskId, song, headers, index, total)
          val result = JSONObject(song.toString())
          result.put("localUri", Uri.fromFile(file).toString())
          result.put("downloadedAt", System.currentTimeMillis())
          result.put("sizeBytes", file.length())
          downloaded.put(result)
          OfflineDownloadModule.emitProgress(
            taskId,
            JSONObject()
              .put("type", "song-complete")
              .put("done", index + 1)
              .put("total", total)
              .put("currentPercent", 100)
              .put("song", result)
          )
        } catch (error: Exception) {
          val failure = JSONObject().apply {
            put("id", song.optString("id"))
            put("sourceId", song.optString("sourceId"))
            put("title", song.optString("title", "Música"))
            put("message", error.message ?: "Falha no download.")
          }
          failures.put(failure)
          OfflineDownloadModule.emitProgress(
            taskId,
            JSONObject()
              .put("type", "song-failed")
              .put("done", index + 1)
              .put("total", total)
              .put("failure", failure)
          )
        }
      }

      val finalText = if (failures.length() > 0) {
        "${downloaded.length()}/$total músicas foram salvas offline."
      } else if (total == 1) {
        "A música já está disponível offline."
      } else {
        "$total músicas já estão disponíveis offline."
      }

      notificationManager.notify(
        NOTIFICATION_ID,
        buildNotification(
          title = if (failures.length() > 0) "Downloads concluídos com pendências" else "Downloads concluídos",
          text = finalText,
          bigText = finalText,
          maxProgress = 0,
          progress = 0,
          indeterminate = false,
          ongoing = false
        )
      )

      stopForegroundCompat()
      OfflineDownloadModule.emitProgress(
        taskId,
        JSONObject()
          .put("type", "complete")
          .put("done", downloaded.length())
          .put("total", total)
          .put("failures", failures.length())
      )
      OfflineDownloadModule.resolveTask(
        taskId,
        JSONObject()
          .put("downloaded", downloaded)
          .put("failures", failures)
          .toString()
      )
    } catch (error: Exception) {
      val message = error.message ?: "Falha nos downloads offline."
      notificationManager.notify(
        NOTIFICATION_ID,
        buildNotification(
          title = "Downloads interrompidos",
          text = message,
          bigText = message,
          maxProgress = 0,
          progress = 0,
          indeterminate = false,
          ongoing = false
        )
      )
      stopForegroundCompat()
      OfflineDownloadModule.emitProgress(
        taskId,
        JSONObject()
          .put("type", "error")
          .put("message", message)
      )
      OfflineDownloadModule.rejectTask(taskId, message)
    }
  }

  private fun downloadSong(taskId: String, song: JSONObject, headers: JSONObject, index: Int, total: Int): File {
    val url = song.getString("url")
    val title = song.optString("title", "Música")
    val fileName = sanitizeFileName(song.optString("fileName", song.optString("sourceId", title)))
    val outputDirectory = File(filesDir, "nationmusics-audio")
    if (!outputDirectory.exists()) outputDirectory.mkdirs()

    val destination = File(outputDirectory, "$fileName.mp3")
    val partial = File(outputDirectory, "$fileName.mp3.part")
    if (partial.exists()) partial.delete()

    updateProgress(taskId, song, index, total, 0, title, true)

    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      instanceFollowRedirects = true
      connectTimeout = 30_000
      readTimeout = 10 * 60_000
      val keys = headers.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        val value = headers.optString(key, "")
        if (value.isNotBlank()) setRequestProperty(key, value)
      }
      setRequestProperty("Accept", "audio/mpeg,audio/*")
    }

    try {
      val status = connection.responseCode
      if (status !in 200..299) {
        val details = connection.errorStream?.bufferedReader()?.use { it.readText() }?.take(400)
        throw IllegalStateException(details ?: "Servidor respondeu $status.")
      }

      val totalBytes = connection.contentLengthLong
      var readBytes = 0L
      var lastNotificationAt = 0L
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)

      connection.inputStream.use { input ->
        FileOutputStream(partial).use { output ->
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            readBytes += read

            val now = System.currentTimeMillis()
            if (now - lastNotificationAt >= 1000L) {
              val currentPercent = if (totalBytes > 0) {
                ((readBytes * 100L) / totalBytes).toInt()
              } else {
                0
              }
              updateProgress(taskId, song, index, total, currentPercent, title, totalBytes <= 0)
              lastNotificationAt = now
            }
          }
        }
      }

      if (totalBytes > 0 && readBytes != totalBytes) {
        throw IllegalStateException("Download incompleto. Tente novamente.")
      }
      if (readBytes < MIN_OFFLINE_AUDIO_BYTES) {
        throw IllegalStateException("Arquivo de audio incompleto. Tente novamente.")
      }

      if (destination.exists()) destination.delete()
      if (!partial.renameTo(destination)) {
        throw IllegalStateException("Não foi possível salvar o arquivo offline.")
      }

      if (destination.length() < MIN_OFFLINE_AUDIO_BYTES) {
        destination.delete()
        throw IllegalStateException("Arquivo de audio incompleto. Tente novamente.")
      }

      updateProgress(taskId, song, index + 1, total, 100, title, false)
      return destination
    } finally {
      connection.disconnect()
      if (partial.exists()) partial.delete()
    }
  }

  private fun updateProgress(taskId: String, song: JSONObject, doneSongs: Int, totalSongs: Int, currentPercent: Int, title: String, indeterminate: Boolean) {
    val maxProgress = max(1, totalSongs * 100)
    val safePercent = min(100, max(0, currentPercent))
    val progress = min(maxProgress, doneSongs * 100 + safePercent)
    val text = if (totalSongs == 1) {
      "$safePercent% • $title"
    } else {
      "$doneSongs/$totalSongs concluídas • $safePercent%"
    }
    val bigText = if (totalSongs == 1) {
      "$safePercent%\nAgora: $title"
    } else {
      "$doneSongs/$totalSongs concluídas\nAgora: $title\n$safePercent%"
    }

    notificationManager.notify(
      NOTIFICATION_ID,
      buildNotification(
        title = "Baixando para offline",
        text = text,
        bigText = bigText,
        maxProgress = maxProgress,
        progress = progress,
        indeterminate = indeterminate,
        ongoing = true
      )
    )
    OfflineDownloadModule.emitProgress(
      taskId,
      JSONObject()
        .put("type", "progress")
        .put("id", song.optString("id"))
        .put("sourceId", song.optString("sourceId"))
        .put("title", title)
        .put("done", doneSongs)
        .put("total", totalSongs)
        .put("currentPercent", safePercent)
        .put("indeterminate", indeterminate)
    )
  }

  private fun buildNotification(
    title: String,
    text: String,
    bigText: String,
    maxProgress: Int,
    progress: Int,
    indeterminate: Boolean,
    ongoing: Boolean
  ): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }

    builder
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(Notification.BigTextStyle().bigText(bigText))
      .setContentIntent(pendingIntent)
      .setOngoing(ongoing)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)

    if (!ongoing) {
      builder.setAutoCancel(true)
    }
    if (maxProgress > 0) {
      builder.setProgress(maxProgress, progress, indeterminate)
    }
    @Suppress("DEPRECATION")
    builder.setPriority(Notification.PRIORITY_LOW)
    return builder.build()
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Downloads offline",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Progresso dos downloads offline do NationMusics"
      setSound(null, null)
      enableVibration(false)
    }
    notificationManager.createNotificationChannel(channel)
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_DETACH)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(false)
    }
  }

  private fun sanitizeFileName(value: String): String {
    val normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
      .replace("\\p{Mn}+".toRegex(), "")
      .replace("[^a-zA-Z0-9_-]+".toRegex(), "-")
      .trim('-')
      .take(80)
    return normalized.ifBlank { "track-${System.currentTimeMillis()}" }
  }

  companion object {
    private const val CHANNEL_ID = "offline-downloads"
    private const val NOTIFICATION_ID = 8817
    private const val MIN_OFFLINE_AUDIO_BYTES = 512L * 1024L
  }
}
