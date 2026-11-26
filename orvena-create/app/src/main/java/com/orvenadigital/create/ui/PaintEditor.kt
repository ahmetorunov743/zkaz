package com.orvenadigital.create.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.orvenadigital.create.core.model.PictureSource
import com.orvenadigital.create.core.model.Stroke
import com.orvenadigital.create.runtime.drawStrokeLine
import com.orvenadigital.create.runtime.parseColorOrNull
import kotlin.math.hypot

private val BRUSHES = listOf("Тонкая" to 0.015f, "Средняя" to 0.04f, "Толстая" to 0.08f, "Огромная" to 0.16f)
private val PAINT_COLORS = listOf(
    "#000000", "#FFFFFF", "#868E96", "#F03E3E", "#FF8A00", "#FAB005", "#40C057", "#2F9E44",
    "#15AABF", "#228BE6", "#5B3DF5", "#BE4BDB", "#E64980", "#A0522D", "#FFD8A8",
)

/** A square canvas to draw a picture with the finger. Strokes are stored as vectors, so they scale cleanly. */
@Composable
fun PaintEditorDialog(initial: PictureSource.Drawing?, onDismiss: () -> Unit, onSave: (PictureSource.Drawing) -> Unit) {
    val strokes = remember { (initial?.strokes ?: emptyList()).toMutableStateList() }
    val current = remember { mutableStateListOf<Float>() }
    var color by remember { mutableStateOf("#000000") }
    var brush by remember { mutableStateOf(0.04f) }
    var background by remember { mutableStateOf(initial?.background ?: "") }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize().safeDrawingPadding().padding(12.dp).verticalScroll(rememberScrollState())) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onDismiss) { Text("Отмена") }
                    Text("Рисунок", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold)
                    Button(onClick = { onSave(PictureSource.Drawing(strokes.toList(), background)) }) { Text("Готово") }
                }
                Spacer(Modifier.height(8.dp))
                Canvas(
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .clipToBounds()
                        .border(2.dp, Color(0xFF343A40), RoundedCornerShape(4.dp))
                        .background(parseColorOrNull(background) ?: Color.White)
                        .pointerInput(color, brush) {
                            detectTapGestures { p ->
                                strokes += Stroke(color, brush, listOf(p.x / size.width, p.y / size.height))
                            }
                        }
                        .pointerInput(color, brush) {
                            detectDragGestures(
                                onDragStart = { p ->
                                    current.clear()
                                    current += listOf(p.x / size.width, p.y / size.height)
                                },
                                onDragEnd = {
                                    if (current.size >= 2) strokes += Stroke(color, brush, current.toList())
                                    current.clear()
                                },
                                onDragCancel = { current.clear() },
                                onDrag = { change, _ ->
                                    val x = (change.position.x / size.width).coerceIn(0f, 1f)
                                    val y = (change.position.y / size.height).coerceIn(0f, 1f)
                                    val n = current.size
                                    if (n < 2 || hypot(x - current[n - 2], y - current[n - 1]) > 0.004f) current += listOf(x, y)
                                },
                            )
                        },
                ) {
                    val w = size.width
                    val h = size.height
                    translate(w / 2, h / 2) {
                        for (s in strokes) drawStrokeLine(s.points, parseColorOrNull(s.color) ?: Color.Black, s.width * w, w, h)
                        if (current.size >= 2) drawStrokeLine(current.toList(), parseColorOrNull(color) ?: Color.Black, brush * w, w, h)
                    }
                    // a light center cross helps to center the drawing
                    drawLine(Color(0x22000000), Offset(w / 2, 0f), Offset(w / 2, h))
                    drawLine(Color(0x22000000), Offset(0f, h / 2), Offset(w, h / 2))
                }
                Spacer(Modifier.height(10.dp))
                Text("Цвет", fontWeight = FontWeight.SemiBold)
                ColorRow(color, PAINT_COLORS) { color = it }
                Spacer(Modifier.height(10.dp))
                Text("Кисть", fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    BRUSHES.forEach { (label, width) ->
                        if (brush == width) Button(onClick = { brush = width }) { Text(label) }
                        else OutlinedButton(onClick = { brush = width }) { Text(label) }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Text("Фон", fontWeight = FontWeight.SemiBold)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (background.isEmpty()) Button(onClick = { background = "" }) { Text("Прозрачный") }
                    else OutlinedButton(onClick = { background = "" }) { Text("Прозрачный") }
                }
                ColorRow(background, PAINT_COLORS) { background = it }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { if (strokes.isNotEmpty()) strokes.removeAt(strokes.lastIndex) }) { Text("↩ Отменить") }
                    OutlinedButton(onClick = { strokes.clear() }) { Text("Очистить") }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}
