package com.hasu.todo

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.util.Log

class WidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "Received action: ${intent.action}")
        when (intent.action) {
            ACTION_TOGGLE_TIMER -> {
                val taskId = intent.getLongExtra(EXTRA_TASK_ID, 0L)
                val title = intent.getStringExtra(EXTRA_TASK_TITLE)
                Log.d(TAG, "Toggle timer for taskId=$taskId, title=$title")
                if (taskId != 0L) toggleTimer(context, taskId, title)
                notifyRefresh(context)
            }
        }
    }

    private fun toggleTimer(context: Context, taskId: Long, title: String?) {
        val prefs = context.getSharedPreferences(PREFS_TIMERS, Context.MODE_PRIVATE)
        val selected = prefs.getLong(KEY_SELECTED_TASK, 0L)
        val startedAt = prefs.getLong(KEY_RUNNING_BASE, 0L)
        val now = SystemClock.elapsedRealtime()
        val edit = prefs.edit()

        if (!title.isNullOrBlank()) {
            edit.putString("title_$taskId", title)
        }

        if (selected == taskId) {
            // Same task tapped (could be running or paused)
            if (startedAt > 0) {
                // Stop running task but keep it selected
                val delta = now - startedAt
                val prev = prefs.getLong("accum_$taskId", 0L)
                edit.putLong("accum_$taskId", prev + delta)
                edit.remove(KEY_RUNNING_BASE)
                Log.d(TAG, "Stopped task $taskId (kept selected)")
            } else {
                // Was paused: start/resume
                edit.putLong(KEY_SELECTED_TASK, taskId)
                edit.putLong(KEY_RUNNING_BASE, now)
                Log.d(TAG, "Resumed task $taskId")
            }
        } else {
            // Switching tasks: bank previous if running, then select and start new
            if (selected != 0L && startedAt > 0) {
                val delta = now - startedAt
                val prev = prefs.getLong("accum_$selected", 0L)
                edit.putLong("accum_$selected", prev + delta)
            }
            edit.putLong(KEY_SELECTED_TASK, taskId)
            edit.putLong(KEY_RUNNING_BASE, now)
            Log.d(TAG, "Started task $taskId (switched)")
        }
        edit.apply()
    }

    private fun notifyRefresh(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, TodoWidgetProvider::class.java))
        Log.d(TAG, "Refreshing list for ${ids.size} widgets")
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.todo_list_view)
        for (id in ids) {
            TodoWidgetProvider.updateAppWidget(context, mgr, id)
        }
    }

    companion object {
        private const val TAG = "WidgetActionReceiver"
        const val ACTION_TOGGLE_TIMER = "com.hasu.todo.TOGGLE_TIMER"
        const val EXTRA_TASK_ID = "task_id"
        const val EXTRA_TASK_TITLE = "task_title"
        const val PREFS_TIMERS = "hasu_todo_timers"
        const val KEY_SELECTED_TASK = "selected_task_id"
        const val KEY_RUNNING_BASE = "running_base"
    }
}