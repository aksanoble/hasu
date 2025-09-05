package com.hasu.todo

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class SupabaseClient(private val context: Context) {
    
    companion object {
        private const val TAG = "SupabaseClient"
        private val SUPABASE_URL = BuildConfig.SUPABASE_URL
        private val ANON_KEY = BuildConfig.SUPABASE_ANON_KEY
    }

    private val client: OkHttpClient by lazy {
        val logging = HttpLoggingInterceptor { message ->
            Log.d(TAG, "HTTP: $message")
        }.apply {
            // Avoid logging bodies and sensitive headers in production
            level = HttpLoggingInterceptor.Level.BASIC
            redactHeader("Authorization")
            redactHeader("apikey")
        }
        
        OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .build()
    }

    private data class SessionData(
        val accessToken: String,
        val userId: String
    )

    private fun readSessionData(): SessionData? {
        return try {
            val sessionFile = File(context.filesDir, "session.json")
            if (!sessionFile.exists()) {
                Log.w(TAG, "Session file not found: ${sessionFile.absolutePath}")
                return null
            }
            
            val content = sessionFile.readText()
            val json = JSONObject(content)
            val accessToken = json.optString("access_token", "")
            val userId = json.optString("user_id", "")
            
            if (accessToken.isEmpty() || userId.isEmpty()) {
                Log.w(TAG, "Invalid session data: accessToken=$accessToken, userId=$userId")
                return null
            }
            
            Log.d(TAG, "Valid session found for userId=$userId")
            SessionData(accessToken, userId)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read session data", e)
            null
        }
    }

    suspend fun fetchTodosForWidget(): List<TodoItemData> = withContext(Dispatchers.IO) {
        Log.d(TAG, "🚀 fetchTodosForWidget() starting...")
        
        val sessionData = readSessionData()
        if (sessionData == null) {
            Log.w(TAG, "❌ No valid session data available")
            return@withContext emptyList()
        }

        try {
            val today = java.time.LocalDate.now().toString() // YYYY-MM-DD
            Log.d(TAG, "📅 Fetching todos for today: $today")
            
            val base = SUPABASE_URL?.trimEnd('/') ?: ""
            if (base.isEmpty()) {
                Log.e(TAG, "SUPABASE_URL is empty. Check BuildConfig injection.")
                return@withContext emptyList()
            }
            val url = "$base/rest/v1/todos?user_id=eq.${sessionData.userId}&completed=eq.false&order=created_at.desc&select=id,text,completed,created_at,due_date"
            Log.d(TAG, "🌐 Request URL: $url")
            
            val request = Request.Builder()
                .url(url)
                .addHeader("apikey", ANON_KEY)
                .addHeader("Authorization", "Bearer ${sessionData.accessToken}")
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "return=representation")
                .build()

            Log.d(TAG, "📡 Sending request to Supabase...")
            val response = client.newCall(request).execute()
            
            Log.d(TAG, "📨 Response: ${response.code} ${response.message}")
            Log.d(TAG, "📋 Response headers: ${response.headers}")
            
            response.use { resp ->
                val body = resp.body?.string() ?: ""
                Log.d(TAG, "📄 Response body (${body.length} chars): ${body.take(500)}${if (body.length > 500) "..." else ""}")
                
                if (!resp.isSuccessful) {
                    Log.e(TAG, "❌ HTTP error: ${resp.code} - $body")
                    return@withContext emptyList()
                }

                val jsonArray = JSONArray(body)
                val todos = mutableListOf<TodoItemData>()
                
                Log.d(TAG, "🔍 Processing ${jsonArray.length()} todos from response...")
                
                for (i in 0 until jsonArray.length()) {
                    val item = jsonArray.getJSONObject(i)
                    val id = item.optString("id", "")
                    val text = item.optString("text", "")
                    val completed = item.optBoolean("completed", false)
                    val createdAt = item.optString("created_at", "")
                    val dueDate = item.optString("due_date", null)
                    
                    // Handle nested project object
                    val projectName = try {
                        val projectObj = item.optJSONObject("project")
                        projectObj?.optString("name", "") ?: ""
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to parse project for todo $id: ${e.message}")
                        ""
                    }
                    
                    val todo = TodoItemData(
                        id = id,
                        text = text,
                        completed = completed,
                        createdAt = createdAt,
                        dueDate = dueDate,
                        projectName = projectName
                    )
                    
                    todos.add(todo)
                    Log.d(TAG, "✅ Todo[$i]: id=$id, text='${text.take(30)}', completed=$completed, due=$dueDate, project='$projectName'")
                }
                
                Log.d(TAG, "🎉 Successfully fetched ${todos.size} todos")
                todos
            }
        } catch (e: Exception) {
            Log.e(TAG, "💥 Failed to fetch todos", e)
            emptyList()
        }
    }

    data class TodoItemData(
        val id: String,
        val text: String,
        val completed: Boolean,
        val createdAt: String,
        val dueDate: String?,
        val projectName: String
    )
}
