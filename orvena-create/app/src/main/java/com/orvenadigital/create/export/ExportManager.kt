package com.orvenadigital.create.export

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.ProjectJson
import com.orvenadigital.create.exporter.ApkExporter
import com.orvenadigital.create.exporter.ExportOptions
import com.orvenadigital.create.exporter.SigningKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** Builds a real installable APK from a project, on the device, offline. */
class ExportManager(private val context: Context) {

    suspend fun export(project: Project): File = withContext(Dispatchers.IO) {
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // keep only the latest build
        exportTo(project, File(dir, fileName(project)))
    }

    fun exportTo(project: Project, output: File): File {
        val template = File(context.cacheDir, "template-player.apk")
        context.assets.open(TEMPLATE_ASSET).use { input ->
            template.outputStream().use { input.copyTo(it) }
        }
        val key = SigningKey.loadOrCreate(File(context.filesDir, "signing"))
        val options = ExportOptions(
            packageName = project.packageName,
            appLabel = project.name,
            versionName = project.versionName,
            versionCode = project.versionCode,
            projectJson = ProjectJson.encode(project),
        )
        ApkExporter.export(template, output, options, key)
        return output
    }

    /** @return false if the user first has to allow installing apps from Orvena Create. */
    fun install(file: File): Boolean {
        if (!context.packageManager.canRequestPackageInstalls()) {
            val settings = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(settings)
            return false
        }
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri(file), APK_MIME)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }

    fun share(file: File) {
        val send = Intent(Intent.ACTION_SEND)
            .setType(APK_MIME)
            .putExtra(Intent.EXTRA_STREAM, uri(file))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(send, "Поделиться APK").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun uri(file: File): Uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)

    private fun fileName(project: Project): String {
        val base = project.packageName.substringAfterLast('.').ifEmpty { "app" }
        val version = project.versionName.filter { it.isLetterOrDigit() || it == '.' || it == '-' }.ifEmpty { "1" }
        return "$base-$version.apk"
    }

    companion object {
        const val TEMPLATE_ASSET = "template/player.apk"
        const val APK_MIME = "application/vnd.android.package-archive"
    }
}
