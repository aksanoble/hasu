package com.hasu.todo

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.FileReader
import kotlin.math.abs

class TodoRemoteViewsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return Factory(applicationContext)
    }

    class Factory(private val context: Context) : RemoteViewsFactory {
        private val items = mutableListOf<TodoItem>()
        private var selectedTaskId: Long = 0L

        override fun onCreate() {}

        override fun onDataSetChanged() {
            android.util.Log.d("TodoRemoteViews", "onDataSetChanged()")
            items.clear()
            val (todosJson, _) = readWidgetData(context)
            android.util.Log.d("TodoRemoteViews", "readWidgetData length=${todosJson?.length ?: 0}")
            val parsed = parseTodos(todosJson)
            android.util.Log.d("TodoRemoteViews", "parsed size=${parsed.size}")
            val incomplete = parsed.filter { !it.completed }
            val dueToday = incomplete.filter { isDueToday(it.dueDate) }
            android.util.Log.d("TodoRemoteViews", "incomplete=${incomplete.size} dueToday=${dueToday.size}")
            val list = (if (dueToday.isNotEmpty()) dueToday else incomplete)
                .sortedByDescending { it.createdAt }
            items.addAll(list)
            android.util.Log.d("TodoRemoteViews", "items.size=${items.size}")

            val prefs = context.getSharedPreferences(WidgetActionReceiver.PREFS_TIMERS, Context.MODE_PRIVATE)
            selectedTaskId = prefs.getLong(KEY_SELECTED_TASK, 0L)
            android.util.Log.d("TodoRemoteViews", "selectedTaskId=$selectedTaskId")
        }

        override fun onDestroy() { items.clear() }
        override fun getCount(): Int = items.size

        override fun getViewAt(position: Int): RemoteViews? {
            if (position < 0 || position >= items.size) return null
            val item = items[position]
            val rv = RemoteViews(context.packageName, R.layout.widget_row)
            rv.setTextViewText(R.id.task_text, item.text)

            val ms = getAccumulatedMs(context, item.id)
            rv.setTextViewText(R.id.task_time, if (ms > 0) formatMs(ms) else "")

            val isSelected = item.id == selectedTaskId
            if (isSelected) {
                rv.setInt(R.id.row_root, "setBackgroundColor", 0xFFFFF59D.toInt())
            } else {
                rv.setInt(R.id.row_root, "setBackgroundResource", R.drawable.widget_item_bg)
            }

            val fillIn = Intent().apply {
                putExtra(WidgetActionReceiver.EXTRA_TASK_ID, item.id)
                putExtra(WidgetActionReceiver.EXTRA_TASK_TITLE, item.text)
            }
            rv.setOnClickFillInIntent(R.id.row_root, fillIn)
            return rv
        }

        override fun getLoadingView(): RemoteViews? = null
        override fun getViewTypeCount(): Int = 2
        override fun getItemId(position: Int): Long = items[position].id
        override fun hasStableIds(): Boolean = true

        private fun parseTodos(json: String?): List<TodoItem> {
            if (json.isNullOrEmpty()) return emptyList()
            val arr = JSONArray(json)
            val list = mutableListOf<TodoItem>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val idAny: Any? = o.opt("id")
                val id: Long = when (idAny) {
                    is Number -> idAny.toLong()
                    is String -> abs(idAny.hashCode().toLong())
                    else -> 0L
                }.let { if (it != 0L) it else abs(o.optString("text", "").hashCode().toLong()) }
                val text = o.optString("text", "")
                val completed = o.optBoolean("completed", false)
                val createdAt = o.optString("created_at", "")
                val due = o.optString("due_date", null)
                android.util.Log.d(
                    "TodoRemoteViews",
                    "item[$i]: id=$id text='${text.take(30)}' completed=$completed due=$due createdAt='${createdAt.take(25)}'"
                )
                list.add(TodoItem(id, text, completed, createdAt, due))
            }
            return list
        }

        private fun isDueToday(due: String?): Boolean {
            if (due.isNullOrEmpty()) return false
            val today = java.time.LocalDate.now()
            return try {
                val isToday = java.time.LocalDate.parse(due).isEqual(today)
                isToday
            } catch (_: Exception) { false }
        }

        private fun readWidgetData(context: Context): Pair<String, Boolean> {
            val file = File(context.filesDir, "widget_data.json")
            if (file.exists()) {
                try {
                    val reader = BufferedReader(FileReader(file))
                    val jsonString = reader.readText(); reader.close()
                    val jsonObject = JSONObject(jsonString)
                    val todos = jsonObject.optString("todos", "[]")
                    val isLoggedIn = jsonObject.optBoolean("is_logged_in", false)
                    android.util.Log.d("TodoRemoteViews", "read from file: ${file.absolutePath} len=${todos.length}")
                    return Pair(todos, isLoggedIn)
                } catch (_: Exception) {}
            }
            val prefs = context.getSharedPreferences("hasu_todo_prefs", Context.MODE_PRIVATE)
            val todosJson = prefs.getString("todos", "[]") ?: "[]"
            val isLoggedIn = prefs.getBoolean("is_logged_in", false)
            android.util.Log.d("TodoRemoteViews", "read from prefs len=${todosJson.length}")
            return Pair(todosJson, isLoggedIn)
        }

        private fun getAccumulatedMs(context: Context, taskId: Long): Long {
            val prefs = context.getSharedPreferences(WidgetActionReceiver.PREFS_TIMERS, Context.MODE_PRIVATE)
            val base = prefs.getLong("accum_$taskId", 0L)
            val runningFor = if (prefs.getLong(KEY_SELECTED_TASK, 0L) == taskId) {
                val start = prefs.getLong(KEY_RUNNING_BASE, 0L)
                if (start > 0) SystemClock.elapsedRealtime() - start else 0L
            } else 0L
            return base + runningFor
        }

        private fun formatMs(ms: Long): String {
            val totalMin = ms / 60000
            val hh = totalMin / 60
            val mm = totalMin % 60
            return String.format("%02d:%02d", hh, mm)
        }
    }

    data class TodoItem(
        val id: Long,
        val text: String,
        val completed: Boolean,
        val createdAt: String,
        val dueDate: String?
    )

    companion object {
        const val KEY_SELECTED_TASK = "selected_task_id"
        const val KEY_RUNNING_BASE = "running_base"
    }
}