import java.util.Properties
import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

// Load .env by searching up the directory tree so we can inject BuildConfig fields without hardcoding
fun loadDotEnv(): Map<String, String> {
    fun findDotEnv(startDir: File): File? {
        var dir: File? = startDir
        repeat(6) {
            val candidate = File(dir, ".env")
            if (candidate.exists()) return candidate
            dir = dir?.parentFile
        }
        return null
    }

    val envFile = findDotEnv(project.projectDir) ?: return emptyMap()
    return envFile.readLines()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") && it.contains("=") }
        .associate { line ->
            val idx = line.indexOf('=')
            val key = line.substring(0, idx).trim()
            val value = line.substring(idx + 1).trim()
            key to value
        }
}

val dotenv: Map<String, String> = loadDotEnv()

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.hasu.todo"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.hasu.todo"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
            
            // Add environment variables as build config fields (from .env)
            buildConfigField("String", "SUPABASE_URL", "\"${dotenv["REACT_APP_SUPABASE_URL"] ?: ""}\"")
            buildConfigField("String", "SUPABASE_ANON_KEY", "\"${dotenv["REACT_APP_SUPABASE_ANON_KEY"] ?: ""}\"")
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
            
            // Add environment variables as build config fields (from .env)
            buildConfigField("String", "SUPABASE_URL", "\"${dotenv["REACT_APP_SUPABASE_URL"] ?: ""}\"")
            buildConfigField("String", "SUPABASE_ANON_KEY", "\"${dotenv["REACT_APP_SUPABASE_ANON_KEY"] ?: ""}\"")
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")