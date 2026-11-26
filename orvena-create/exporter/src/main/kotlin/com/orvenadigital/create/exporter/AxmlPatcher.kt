package com.orvenadigital.create.exporter

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Edits a compiled (binary) AndroidManifest.xml without aapt.
 *
 * The template's manifest carries placeholder strings (package name, label, version name).
 * We rewrite the string pool with new contents, keeping every string at the same index,
 * so the XML tree that points into the pool stays valid. Only the pool chunk changes size.
 */
object AxmlPatcher {
    private const val RES_XML_TYPE = 0x0003
    private const val RES_STRING_POOL_TYPE = 0x0001
    private const val RES_XML_RESOURCE_MAP_TYPE = 0x0180
    private const val RES_XML_START_ELEMENT_TYPE = 0x0102
    private const val UTF8_FLAG = 0x100
    private const val SORTED_FLAG = 0x1
    private const val TYPE_INT_DEC = 0x10
    private const val TYPE_INT_HEX = 0x11
    const val ATTR_VERSION_CODE = 0x0101021b

    class Info(val strings: List<String>, val versionCode: Int?)

    fun patch(axml: ByteArray, mapString: (String) -> String, versionCode: Int? = null): ByteArray {
        val header = readHeader(axml)
        val pool = StringPool.read(axml, header)
        val newPool = pool.write(pool.strings.map(mapString))
        val restStart = header + pool.chunkSize
        val out = ByteArrayOutputStream(axml.size + 256)
        out.write(axml, 0, header)
        out.write(newPool)
        out.write(axml, restStart, axml.size - restStart)
        val bytes = out.toByteArray()
        le(bytes).putInt(4, bytes.size)
        if (versionCode != null) {
            val patched = setVersionCode(bytes, header + newPool.size, versionCode)
            require(patched) { "versionCode attribute not found in manifest" }
        }
        return bytes
    }

    fun inspect(axml: ByteArray): Info {
        val header = readHeader(axml)
        val pool = StringPool.read(axml, header)
        return Info(pool.strings, findVersionCode(axml, header + pool.chunkSize, pool.strings))
    }

    private fun readHeader(axml: ByteArray): Int {
        val buf = le(axml)
        require(axml.size >= 8 && u16(buf, 0) == RES_XML_TYPE) { "Not a binary Android XML file" }
        val headerSize = u16(buf, 2)
        require(u16(buf, headerSize) == RES_STRING_POOL_TYPE) { "String pool not found after XML header" }
        return headerSize
    }

    /** Walks the chunks after the pool; returns the byte offset of the manifest element's versionCode attribute. */
    private fun locateVersionCode(axml: ByteArray, start: Int, strings: List<String>?): Int? {
        val buf = le(axml)
        var pos = start
        var resourceIds = IntArray(0)
        while (pos + 8 <= axml.size) {
            val type = u16(buf, pos)
            val headerSize = u16(buf, pos + 2)
            val size = buf.getInt(pos + 4)
            if (size < 8 || pos + size > axml.size) break
            when (type) {
                RES_XML_RESOURCE_MAP_TYPE -> {
                    val count = (size - headerSize) / 4
                    resourceIds = IntArray(count) { buf.getInt(pos + headerSize + it * 4) }
                }
                RES_XML_START_ELEMENT_TYPE -> {
                    val ext = pos + headerSize
                    val nameIndex = buf.getInt(ext + 4)
                    val attrStart = u16(buf, ext + 8)
                    val attrSize = u16(buf, ext + 10)
                    val attrCount = u16(buf, ext + 12)
                    val isManifest = strings == null || strings.getOrNull(nameIndex) == "manifest"
                    if (isManifest) {
                        for (i in 0 until attrCount) {
                            val attr = ext + attrStart + i * attrSize
                            val attrName = buf.getInt(attr + 4)
                            if (attrName in resourceIds.indices && resourceIds[attrName] == ATTR_VERSION_CODE) {
                                return attr
                            }
                        }
                    }
                    return null // versionCode lives on the first element only
                }
            }
            pos += size
        }
        return null
    }

    private fun findVersionCode(axml: ByteArray, start: Int, strings: List<String>): Int? {
        val attr = locateVersionCode(axml, start, strings) ?: return null
        return le(axml).getInt(attr + 16)
    }

    private fun setVersionCode(axml: ByteArray, start: Int, versionCode: Int): Boolean {
        val attr = locateVersionCode(axml, start, null) ?: return false
        val buf = le(axml)
        val dataType = axml[attr + 15].toInt() and 0xFF
        require(dataType == TYPE_INT_DEC || dataType == TYPE_INT_HEX) { "versionCode is not an integer" }
        buf.putInt(attr + 8, -1) // no raw string value
        axml[attr + 15] = TYPE_INT_DEC.toByte()
        buf.putInt(attr + 16, versionCode)
        return true
    }

    private class StringPool(
        val chunkSize: Int,
        val flags: Int,
        val strings: List<String>,
        val styleOffsets: IntArray,
        val styleData: ByteArray,
    ) {
        private val utf8 get() = flags and UTF8_FLAG != 0

        fun write(newStrings: List<String>): ByteArray {
            require(newStrings.size == strings.size)
            val data = ByteArrayOutputStream()
            val offsets = IntArray(newStrings.size)
            newStrings.forEachIndexed { i, s ->
                offsets[i] = data.size()
                if (utf8) writeUtf8(data, s) else writeUtf16(data, s)
            }
            while (data.size() % 4 != 0) data.write(0)

            val headerSize = 28
            val stringsStart = headerSize + 4 * (newStrings.size + styleOffsets.size)
            val stylesStart = if (styleOffsets.isEmpty()) 0 else stringsStart + data.size()
            val total = stringsStart + data.size() + styleData.size
            val buf = ByteBuffer.allocate(total).order(ByteOrder.LITTLE_ENDIAN)
            buf.putShort(RES_STRING_POOL_TYPE.toShort())
            buf.putShort(headerSize.toShort())
            buf.putInt(total)
            buf.putInt(newStrings.size)
            buf.putInt(styleOffsets.size)
            buf.putInt(flags and SORTED_FLAG.inv())
            buf.putInt(stringsStart)
            buf.putInt(stylesStart)
            offsets.forEach { buf.putInt(it) }
            styleOffsets.forEach { buf.putInt(it) }
            buf.put(data.toByteArray())
            buf.put(styleData)
            return buf.array()
        }

        companion object {
            fun read(axml: ByteArray, offset: Int): StringPool {
                val buf = le(axml)
                val headerSize = u16(buf, offset + 2)
                val size = buf.getInt(offset + 4)
                val stringCount = buf.getInt(offset + 8)
                val styleCount = buf.getInt(offset + 12)
                val flags = buf.getInt(offset + 16)
                val stringsStart = buf.getInt(offset + 20)
                val stylesStart = buf.getInt(offset + 24)
                val utf8 = flags and UTF8_FLAG != 0
                val strings = List(stringCount) { i ->
                    val at = offset + stringsStart + buf.getInt(offset + headerSize + i * 4)
                    if (utf8) readUtf8(axml, at) else readUtf16(buf, at)
                }
                val styleOffsets = IntArray(styleCount) { buf.getInt(offset + headerSize + (stringCount + it) * 4) }
                val styleData = if (styleCount > 0) axml.copyOfRange(offset + stylesStart, offset + size) else ByteArray(0)
                return StringPool(size, flags, strings, styleOffsets, styleData)
            }

            private fun readUtf16(buf: ByteBuffer, at: Int): String {
                var pos = at
                var len = u16(buf, pos)
                pos += 2
                if (len and 0x8000 != 0) {
                    len = ((len and 0x7FFF) shl 16) or u16(buf, pos)
                    pos += 2
                }
                val chars = CharArray(len) { buf.getChar(pos + it * 2) }
                return String(chars)
            }

            private fun readUtf8(bytes: ByteArray, at: Int): String {
                var pos = at
                // length in UTF-16 units: 1 or 2 bytes, not needed for decoding
                pos += if (bytes[pos].toInt() and 0x80 != 0) 2 else 1
                var len = bytes[pos].toInt() and 0xFF
                pos++
                if (len and 0x80 != 0) {
                    len = ((len and 0x7F) shl 8) or (bytes[pos].toInt() and 0xFF)
                    pos++
                }
                return String(bytes, pos, len, Charsets.UTF_8)
            }

            private fun writeUtf16(out: ByteArrayOutputStream, s: String) {
                val n = s.length
                if (n > 0x7FFF) {
                    writeU16(out, (n ushr 16) or 0x8000)
                    writeU16(out, n and 0xFFFF)
                } else {
                    writeU16(out, n)
                }
                s.forEach { writeU16(out, it.code) }
                writeU16(out, 0)
            }

            private fun writeUtf8(out: ByteArrayOutputStream, s: String) {
                val bytes = s.toByteArray(Charsets.UTF_8)
                require(s.length <= 0x7FFF && bytes.size <= 0x7FFF) { "String too long for the manifest" }
                writeLen8(out, s.length)
                writeLen8(out, bytes.size)
                out.write(bytes)
                out.write(0)
            }

            private fun writeLen8(out: ByteArrayOutputStream, n: Int) {
                if (n > 0x7F) {
                    out.write((n ushr 8) or 0x80)
                    out.write(n and 0xFF)
                } else {
                    out.write(n)
                }
            }

            private fun writeU16(out: ByteArrayOutputStream, v: Int) {
                out.write(v and 0xFF)
                out.write((v ushr 8) and 0xFF)
            }
        }
    }

    private fun le(bytes: ByteArray): ByteBuffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    private fun u16(buf: ByteBuffer, at: Int): Int = buf.getShort(at).toInt() and 0xFFFF
}
