package com.hasu.todo

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.ExistingPeriodicWorkPolicy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileWriter
import java.util.concurrent.TimeUnit

class WidgetRefreshWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "WidgetRefreshWorker"
        private const val UNIQUE_WORK_NAME_PERIODIC = "widget_refresh_periodic"
        private const val UNIQUE_WORK_NAME_ONETIME = "widget_refresh_onetime"
        
        fun enqueueOneTime(context: Context) {
            Log.d(TAG, "🏃 Enqueueing one-time widget refresh work...")
            val req = OneTimeWorkRequestBuilder<WidgetRefreshWorker>().build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_WORK_NAME_ONETIME,
                androidx.work.ExistingWorkPolicy.REPLACE,
                req
            )
            Log.d(TAG, "✅ One-time work enqueued")
        }

        fun enqueuePeriodic(context: Context) {
            Log.d(TAG, "⏰ Enqueueing periodic widget refresh work...")
            val req = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK_NAME_PERIODIC,
                ExistingPeriodicWorkPolicy.REPLACE,
                req
            )
            Log.d(TAG, "✅ Periodic work enqueued (15min intervals)")
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Log.d(TAG, "🚀 WidgetRefreshWorker.doWork() starting...")
        
        try {
            // Step 1: Fetch latest todos from Supabase
            Log.d(TAG, "📡 Fetching latest todos from Supabase...")
            val supabaseClient = SupabaseClient(applicationContext)
            val todos = supabaseClient.fetchTodosForWidget()
            
            Log.d(TAG, "📋 Fetched ${todos.size} todos from Supabase")
            
            // Step 2: Convert to JSON format expected by widget
            val todosJsonArray = JSONArray()
            for (todo in todos) {
                val todoJson = JSONObject().apply {
                    put("id", todo.id)
                    put("text", todo.text)
                    put("completed", todo.completed)
                    put("created_at", todo.createdAt)
                    put("due_date", todo.dueDate)
                    if (todo.projectName.isNotEmpty()) {
                        put("project", JSONObject().apply {
                            put("name", todo.projectName)
                        })
                    }
                }
                todosJsonArray.put(todoJson)
            }
            
            // Step 3: Write to widget data file
            val filesDir = applicationContext.filesDir
            val dataFile = File(filesDir, "widget_data.json")
            
            val widgetData = JSONObject().apply {
                put("todos", todosJsonArray)
                put("is_logged_in", todos.isNotEmpty() || File(filesDir, "session.json").exists())
            }
            
            Log.d(TAG, "💾 Writing ${widgetData.toString().length} chars to ${dataFile.absolutePath}")
            FileWriter(dataFile).use { it.write(widgetData.toString()) }
            Log.d(TAG, "✅ Widget data file written successfully")
            
            // Step 4: Notify widgets to refresh
            Log.d(TAG, "🔔 Notifying widgets to refresh...")
            val appWidgetManager = AppWidgetManager.getInstance(applicationContext)
            val component = ComponentName(applicationContext, TodoWidgetProvider::class.java)
            val ids = appWidgetManager.getAppWidgetIds(component)
            
            Log.d(TAG, "📱 Found ${ids.size} widget instances: ${ids.contentToString()}")
            
            if (ids.isNotEmpty()) {
                // Notify ListView to refresh its data
                appWidgetManager.notifyAppWidgetViewDataChanged(ids, R.id.todo_list_view)
                Log.d(TAG, "🔄 Called notifyAppWidgetViewDataChanged for ListView")
                
                // Update all widget views (header, etc.)
                TodoWidgetProvider.updateAllWidgets(applicationContext)
                Log.d(TAG, "🔄 Called updateAllWidgets")
            } else {
                Log.w(TAG, "⚠️ No widget instances found to update")
            }
            
            Log.d(TAG, "🎉 WidgetRefreshWorker completed successfully")
            Result.success()
            
        } catch (e: Exception) {
            Log.e(TAG, "💥 WidgetRefreshWorker failed", e)
            Result.retry()
        }
    }
}