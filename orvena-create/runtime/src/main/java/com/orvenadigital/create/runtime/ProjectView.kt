package com.orvenadigital.create.runtime

import android.content.Context
import android.graphics.Paint
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.changedToDown
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.orvenadigital.create.core.engine.SpriteInstance
import com.orvenadigital.create.core.engine.StageWorld
import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.core.model.RotationStyle
import com.orvenadigital.create.core.model.naturalSize
import kotlinx.coroutines.isActive
import kotlin.math.asin

val OrvenaViolet = Color(0xFF5B3DF5)

fun parseColorOrNull(value: String?): Color? {
    if (value.isNullOrBlank()) return null
    return try {
        Color(android.graphics.Color.parseColor(value.trim()))
    } catch (e: IllegalArgumentException) {
        null
    }
}

private fun String.isTrue(default: Boolean): Boolean = when (trim().lowercase()) {
    "true", "1", "да", "yes" -> true
    "false", "0", "нет", "no" -> false
    else -> default
}

private fun String.dpValue(default: Float, max: Float = 400f): Float =
    trim().replace(',', '.').toFloatOrNull()?.coerceIn(0f, max) ?: default

/** Material theme built from the project's main color. */
@Composable
fun RuntimeTheme(project: Project, content: @Composable () -> Unit) {
    val primary = parseColorOrNull(project.themeColor) ?: OrvenaViolet
    MaterialTheme(colorScheme = lightColorScheme(primary = primary)) {
        Surface(color = MaterialTheme.colorScheme.background, content = content)
    }
}

/** Shows the screen on top of the back stack, runs its blocks, drives the game loop. */
@Composable
fun ProjectView(runtime: ProjectRuntime, modifier: Modifier = Modifier, handleBack: Boolean = true) {
    if (handleBack) {
        BackHandler(enabled = runtime.backStack.size > 1) { runtime.goBack() }
    }
    DisposableEffect(runtime) {
        onDispose { runtime.dispose() }
    }
    LaunchedEffect(runtime) {
        var last = 0L
        while (isActive) {
            withFrameNanos { now ->
                val dt = if (last == 0L) 0.0 else ((now - last) / 1e9).coerceAtMost(0.05)
                last = now
                runtime.frame(dt)
            }
        }
    }
    TiltSensor(runtime)

    val entry = runtime.backStack.lastOrNull()
    val screen = entry?.let { runtime.screen(it.screenId) }
    if (entry == null || screen == null) {
        Box(modifier)
        return
    }
    key(entry.token) {
        Column(modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            RenderComponent(runtime, entry.token, screen.root, Modifier)
        }
    }

    runtime.askRequest?.let { request ->
        var text by remember(request) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = {},
            title = { Text(request.question.ifEmpty { "Ответ" }) },
            text = { OutlinedTextField(value = text, onValueChange = { text = it }, singleLine = true) },
            confirmButton = { TextButton(onClick = { runtime.answer(text) }) { Text("OK") } },
        )
    }
}

@Composable
private fun TiltSensor(runtime: ProjectRuntime) {
    val context = LocalContext.current
    DisposableEffect(runtime) {
        val manager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val sensor = manager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                val g = SensorManager.GRAVITY_EARTH
                runtime.tiltX = Math.toDegrees(asin((-event.values[0] / g).toDouble().coerceIn(-1.0, 1.0)))
                runtime.tiltY = Math.toDegrees(asin((event.values[1] / g).toDouble().coerceIn(-1.0, 1.0)))
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }
        if (sensor != null) manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME)
        onDispose { manager?.unregisterListener(listener) }
    }
}

@Composable
private fun RenderComponent(rt: ProjectRuntime, token: Int, c: Component, outer: Modifier) {
    if (!rt.prop(c, Props.VISIBLE).isTrue(true)) return

    val background = parseColorOrNull(rt.prop(c, Props.BACKGROUND))
    val padding = rt.prop(c, Props.PADDING).dpValue(0f)
    var mod = outer
    if (rt.prop(c, Props.FILL_WIDTH).isTrue(false)) mod = mod.fillMaxWidth()
    val paintsOwnBackground = c.type == ComponentType.BUTTON || c.type == ComponentType.CARD || c.type == ComponentType.STAGE
    if (background != null && !paintsOwnBackground) mod = mod.background(background, RoundedCornerShape(8.dp))
    if (padding > 0f && c.type != ComponentType.CARD) mod = mod.padding(padding.dp)

    val spacing = rt.prop(c, Props.SPACING).dpValue(8f).dp
    val align = rt.prop(c, Props.ALIGN)

    when (c.type) {
        ComponentType.COLUMN -> Column(
            modifier = mod,
            verticalArrangement = Arrangement.spacedBy(spacing),
            horizontalAlignment = horizontal(align),
        ) {
            c.children.forEach { RenderComponent(rt, token, it, Modifier) }
        }

        ComponentType.ROW -> Row(
            modifier = mod,
            horizontalArrangement = Arrangement.spacedBy(spacing),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            c.children.forEach { child ->
                val weight = rt.prop(child, Props.WEIGHT).dpValue(0f)
                RenderComponent(rt, token, child, if (weight > 0f) Modifier.weight(weight) else Modifier)
            }
        }

        ComponentType.CARD -> Card(
            modifier = mod,
            colors = if (background != null) CardDefaults.cardColors(containerColor = background) else CardDefaults.cardColors(),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(if (padding > 0f) padding.dp else 12.dp),
                verticalArrangement = Arrangement.spacedBy(spacing),
                horizontalAlignment = horizontal(align),
            ) {
                c.children.forEach { RenderComponent(rt, token, it, Modifier) }
            }
        }

        ComponentType.TEXT -> Text(
            text = rt.prop(c, Props.TEXT),
            modifier = mod,
            fontSize = rt.prop(c, Props.TEXT_SIZE).dpValue(16f).coerceAtLeast(6f).sp,
            fontWeight = if (rt.prop(c, Props.BOLD).isTrue(false)) FontWeight.Bold else FontWeight.Normal,
            color = parseColorOrNull(rt.prop(c, Props.TEXT_COLOR)) ?: Color.Unspecified,
            textAlign = when (align) {
                "center" -> TextAlign.Center
                "end" -> TextAlign.End
                else -> TextAlign.Start
            },
        )

        ComponentType.BUTTON -> Button(
            onClick = { rt.dispatch(Event.Clicked(c.id)) },
            modifier = mod,
            enabled = rt.prop(c, Props.ENABLED).isTrue(true),
            colors = if (background != null) ButtonDefaults.buttonColors(containerColor = background) else ButtonDefaults.buttonColors(),
        ) {
            Text(rt.prop(c, Props.TEXT))
        }

        ComponentType.INPUT -> {
            val hint = rt.prop(c, Props.HINT)
            OutlinedTextField(
                value = rt.prop(c, Props.TEXT),
                onValueChange = {
                    rt.setProperty(c.id, Props.TEXT, it)
                    rt.dispatch(Event.TextChanged(c.id))
                },
                modifier = mod,
                label = if (hint.isNotEmpty()) {
                    { Text(hint) }
                } else {
                    null
                },
                singleLine = true,
            )
        }

        ComponentType.CHECKBOX -> Row(modifier = mod, verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = rt.prop(c, Props.CHECKED).isTrue(false),
                onCheckedChange = {
                    rt.setProperty(c.id, Props.CHECKED, it.toString())
                    rt.dispatch(Event.CheckedChanged(c.id))
                },
            )
            Text(rt.prop(c, Props.TEXT))
        }

        ComponentType.IMAGE -> {
            val picture = rt.picture(rt.prop(c, Props.PICTURE))
            val height = rt.prop(c, Props.HEIGHT).dpValue(120f, 2000f)
            val (nw, nh) = picture?.source?.naturalSize() ?: (1.0 to 1.0)
            val fill = rt.prop(c, Props.FILL_WIDTH).isTrue(false)
            val sized = if (fill) mod.height(height.dp) else mod.height(height.dp).width((height * nw / nh).toFloat().dp)
            if (picture == null) {
                Box(sized.background(Color(0xFFE9ECEF), RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                    Text("картинка", color = Color(0xFF868E96))
                }
            } else {
                PictureThumb(picture, sized)
            }
        }

        ComponentType.STAGE -> StageView(rt, token, c, mod)

        ComponentType.DIVIDER -> HorizontalDivider(modifier = mod)

        ComponentType.SPACER -> Spacer(modifier = mod.height(rt.prop(c, Props.HEIGHT).dpValue(16f).dp))
    }
}

@Composable
private fun StageView(rt: ProjectRuntime, token: Int, component: Component, modifier: Modifier) {
    val world: StageWorld? = rt.world(token)?.stages?.get(component.id)
    val dens = LocalDensity.current.density
    val background = parseColorOrNull(rt.prop(component, Props.BACKGROUND)) ?: Color(0xFFE7F5FF)
    val height = rt.prop(component, Props.HEIGHT).dpValue(400f, 2000f).coerceAtLeast(80f)

    Canvas(
        modifier
            .height(height.dp)
            .clipToBounds()
            .onSizeChanged { world?.width = (it.width / dens).toDouble() }
            .pointerInput(world) {
                val stage = world ?: return@pointerInput
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull() ?: continue
                        val x = ((change.position.x - size.width / 2f) / dens).toDouble()
                        val y = ((size.height / 2f - change.position.y) / dens).toDouble()
                        if (change.changedToDown()) {
                            rt.engine.tapStage(component.id, x, y)
                        } else {
                            stage.fingerX = x
                            stage.fingerY = y
                        }
                        stage.fingerDown = change.pressed
                    }
                }
            },
    ) {
        rt.frameTick.longValue // redraw every frame
        drawRect(background)
        val stage = world ?: return@Canvas
        val cx = size.width / 2
        val cy = size.height / 2
        val sprites = stage.instances.toList()
        for (s in sprites) if (s.visible) drawSprite(s, cx, cy)
        for (s in sprites) if (s.visible && s.sayText != null) drawBubble(s, cx, cy)
    }
}

private fun DrawScope.drawSprite(s: SpriteInstance, cx: Float, cy: Float) {
    val picture = s.picture()
    val (nw, nh) = picture?.source?.naturalSize() ?: (64.0 to 64.0)
    val w = (nw * s.size / 100 * density).toFloat()
    val h = (nh * s.size / 100 * density).toFloat()
    val px = cx + (s.x * density).toFloat()
    val py = cy - (s.y * density).toFloat()
    val rotation = if (s.rotationStyle == RotationStyle.ALL_AROUND) (s.direction - 90).toFloat() else 0f
    val flip = s.rotationStyle == RotationStyle.LEFT_RIGHT && s.direction < 0
    val alpha = (1 - s.ghost / 100).toFloat().coerceIn(0f, 1f)
    withTransform({
        translate(px, py)
        rotate(rotation, Offset.Zero)
        if (flip) scale(-1f, 1f, Offset.Zero)
    }) {
        drawPicture(picture, w, h, alpha)
    }
}

private val bubblePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.BLACK }

private fun DrawScope.drawBubble(s: SpriteInstance, cx: Float, cy: Float) {
    val text = s.sayText ?: return
    bubblePaint.textSize = 14f * density
    val pad = 8f * density
    val textWidth = bubblePaint.measureText(text).coerceAtMost(size.width - 4 * pad)
    val bw = textWidth + 2 * pad
    val bh = bubblePaint.textSize + 2 * pad
    val top = cy - (s.y * density).toFloat() - (s.halfHeight() * density).toFloat() - bh - 6 * density
    val left = (cx + (s.x * density).toFloat() - bw / 2).coerceIn(2f, (size.width - bw - 2f).coerceAtLeast(2f))
    val topClamped = top.coerceAtLeast(2f)
    drawRoundRect(Color.White, Offset(left, topClamped), Size(bw, bh), CornerRadius(10 * density))
    drawRoundRect(Color(0xFF495057), Offset(left, topClamped), Size(bw, bh), CornerRadius(10 * density), style = Stroke(1.5f * density))
    drawContext.canvas.nativeCanvas.drawText(
        text, 0, text.length, left + pad, topClamped + pad - bubblePaint.fontMetrics.ascent, bubblePaint,
    )
}

private fun horizontal(align: String): Alignment.Horizontal = when (align) {
    "center" -> Alignment.CenterHorizontally
    "end" -> Alignment.End
    else -> Alignment.Start
}

/** "Made with Orvena Create" splash of the free tier. */
@Composable
fun BrandingSplash(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().background(Color.White), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Made with", color = Color(0xFF868E96), fontSize = 14.sp)
            Text("Orvena Create", color = OrvenaViolet, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Text("by Orvena Digital", color = Color(0xFF868E96), fontSize = 12.sp)
        }
    }
}
