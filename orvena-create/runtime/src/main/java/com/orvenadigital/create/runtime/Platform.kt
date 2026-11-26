package com.orvenadigital.create.runtime

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.widget.Toast
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/** Phone features the blocks use. */
interface Platform {
    fun toast(text: String)
    fun vibrate(millis: Long)
    suspend fun playNote(note: Double, seconds: Double)
}

class AndroidPlatform(context: Context) : Platform {
    private val app = context.applicationContext

    override fun toast(text: String) {
        Toast.makeText(app, text, Toast.LENGTH_SHORT).show()
    }

    override fun vibrate(millis: Long) {
        if (millis <= 0) return
        try {
            @Suppress("DEPRECATION")
            val vibrator = app.getSystemService(Vibrator::class.java) ?: return
            vibrator.vibrate(VibrationEffect.createOneShot(millis, VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (e: Exception) {
            Log.w(TAG, "vibrate failed", e)
        }
    }

    /** A soft sine tone; [note] is a MIDI number (60 = middle C). Waits while it plays. */
    override suspend fun playNote(note: Double, seconds: Double) {
        if (seconds <= 0) return
        val track = withContext(Dispatchers.Default) {
            try {
                val rate = 22050
                val frequency = 440.0 * 2.0.pow((note - 69) / 12)
                val count = (rate * seconds).toInt().coerceIn(1, rate * 10)
                val attack = rate * 0.01
                val release = rate * 0.04
                val pcm = ShortArray(count) { i ->
                    val envelope = min(1.0, min(i / attack, (count - i) / release))
                    (sin(2 * PI * frequency * i / rate) * envelope * 0.35 * Short.MAX_VALUE).toInt().toShort()
                }
                AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_GAME)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(rate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build(),
                    )
                    .setBufferSizeInBytes(count * 2)
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build()
                    .also {
                        it.write(pcm, 0, count)
                        it.play()
                    }
            } catch (e: Exception) {
                Log.w(TAG, "tone failed", e)
                null
            }
        }
        try {
            delay((seconds * 1000).toLong())
        } finally {
            track?.let {
                try {
                    it.stop()
                } catch (_: IllegalStateException) {
                }
                it.release()
            }
        }
    }

    private companion object {
        const val TAG = "OrvenaPlatform"
    }
}
