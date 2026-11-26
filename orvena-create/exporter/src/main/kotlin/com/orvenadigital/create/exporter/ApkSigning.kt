package com.orvenadigital.create.exporter

import com.android.apksig.ApkSigner
import java.io.File

/** Signs an APK with Google's apksig library, the same code that powers the `apksigner` tool. */
object ApkSigning {
    fun sign(input: File, output: File, key: SigningKey, minSdk: Int) {
        val signer = ApkSigner.SignerConfig.Builder("orvena", key.privateKey, listOf(key.certificate)).build()
        ApkSigner.Builder(listOf(signer))
            .setInputApk(input)
            .setOutputApk(output)
            .setMinSdkVersion(minSdk)
            .setV1SigningEnabled(false)
            .setV2SigningEnabled(true)
            .setV3SigningEnabled(true)
            .build()
            .sign()
    }
}
