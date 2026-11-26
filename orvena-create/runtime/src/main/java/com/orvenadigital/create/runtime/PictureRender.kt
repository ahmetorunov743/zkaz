package com.orvenadigital.create.runtime

import android.graphics.BitmapFactory
import android.graphics.Paint
import android.util.Base64
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import com.orvenadigital.create.core.model.Picture
import com.orvenadigital.create.core.model.PictureSource
import com.orvenadigital.create.core.model.ShapeKind
import com.orvenadigital.create.core.model.naturalSize
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** Decoded photos, keyed by their base64 data. */
object PhotoCache {
    private val cache = LinkedHashMap<String, ImageBitmap?>()

    fun get(base64: String): ImageBitmap? {
        if (cache.containsKey(base64)) return cache[base64]
        val image = try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
        } catch (e: IllegalArgumentException) {
            null
        }
        if (cache.size > 64) cache.remove(cache.keys.first())
        cache[base64] = image
        return image
    }
}

private val emojiPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }

/** Draws [picture] centered at (0, 0), [width] × [height] pixels. */
fun DrawScope.drawPicture(picture: Picture?, width: Float, height: Float, alpha: Float = 1f) {
    if (width <= 0f || height <= 0f) return
    when (val source = picture?.source) {
        null -> drawRoundRect(
            color = Color(0xFFCED4DA),
            topLeft = Offset(-width / 2, -height / 2),
            size = Size(width, height),
            cornerRadius = CornerRadius(min(width, height) * 0.2f),
            alpha = alpha,
        )
        is PictureSource.Emoji -> {
            emojiPaint.textSize = min(width, height) * 0.82f
            emojiPaint.alpha = (alpha * 255).toInt().coerceIn(0, 255)
            val metrics = emojiPaint.fontMetrics
            drawContext.canvas.nativeCanvas.drawText(source.text, 0f, -(metrics.ascent + metrics.descent) / 2, emojiPaint)
        }
        is PictureSource.Shape -> drawShape(source.shape, parseColorOrNull(source.color) ?: Color.Gray, width, height, alpha)
        is PictureSource.Drawing -> {
            parseColorOrNull(source.background)?.let {
                drawRect(it, topLeft = Offset(-width / 2, -height / 2), size = Size(width, height), alpha = alpha)
            }
            for (stroke in source.strokes) drawStrokeLine(stroke.points, parseColorOrNull(stroke.color) ?: Color.Black, stroke.width * width, width, height, alpha)
        }
        is PictureSource.Photo -> {
            val image = PhotoCache.get(source.pngBase64)
            if (image != null) {
                drawImage(
                    image = image,
                    srcOffset = IntOffset.Zero,
                    srcSize = IntSize(image.width, image.height),
                    dstOffset = IntOffset((-width / 2).toInt(), (-height / 2).toInt()),
                    dstSize = IntSize(width.toInt().coerceAtLeast(1), height.toInt().coerceAtLeast(1)),
                    alpha = alpha,
                )
            }
        }
    }
}

/** A stroke of a drawing: points are 0..1 inside the box, (0, 0) at the top-left. */
fun DrawScope.drawStrokeLine(points: List<Float>, color: Color, strokeWidth: Float, width: Float, height: Float, alpha: Float = 1f) {
    if (points.size < 2) return
    val left = -width / 2
    val top = -height / 2
    if (points.size < 4) {
        drawCircle(color, radius = strokeWidth / 2, center = Offset(left + points[0] * width, top + points[1] * height), alpha = alpha)
        return
    }
    val path = Path()
    path.moveTo(left + points[0] * width, top + points[1] * height)
    var i = 2
    while (i + 1 < points.size) {
        path.lineTo(left + points[i] * width, top + points[i + 1] * height)
        i += 2
    }
    drawPath(path, color, alpha = alpha, style = Stroke(width = strokeWidth.coerceAtLeast(1f), cap = StrokeCap.Round, join = StrokeJoin.Round))
}

private fun DrawScope.drawShape(kind: ShapeKind, color: Color, w: Float, h: Float, alpha: Float) {
    val topLeft = Offset(-w / 2, -h / 2)
    val size = Size(w, h)
    when (kind) {
        ShapeKind.RECT -> drawRect(color, topLeft, size, alpha = alpha)
        ShapeKind.ROUNDED -> drawRoundRect(color, topLeft, size, CornerRadius(min(w, h) * 0.3f), alpha = alpha)
        ShapeKind.CIRCLE -> drawOval(color, topLeft, size, alpha = alpha)
        ShapeKind.TRIANGLE -> drawPath(
            Path().apply {
                moveTo(0f, -h / 2); lineTo(w / 2, h / 2); lineTo(-w / 2, h / 2); close()
            },
            color, alpha = alpha,
        )
        ShapeKind.DIAMOND -> drawPath(
            Path().apply {
                moveTo(0f, -h / 2); lineTo(w / 2, 0f); lineTo(0f, h / 2); lineTo(-w / 2, 0f); close()
            },
            color, alpha = alpha,
        )
        ShapeKind.STAR -> drawPath(
            Path().apply {
                for (i in 0 until 10) {
                    val r = if (i % 2 == 0) 0.5f else 0.2f
                    val a = -PI / 2 + i * PI / 5
                    val x = (cos(a) * r * w).toFloat()
                    val y = (sin(a) * r * h).toFloat()
                    if (i == 0) moveTo(x, y) else lineTo(x, y)
                }
                close()
            },
            color, alpha = alpha,
        )
        ShapeKind.HEART -> drawPath(
            Path().apply {
                moveTo(0f, h * 0.38f)
                cubicTo(-w * 0.62f, -h * 0.02f, -w * 0.36f, -h * 0.62f, 0f, -h * 0.22f)
                cubicTo(w * 0.36f, -h * 0.62f, w * 0.62f, -h * 0.02f, 0f, h * 0.38f)
                close()
            },
            color, alpha = alpha,
        )
    }
}

/** A picture fitted into the composable's box, keeping its proportions. */
@Composable
fun PictureThumb(picture: Picture?, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val (nw, nh) = picture?.source?.naturalSize() ?: (64.0 to 64.0)
        val scale = min(size.width / nw.toFloat(), size.height / nh.toFloat())
        translate(size.width / 2, size.height / 2) {
            drawPicture(picture, nw.toFloat() * scale, nh.toFloat() * scale)
        }
    }
}
