package com.orvenadigital.create

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.orvenadigital.create.core.model.Samples
import com.orvenadigital.create.data.ProjectRepository
import com.orvenadigital.create.export.ExportManager
import com.orvenadigital.create.ui.EditorScreen
import com.orvenadigital.create.ui.OrvenaTheme
import com.orvenadigital.create.ui.ProjectsScreen
import java.io.File
import kotlin.concurrent.thread

object AppInfo {
    val VERSION: String = BuildConfig.VERSION_NAME
    val VERSION_LABEL: String = "$VERSION · демо"
}

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val repository = ProjectRepository(applicationContext)
        if (BuildConfig.DEBUG && intent?.getBooleanExtra(EXTRA_SELF_TEST, false) == true) runExportSelfTest()
        setContent {
            OrvenaTheme {
                OrvenaApp(repository)
            }
        }
    }

    /**
     * Debug builds only: CI starts the editor with this flag to check that on-device export
     * really works (apksig on Android, template from assets), then installs the result.
     */
    private fun runExportSelfTest() {
        thread(name = "orvena-selftest") {
            try {
                val project = Samples.counter().copy(name = "Selftest", packageName = SELF_TEST_PACKAGE)
                val out = ExportManager(applicationContext).exportTo(project, File(filesDir, "selftest.apk"))
                Log.i(TAG, "ORVENA_SELFTEST_OK ${out.absolutePath} ${out.length()}")
            } catch (t: Throwable) {
                Log.e(TAG, "ORVENA_SELFTEST_FAIL", t)
            }
        }
    }

    private companion object {
        const val TAG = "OrvenaSelfTest"
        const val EXTRA_SELF_TEST = "orvena.selftest"
        const val SELF_TEST_PACKAGE = "com.orvenacreate.selftest"
    }
}

@Composable
fun OrvenaApp(repository: ProjectRepository) {
    var openProjectId by rememberSaveable { mutableStateOf<String?>(null) }
    val id = openProjectId
    if (id == null) {
        ProjectsScreen(repository, onOpen = { openProjectId = it })
    } else {
        EditorScreen(repository, id, onClose = { openProjectId = null })
    }
}
