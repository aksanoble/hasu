package com.hasu.todo

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.io.FileReader
import java.io.BufferedReader

class TodoWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        android.util.Log.d("TodoWidget", "onUpdate called with ${appWidgetIds.size} widgets")
        // Update all widget instances
        for (appWidgetId in appWidgetIds) {
            android.util.Log.d("TodoWidget", "Updating widget $appWidgetId")
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
        // Ensure background periodic refresh is scheduled
        try {
            WidgetRefreshWorker.enqueuePeriodic(context)
            scheduleTimerUpdates(context, isNowRunning = true)
            android.util.Log.d("TodoWidget", "🗓️ Scheduled periodic widget refresh")
        } catch (e: Exception) {
            android.util.Log.e("TodoWidget", "Failed to schedule periodic refresh: ${e.message}")
        }
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        
        android.util.Log.d("TodoWidget", "onReceive called with action: ${intent.action}")
        
        when (intent.action) {
            AppWidgetManager.ACTION_APPWIDGET_UPDATE, ACTION_FORCE_REFRESH -> {
                android.util.Log.d("TodoWidget", "📥 Received widget refresh broadcast: ${intent.action}")
                updateAllWidgets(context)
                // Kick a background refresh so data source can be updated
                try {
                    WidgetRefreshWorker.enqueueOneTime(context)
                    android.util.Log.d("TodoWidget", "🧰 Enqueued WidgetRefreshWorker for independent data refresh")
                } catch (e: Exception) {
                    android.util.Log.e("TodoWidget", "Failed to enqueue worker: ${e.message}")
                }
            }
            TIMER_ACTION -> {
                android.util.Log.d("TodoWidget", "🎯 Timer action received!")
                handleTimerToggle(context)
            }
            TIMER_UPDATE_ACTION -> {
                android.util.Log.d("TodoWidget", "⏱️ Timer update action received!")
                // Periodic tick: fetch/refresh and update
                try { WidgetRefreshWorker.enqueueOneTime(context) } catch (_: Exception) {}
                updateAllWidgets(context)
            }
        }
    }

    companion object {
        private const val PREFS_NAME = "hasu_todo_prefs"
        private const val KEY_TODOS = "todos"
        private const val KEY_IS_LOGGED_IN = "is_logged_in"
        private const val WIDGET_DATA_FILE = "widget_data.json"
        
        // Timer-related constants
        private const val TIMER_ACTION = "com.hasu.todo.TIMER_ACTION"  
        private const val TIMER_UPDATE_ACTION = "com.hasu.todo.TIMER_UPDATE"
        const val ACTION_FORCE_REFRESH = "com.hasu.todo.ACTION_FORCE_REFRESH"
        private const val KEY_TIMER_RUNNING = "timer_running"
        private const val KEY_TIMER_START_TIME = "timer_start_time"
        private const val KEY_TIMER_ELAPSED = "timer_elapsed"

        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.todo_widget)

            val (sessionText, todayText, activeTitle, running, hasSelection) = computeHeaderState(context)
            views.setTextViewText(R.id.today_total, todayText)
            views.setTextViewText(R.id.session_timer, if (running) sessionText else "")
            views.setTextViewText(R.id.active_task_text, if (hasSelection) activeTitle else "")
            val headerColor = if (running) 0xFFFFF59D.toInt() else 0xFFFFFFFF.toInt()
            views.setInt(R.id.header_root, "setBackgroundColor", headerColor)

            // Force list refresh
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.todo_list_view)
            android.util.Log.d("TodoWidget", "notifyAppWidgetViewDataChanged for id=$appWidgetId")

            // Header click toggles pause/resume for selected task
            val headerIntent = Intent(context, WidgetActionReceiver::class.java).apply {
                action = WidgetActionReceiver.ACTION_TOGGLE_TIMER
                putExtra(WidgetActionReceiver.EXTRA_TASK_ID, getSelectedTaskId(context))
            }
            val headerPi = PendingIntent.getBroadcast(
                context, 2001, headerIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            views.setOnClickPendingIntent(R.id.header_root, headerPi)

            // Also allow tapping anywhere on the widget background to force refresh
            val tapRefreshIntent = Intent(context, TodoWidgetProvider::class.java).apply {
                action = ACTION_FORCE_REFRESH
            }
            val refreshPi = PendingIntent.getBroadcast(
                context, 2002, tapRefreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_content, refreshPi)

            val svcIntent = Intent(context, TodoRemoteViewsService::class.java)
            views.setRemoteAdapter(R.id.todo_list_view, svcIntent)
            android.util.Log.d("TodoWidget", "setRemoteAdapter bound to list view")
            views.setEmptyView(R.id.todo_list_view, R.id.empty_view)

            val templateIntent = Intent(context, WidgetActionReceiver::class.java).apply {
                action = WidgetActionReceiver.ACTION_TOGGLE_TIMER
            }
            val templatePi = PendingIntent.getBroadcast(
                context,
                0,
                templateIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            views.setPendingIntentTemplate(R.id.todo_list_view, templatePi)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
        
        private fun formatIncompleteTodos(todosJson: String?): String {
            android.util.Log.d("TodoWidget", "formatIncompleteTodos called with: $todosJson")
            if (todosJson.isNullOrEmpty()) return "No pending tasks"
            
            return try {
                val jsonArray = JSONArray(todosJson)
                android.util.Log.d("TodoWidget", "Parsed JSON array with ${jsonArray.length()} items")
                val todosList = StringBuilder()
                var itemsAdded = 0
                
                for (i in 0 until jsonArray.length()) {
                    if (itemsAdded >= 6) break // Limit to 6 items for widget size
                    
                    val todo = jsonArray.getJSONObject(i)
                    val text = todo.getString("text")
                    // Handle both boolean and string representations
                    val completedValue = todo.opt("completed")
                    val completed = when (completedValue) {
                        is Boolean -> completedValue
                        is String -> completedValue.lowercase() == "true"
                        else -> false
                    }
                    
                    android.util.Log.d("TodoWidget", "Todo $i: text='$text', completed=$completed (raw: ${todo.opt("completed")})")
                    
                    // Only show incomplete tasks
                    if (!completed) {
                        android.util.Log.d("TodoWidget", "Adding incomplete todo: $text")
                        // Add task without any bullet points or prefixes
                        todosList.append("$text\n\n")
                        itemsAdded++
                    } else {
                        android.util.Log.d("TodoWidget", "Skipping completed todo: $text")
                    }
                }
                
                android.util.Log.d("TodoWidget", "Total incomplete items added: $itemsAdded")
                
                if (itemsAdded == 0) {
                    android.util.Log.d("TodoWidget", "No incomplete todos found, showing completion message")
                    return "All tasks completed! 🎉"
                }
                
                todosList.toString().trim()
            } catch (e: JSONException) {
                android.util.Log.e("TodoWidget", "Error parsing todos JSON: ${e.message}")
                "Error loading todos"
            }
        }
        
        private fun readWidgetData(context: Context): Pair<String, Boolean> {
            // Try to read from JSON file first
            val widgetFile = File(context.filesDir, WIDGET_DATA_FILE)
            if (widgetFile.exists()) {
                try {
                    val reader = BufferedReader(FileReader(widgetFile))
                    val jsonString = reader.readText()
                    reader.close()
                    
                    val jsonObject = JSONObject(jsonString)
                    val todosValue = jsonObject.opt("todos")
                    val todos = when (todosValue) {
                        is JSONArray -> todosValue.toString()
                        is String -> todosValue
                        else -> "[]"
                    }
                    val isLoggedIn = jsonObject.optBoolean("is_logged_in", false)
                    
                    android.util.Log.d("TodoWidget", "Read from JSON file: todosLen=${todos.length}, isLoggedIn=$isLoggedIn")
                    return Pair(todos, isLoggedIn)
                } catch (e: Exception) {
                    android.util.Log.e("TodoWidget", "Error reading JSON file: ${e.message}")
                }
            }
            
            // Fallback to SharedPreferences
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val todosJson = prefs.getString(KEY_TODOS, "[]") ?: "[]"
            val isLoggedIn = prefs.getBoolean(KEY_IS_LOGGED_IN, false)
            
            android.util.Log.d("TodoWidget", "Fallback to SharedPreferences: todos=$todosJson, isLoggedIn=$isLoggedIn")
            return Pair(todosJson, isLoggedIn)
        }
        
        // No-op direct update methods to avoid referencing removed view IDs
        fun updateAppWidgetDirect(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
            todosJson: String,
            isLoggedIn: Boolean
        ) {
            android.util.Log.d("TodoWidget", "Direct update called - delegating to standard update")
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }

        fun updateWidgetDirectly(context: Context, todosText: String, isLoggedIn: Boolean) {
            android.util.Log.d("TodoWidget", "Direct update (text) called - refreshing all widgets")
            updateAllWidgets(context)
        }
        
        // Timer-related methods
        private fun handleTimerToggle(context: Context) {
            android.util.Log.d("TodoWidget", "⏱️ === TIMER TOGGLE ===")
            // In this simplified version, just refresh the list widgets
            updateAllWidgets(context)
            // Optionally schedule future updates if needed
            scheduleTimerUpdates(context, isNowRunning = false)
        }
        
        private fun computeHeaderTimes(context: Context): Pair<String, String> {
            val prefs = context.getSharedPreferences(WidgetActionReceiver.PREFS_TIMERS, Context.MODE_PRIVATE)
            val selected = prefs.getLong(WidgetActionReceiver.KEY_SELECTED_TASK, 0L)
            val startedAt = prefs.getLong(WidgetActionReceiver.KEY_RUNNING_BASE, 0L)
            val now = android.os.SystemClock.elapsedRealtime()

            // Session time is the running task's live elapsed
            val sessionMs = if (selected != 0L && startedAt > 0) now - startedAt else 0L
            val sessionText = formatTime(sessionMs)

            // Today total is sum of all accum_* plus sessionMs
            var total = 0L
            prefs.all.forEach { (k, v) ->
                if (k.startsWith("accum_") && v is Long) total += v
            }
            total += sessionMs
            val todayText = "Today ${formatTime(total)}"
            return Pair(sessionText, todayText)
        }

        private fun formatTime(milliseconds: Long): String {
            val totalMin = milliseconds / 60000
            val hours = totalMin / 60
            val minutes = totalMin % 60
            return String.format("%02d:%02d", hours, minutes)
        }
        
        fun updateAllWidgets(context: Context) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val componentName = android.content.ComponentName(context, TodoWidgetProvider::class.java)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(componentName)
            
            android.util.Log.d("TodoWidget", "🔄 Updating ${appWidgetIds.size} widgets after timer toggle")
            
            for (appWidgetId in appWidgetIds) {
                updateAppWidget(context, appWidgetManager, appWidgetId)
            }
            // Notify data changed so ListView refreshes
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.todo_list_view)
        }
        
        private fun scheduleTimerUpdates(context: Context, isNowRunning: Boolean) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            val intent = Intent(context, TodoWidgetProvider::class.java)
            intent.action = TIMER_UPDATE_ACTION
            val pendingIntent = PendingIntent.getBroadcast(
                context, 1001, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            
            if (isNowRunning) {
                android.util.Log.d("TodoWidget", "⏰ Scheduling widget refresh every 60 seconds")
                alarmManager.setRepeating(
                    android.app.AlarmManager.RTC,
                    System.currentTimeMillis() + 60_000,
                    60_000,
                    pendingIntent
                )
            } else {
                android.util.Log.d("TodoWidget", "⏰ Canceling timer updates")
                alarmManager.cancel(pendingIntent)
            }
        }

        private fun getSelectedTaskId(context: Context): Long {
            val prefs = context.getSharedPreferences(WidgetActionReceiver.PREFS_TIMERS, Context.MODE_PRIVATE)
            return prefs.getLong(WidgetActionReceiver.KEY_SELECTED_TASK, 0L)
        }

        private fun computeHeaderState(context: Context): HeaderState {
            val prefs = context.getSharedPreferences(WidgetActionReceiver.PREFS_TIMERS, Context.MODE_PRIVATE)
            val selected = prefs.getLong(WidgetActionReceiver.KEY_SELECTED_TASK, 0L)
            val startedAt = prefs.getLong(WidgetActionReceiver.KEY_RUNNING_BASE, 0L)
            val now = android.os.SystemClock.elapsedRealtime()

            val running = selected != 0L && startedAt > 0
            val sessionMs = if (running) now - startedAt else 0L
            val sessionText = formatTime(sessionMs)

            var total = 0L
            prefs.all.forEach { (k, v) -> if (k.startsWith("accum_") && v is Long) total += v }
            if (running) total += sessionMs
            val todayText = "Today ${formatTime(total)}"

            val storedTitle = if (selected != 0L) prefs.getString("title_$selected", null) else null
            val hasSelection = selected != 0L
            val title = storedTitle ?: if (hasSelection) "Active task" else ""
            return HeaderState(sessionText, todayText, title, running, hasSelection)
        }

        data class HeaderState(
            val sessionText: String,
            val todayText: String,
            val activeTitle: String,
            val running: Boolean,
            val hasSelection: Boolean
        )

        // Data class for potential future use
        data class TodoItem(
            val text: String,
            val completed: Boolean,
            val createdAt: String
        )
    }
}