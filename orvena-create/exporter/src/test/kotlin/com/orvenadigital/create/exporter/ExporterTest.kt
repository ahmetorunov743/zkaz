package com.orvenadigital.create.exporter

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files
import java.security.Signature
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

/** Builds a tiny binary manifest the way aapt2 lays it out: header, string pool, resource map, elements. */
object AxmlBuilder {
    fun build(strings: List<String>, utf8: Boolean, versionCodeNameIndex: Int, packageNameIndex: Int, packageValueIndex: Int): ByteArray {
        val pool = pool(strings, utf8)
        // resource map: string index 0 -> versionCode attr id
        val resMap = ByteBuffer.allocate(8 + 4).order(ByteOrder.LITTLE_ENDIAN).apply {
            putShort(0x0180); putShort(8); putInt(12); putInt(AxmlPatcher.ATTR_VERSION_CODE)
        }.array()
        val attrCount = 2
        val elemSize = 16 + 20 + attrCount * 20
        val elem = ByteBuffer.allocate(elemSize).order(ByteOrder.LITTLE_ENDIAN).apply {
            putShort(0x0102); putShort(16); putInt(elemSize)
            putInt(1); putInt(-1) // line, comment
            putInt(-1); putInt(strings.indexOf("manifest"))
            putShort(20); putShort(20); putShort(attrCount.toShort()); putShort(0); putShort(0); putShort(0)
            // android:versionCode = 7 (int)
            putInt(-1); putInt(versionCodeNameIndex); putInt(-1)
            putShort(8); put(0); put(0x10); putInt(7)
            // package = "<string>"
            putInt(-1); putInt(packageNameIndex); putInt(packageValueIndex)
            putShort(8); put(0); put(0x03); putInt(packageValueIndex)
        }.array()
        val end = ByteBuffer.allocate(24).order(ByteOrder.LITTLE_ENDIAN).apply {
            putShort(0x0103); putShort(16); putInt(24); putInt(1); putInt(-1); putInt(-1); putInt(strings.indexOf("manifest"))
        }.array()
        val body = pool + resMap + elem + end
        val header = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).apply {
            putShort(0x0003); putShort(8); putInt(8 + body.size)
        }.array()
        return header + body
    }

    private fun pool(strings: List<String>, utf8: Boolean): ByteArray {
        val data = ByteArrayOutputStream()
        val offsets = strings.map { s ->
            val at = data.size()
            if (utf8) {
                val b = s.toByteArray(Charsets.UTF_8)
                data.write(s.length); data.write(b.size); data.write(b); data.write(0)
            } else {
                data.write(s.length and 0xFF); data.write(s.length shr 8)
                s.forEach { data.write(it.code and 0xFF); data.write(it.code shr 8) }
                data.write(0); data.write(0)
            }
            at
        }
        while (data.size() % 4 != 0) data.write(0)
        val start = 28 + 4 * strings.size
        val size = start + data.size()
        return ByteBuffer.allocate(size).order(ByteOrder.LITTLE_ENDIAN).apply {
            putShort(0x0001); putShort(28); putInt(size); putInt(strings.size); putInt(0)
            putInt(if (utf8) 0x101 else 0x1); putInt(start); putInt(0)
            offsets.forEach { putInt(it) }
            put(data.toByteArray())
        }.array()
    }
}

class ExporterTest {
    private val strings = listOf(
        "versionCode", "manifest", "package",
        ApkExporter.TEMPLATE_PACKAGE,
        "${ApkExporter.TEMPLATE_PACKAGE}.androidx-startup",
        ApkExporter.LABEL_PLACEHOLDER,
        ApkExporter.VERSION_PLACEHOLDER,
        "com.orvenadigital.create.player.PlayerActivity",
    )

    private val options = ExportOptions(
        packageName = "com.orvenacreate.app.schetchik",
        appLabel = "Мой счётчик ✨",
        versionName = "1.2.3",
        versionCode = 42,
        projectJson = "{}",
    )

    private fun manifest(utf8: Boolean) = AxmlBuilder.build(strings, utf8, versionCodeNameIndex = 0, packageNameIndex = 2, packageValueIndex = 3)

    @Test
    fun patchesUtf16Manifest() = checkPatch(utf8 = false)

    @Test
    fun patchesUtf8Manifest() = checkPatch(utf8 = true)

    private fun checkPatch(utf8: Boolean) {
        val original = manifest(utf8)
        assertEquals(7, AxmlPatcher.inspect(original).versionCode)
        val patched = ApkExporter.patchManifest(original, options)
        val info = AxmlPatcher.inspect(patched)
        assertEquals(
            listOf(
                "versionCode", "manifest", "package",
                "com.orvenacreate.app.schetchik",
                "com.orvenacreate.app.schetchik.androidx-startup",
                "Мой счётчик ✨",
                "1.2.3",
                "com.orvenadigital.create.player.PlayerActivity",
            ),
            info.strings,
        )
        assertEquals(42, info.versionCode)
        // file size in the header must match
        val size = ByteBuffer.wrap(patched).order(ByteOrder.LITTLE_ENDIAN).getInt(4)
        assertEquals(patched.size, size)
    }

    @Test
    fun longStringsKeepWorking() {
        val longLabel = "Очень длинное название приложения ".repeat(10)
        val patched = ApkExporter.patchManifest(manifest(utf8 = true), options.copy(appLabel = longLabel))
        assertEquals(longLabel, AxmlPatcher.inspect(patched).strings[5])
        val patched16 = ApkExporter.patchManifest(manifest(utf8 = false), options.copy(appLabel = longLabel))
        assertEquals(longLabel, AxmlPatcher.inspect(patched16).strings[5])
    }

    @Test
    fun selfSignedCertificateIsValid() {
        val key = SigningKey.generate("Orvena Test")
        key.certificate.checkValidity()
        key.certificate.verify(key.certificate.publicKey)
        assertTrue(key.certificate.subjectX500Principal.name.contains("Orvena Test"))
        val sig = Signature.getInstance("SHA256withRSA").apply { initSign(key.privateKey); update(byteArrayOf(1, 2, 3)) }.sign()
        assertTrue(Signature.getInstance("SHA256withRSA").apply { initVerify(key.certificate); update(byteArrayOf(1, 2, 3)) }.verify(sig))

        val dir = Files.createTempDirectory("orvena-key").toFile()
        key.save(dir)
        val loaded = SigningKey.load(dir)!!
        assertEquals(key.certificate, loaded.certificate)
        assertTrue(loaded.privateKey.encoded.contentEquals(key.privateKey.encoded))
    }

    @Test
    fun repackReplacesManifestAndAddsProject() {
        val dir = Files.createTempDirectory("orvena-repack").toFile()
        val template = File(dir, "template.apk")
        ZipOutputStream(template.outputStream()).use { zos ->
            zos.putNextEntry(ZipEntry("AndroidManifest.xml")); zos.write(manifest(utf8 = false)); zos.closeEntry()
            zos.putNextEntry(ZipEntry("classes.dex")); zos.write(byteArrayOf(1, 2, 3)); zos.closeEntry()
            zos.putNextEntry(ZipEntry("META-INF/CERT.RSA")); zos.write(byteArrayOf(9)); zos.closeEntry()
            zos.putNextEntry(ZipEntry("assets/project.json")); zos.write("old".toByteArray()); zos.closeEntry()
        }
        val out = File(dir, "out.apk")
        ApkExporter.repack(template, out, options.copy(projectJson = "{\"name\":\"x\"}"))
        ZipFile(out).use { zip ->
            val names = zip.entries().toList().map { it.name }
            assertEquals(listOf("AndroidManifest.xml", "classes.dex", "assets/project.json"), names)
            val manifest = zip.getInputStream(zip.getEntry("AndroidManifest.xml")).readBytes()
            assertEquals("com.orvenacreate.app.schetchik", AxmlPatcher.inspect(manifest).strings[3])
            assertEquals("{\"name\":\"x\"}", zip.getInputStream(zip.getEntry("assets/project.json")).readBytes().decodeToString())
        }
    }
}
