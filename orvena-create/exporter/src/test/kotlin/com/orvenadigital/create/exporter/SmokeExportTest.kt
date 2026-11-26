package com.orvenadigital.create.exporter

import com.orvenadigital.create.core.model.ProjectJson
import com.orvenadigital.create.core.model.Samples
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.zip.ZipFile

/**
 * End-to-end export against the real player template. Runs only when the template is given:
 *   ./gradlew :exporter:test -PtemplateApk=player/build/outputs/apk/release/player-release-unsigned.apk
 * CI then checks the result with apksigner, zipalign and aapt2.
 */
class SmokeExportTest {
    @Test
    fun exportCounterSample() {
        val templatePath = System.getProperty("orvena.templateApk").orEmpty()
        assumeTrue("no template APK given", templatePath.isNotEmpty())
        val template = File(templatePath)
        val outDir = File(System.getProperty("orvena.smokeOut") ?: "build/smoke")
        val output = File(outDir, "counter.apk")

        val project = Samples.counter().copy(name = "Счётчик", packageName = "com.orvenacreate.smoke.counter")
        val options = ExportOptions(
            packageName = project.packageName,
            appLabel = project.name,
            versionName = "1.2.3",
            versionCode = 5,
            projectJson = ProjectJson.encode(project),
        )
        ApkExporter.export(template, output, options, SigningKey.generate())

        ZipFile(output).use { zip ->
            val manifest = zip.getInputStream(zip.getEntry("AndroidManifest.xml")).readBytes()
            val info = AxmlPatcher.inspect(manifest)
            println("Patched manifest strings: ${info.strings}")
            assertEquals(5, info.versionCode)
            check(info.strings.contains("com.orvenacreate.smoke.counter"))
            check(info.strings.none { it.contains(ApkExporter.TEMPLATE_PACKAGE) }) { "template package left in manifest" }
            check(info.strings.none { it == ApkExporter.LABEL_PLACEHOLDER || it == ApkExporter.VERSION_PLACEHOLDER })
            val json = zip.getInputStream(zip.getEntry(ApkExporter.PROJECT_ASSET)).readBytes().decodeToString()
            assertEquals(project, ProjectJson.decode(json))
        }
        println("Exported ${output.absolutePath} (${output.length()} bytes)")
    }
}
