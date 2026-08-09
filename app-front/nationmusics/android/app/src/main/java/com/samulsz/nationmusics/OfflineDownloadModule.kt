package com.samulsz.nationmusics

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class OfflineDownloadModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NationOfflineDownloads"

  @ReactMethod
  fun downloadSongs(songs: ReadableArray, headers: ReadableMap, taskIdFromJs: String?, promise: Promise) {
    if (songs.size() == 0) {
      promise.resolve("""{"downloaded":[],"failures":[]}""")
      return
    }

    val taskId = taskIdFromJs?.takeIf { it.isNotBlank() } ?: UUID.randomUUID().toString()
    pendingPromises[taskId] = promise

    val intent = Intent(reactContext, OfflineDownloadService::class.java).apply {
      putExtra("taskId", taskId)
      putExtra("songs", readableArrayToJson(songs).toString())
      putExtra("headers", readableMapToJson(headers).toString())
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
    } catch (error: Exception) {
      pendingPromises.remove(taskId)
      promise.reject("offline_download_start_failed", error.message, error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // ObrigatÃ³rio para NativeEventEmitter/DeviceEventEmitter no React Native novo.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Sem estado de listeners no lado nativo.
  }

  companion object {
    private const val PROGRESS_EVENT = "NationOfflineDownloadProgress"
    private val pendingPromises = ConcurrentHashMap<String, Promise>()
    private var reactContextRef: ReactApplicationContext? = null

    fun setReactContext(context: ReactApplicationContext) {
      reactContextRef = context
    }

    fun emitProgress(taskId: String, payload: JSONObject) {
      payload.put("taskId", taskId)
      reactContextRef
        ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit(PROGRESS_EVENT, payload.toString())
    }

    fun resolveTask(taskId: String, payload: String) {
      pendingPromises.remove(taskId)?.resolve(payload)
    }

    fun rejectTask(taskId: String, message: String) {
      pendingPromises.remove(taskId)?.reject("offline_download_failed", message)
    }

    private fun readableArrayToJson(array: ReadableArray): JSONArray {
      val result = JSONArray()
      for (index in 0 until array.size()) {
        val map = array.getMap(index) ?: continue
        result.put(readableMapToJson(map))
      }
      return result
    }

    private fun readableMapToJson(map: ReadableMap): JSONObject {
      val result = JSONObject()
      val iterator = map.keySetIterator()
      while (iterator.hasNextKey()) {
        val key = iterator.nextKey()
        when (map.getType(key)) {
          ReadableType.Null -> result.put(key, JSONObject.NULL)
          ReadableType.Boolean -> result.put(key, map.getBoolean(key))
          ReadableType.Number -> result.put(key, map.getDouble(key))
          ReadableType.String -> result.put(key, map.getString(key))
          ReadableType.Map -> result.put(key, readableMapToJson(map.getMap(key)!!))
          ReadableType.Array -> result.put(key, readableArrayToJson(map.getArray(key)!!))
        }
      }
      return result
    }
  }

  init {
    setReactContext(reactContext)
  }
}
