package com.orvenadigital.create.exporter

import java.io.File
import java.io.FileOutputStream
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

data class ExportOptions(
    val packageName: String,
    val appLabel: String,
    val versionName: String,
    val versionCode: Int,
    val projectJson: String,
    val minSdk: Int = 26,
)

/**
 * Turns the prebuilt player APK into the user's own app, entirely on the phone:
 *   1. copy the template, dropping its old signature
 *   2. patch the binary manifest: package name, label, version
 *   3. put the project into assets/project.json
 *   4. sign with the user's key (APK Signature Scheme v2 + v3)
 */
object ApkExporter {
    /** Placeholders baked into the player template (see player/build.gradle.kts). */
    const val TEMPLATE_PACKAGE = "com.orvenacreate.template"
    const val LABEL_PLACEHOLDER = "__ORVENA_APP_LABEL__"
    const val VERSION_PLACEHOLDER = "__ORVENA_VERSION__"
    const val PROJECT_ASSET = "assets/project.json"
    private const val MANIFEST = "AndroidManifest.xml"

    fun export(template: File, output: File, options: ExportOptions, key: SigningKey) {
        output.parentFile?.mkdirs()
        val unsigned = File(output.parentFile, output.name + ".unsigned")
        try {
            repack(template, unsigned, options)
            output.delete()
            ApkSigning.sign(unsigned, output, key, options.minSdk)
        } finally {
            unsigned.delete()
        }
    }

    fun repack(template: File, output: File, options: ExportOptions) {
        ZipFile(template).use { zip ->
            ZipOutputStream(FileOutputStream(output).buffered()).use { zos ->
                for (entry in zip.entries()) {
                    val name = entry.name
                    if (isSignatureFile(name) || name == PROJECT_ASSET) continue
                    val data = zip.getInputStream(entry).use { it.readBytes() }
                    val bytes = if (name == MANIFEST) patchManifest(data, options) else data
                    writeEntry(zos, name, bytes, stored = entry.method == ZipEntry.STORED)
                }
                writeEntry(zos, PROJECT_ASSET, options.projectJson.toByteArray(Charsets.UTF_8), stored = false)
            }
        }
    }

    fun patchManifest(manifest: ByteArray, options: ExportOptions): ByteArray =
        AxmlPatcher.patch(
            manifest,
            mapString = { s ->
                when {
                    s == LABEL_PLACEHOLDER -> options.appLabel
                    s == VERSION_PLACEHOLDER -> options.versionName
                    // package attribute plus derived names: <pkg>.androidx-startup, <pkg>.DYNAMIC_RECEIVER_...
                    s == TEMPLATE_PACKAGE || s.startsWith("$TEMPLATE_PACKAGE.") ->
                        options.packageName + s.substring(TEMPLATE_PACKAGE.length)
                    else -> s
                }
            },
            versionCode = options.versionCode,
        )

    private fun isSignatureFile(name: String): Boolean {
        if (!name.startsWith("META-INF/")) return false
        val upper = name.uppercase()
        return upper == "META-INF/MANIFEST.MF" ||
            upper.endsWith(".SF") || upper.endsWith(".RSA") || upper.endsWith(".DSA") || upper.endsWith(".EC")
    }

    private fun writeEntry(zos: ZipOutputStream, name: String, bytes: ByteArray, stored: Boolean) {
        val entry = ZipEntry(name)
        if (stored) {
            val crc = CRC32().apply { update(bytes) }
            entry.method = ZipEntry.STORED
            entry.size = bytes.size.toLong()
            entry.compressedSize = bytes.size.toLong()
            entry.crc = crc.value
        } else {
            entry.method = ZipEntry.DEFLATED
        }
        entry.time = FIXED_TIME
        zos.putNextEntry(entry)
        zos.write(bytes)
        zos.closeEntry()
    }

    private const val FIXED_TIME = 1_262_304_000_000L // 2010-01-01, keeps builds reproducible
}
