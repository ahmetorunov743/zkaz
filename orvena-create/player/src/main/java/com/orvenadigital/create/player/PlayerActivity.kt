package com.orvenadigital.create.player

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.ProjectJson
import com.orvenadigital.create.core.model.Samples
import com.orvenadigital.create.runtime.AndroidPlatform
import com.orvenadigital.create.runtime.BrandingSplash
import com.orvenadigital.create.runtime.ProjectRuntime
import com.orvenadigital.create.runtime.ProjectView
import com.orvenadigital.create.runtime.RuntimeTheme
import kotlinx.coroutines.delay

/** Runs the project stored in assets/project.json. This activity is the whole exported app. */
class PlayerActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val project = loadProject()
        setContent {
            RuntimeTheme(project) {
                val context = LocalContext.current
                var splash by remember { mutableStateOf(project.showBranding) }
                LaunchedEffect(Unit) {
                    if (splash) {
                        delay(SPLASH_MS)
                        splash = false
                    }
                }
                if (splash) {
                    BrandingSplash()
                } else {
                    // created after the splash, so the blocks start when the app is visible
                    val runtime = remember { ProjectRuntime(project, platform = AndroidPlatform(context)) }
                    ProjectView(runtime, Modifier.fillMaxSize().safeDrawingPadding())
                }
            }
        }
    }

    private fun loadProject(): Project = try {
        assets.open(PROJECT_ASSET).bufferedReader().use { ProjectJson.decode(it.readText()) }
    } catch (e: Exception) {
        // The bare template (not exported yet) has no project: show the sample instead.
        Log.w(TAG, "No project in assets, showing the sample", e)
        Samples.counter()
    }

    private companion object {
        const val TAG = "OrvenaPlayer"
        const val PROJECT_ASSET = "project.json"
        const val SPLASH_MS = 1200L
    }
}
