package com.orvenadigital.create.exporter

import java.io.ByteArrayOutputStream
import java.io.File
import java.math.BigInteger
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.PKCS8EncodedKeySpec
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The key exported apps are signed with. One key per editor install, kept in app storage.
 * Losing it means already installed apps cannot be updated, only reinstalled.
 */
class SigningKey(val privateKey: PrivateKey, val certificate: X509Certificate) {

    fun save(dir: File) {
        dir.mkdirs()
        File(dir, KEY_FILE).writeBytes(privateKey.encoded)
        File(dir, CERT_FILE).writeBytes(certificate.encoded)
    }

    companion object {
        private const val KEY_FILE = "key.pk8"
        private const val CERT_FILE = "cert.der"

        fun generate(commonName: String = "Orvena Create", years: Int = 30): SigningKey {
            val generator = KeyPairGenerator.getInstance("RSA")
            generator.initialize(2048, SecureRandom())
            val pair = generator.generateKeyPair()
            val now = System.currentTimeMillis()
            val notBefore = Date(now - 24L * 3600 * 1000)
            val notAfter = Date(now + years * 365L * 24 * 3600 * 1000)
            val der = SelfSignedCertificate.build(commonName, pair.public.encoded, notBefore, notAfter) { tbs ->
                Signature.getInstance("SHA256withRSA").run {
                    initSign(pair.private)
                    update(tbs)
                    sign()
                }
            }
            val cert = CertificateFactory.getInstance("X.509").generateCertificate(der.inputStream()) as X509Certificate
            return SigningKey(pair.private, cert)
        }

        fun load(dir: File): SigningKey? {
            val keyFile = File(dir, KEY_FILE)
            val certFile = File(dir, CERT_FILE)
            if (!keyFile.exists() || !certFile.exists()) return null
            val key = KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(keyFile.readBytes()))
            val cert = certFile.inputStream().use {
                CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate
            }
            return SigningKey(key, cert)
        }

        fun loadOrCreate(dir: File): SigningKey = load(dir) ?: generate().also { it.save(dir) }
    }
}

/** Minimal DER writer for a self-signed X.509 v3 certificate (SHA256withRSA). No BouncyCastle needed. */
internal object SelfSignedCertificate {
    private const val OID_SHA256_RSA = "1.2.840.113549.1.1.11"
    private const val OID_COMMON_NAME = "2.5.4.3"

    fun build(
        commonName: String,
        subjectPublicKeyInfo: ByteArray,
        notBefore: Date,
        notAfter: Date,
        sign: (ByteArray) -> ByteArray,
    ): ByteArray {
        val algorithm = seq(oid(OID_SHA256_RSA), byteArrayOf(0x05, 0x00))
        val name = seq(set(seq(oid(OID_COMMON_NAME), tlv(0x0C, commonName.toByteArray(Charsets.UTF_8)))))
        val serial = BigInteger(63, SecureRandom()).add(BigInteger.ONE)
        val tbs = seq(
            tlv(0xA0, integer(BigInteger.valueOf(2))), // v3
            integer(serial),
            algorithm,
            name,
            seq(time(notBefore), time(notAfter)),
            name,
            subjectPublicKeyInfo,
        )
        val signature = sign(tbs)
        return seq(tbs, algorithm, tlv(0x03, byteArrayOf(0) + signature))
    }

    private fun time(date: Date): ByteArray {
        val year = SimpleDateFormat("yyyy", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(date).toInt()
        // RFC 5280: UTCTime until 2049, GeneralizedTime from 2050
        return if (year < 2050) {
            tlv(0x17, format("yyMMddHHmmss'Z'", date))
        } else {
            tlv(0x18, format("yyyyMMddHHmmss'Z'", date))
        }
    }

    private fun format(pattern: String, date: Date): ByteArray =
        SimpleDateFormat(pattern, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(date).toByteArray(Charsets.US_ASCII)

    private fun integer(value: BigInteger) = tlv(0x02, value.toByteArray())

    private fun oid(dotted: String): ByteArray {
        val parts = dotted.split('.').map { it.toLong() }
        val out = ByteArrayOutputStream()
        out.write((parts[0] * 40 + parts[1]).toInt())
        for (arc in parts.drop(2)) {
            val stack = ArrayList<Int>()
            var v = arc
            stack += (v and 0x7F).toInt()
            v = v shr 7
            while (v > 0) {
                stack += ((v and 0x7F) or 0x80).toInt()
                v = v shr 7
            }
            stack.asReversed().forEach(out::write)
        }
        return tlv(0x06, out.toByteArray())
    }

    private fun seq(vararg parts: ByteArray) = tlv(0x30, concat(parts))
    private fun set(vararg parts: ByteArray) = tlv(0x31, concat(parts))

    private fun concat(parts: Array<out ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        parts.forEach { out.write(it) }
        return out.toByteArray()
    }

    private fun tlv(tag: Int, content: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        out.write(tag)
        val len = content.size
        when {
            len < 0x80 -> out.write(len)
            len < 0x100 -> { out.write(0x81); out.write(len) }
            len < 0x10000 -> { out.write(0x82); out.write(len ushr 8); out.write(len and 0xFF) }
            else -> { out.write(0x83); out.write(len ushr 16); out.write((len ushr 8) and 0xFF); out.write(len and 0xFF) }
        }
        out.write(content)
        return out.toByteArray()
    }
}
