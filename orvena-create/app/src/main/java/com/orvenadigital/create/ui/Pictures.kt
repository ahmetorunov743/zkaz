package com.orvenadigital.create.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.orvenadigital.create.core.model.ComponentCatalog
import com.orvenadigital.create.core.model.Picture
import com.orvenadigital.create.core.model.PictureSource
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.ShapeKind
import com.orvenadigital.create.core.model.addPicture
import com.orvenadigital.create.core.model.allSprites
import com.orvenadigital.create.core.model.allComponents
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.runtime.PictureThumb
import com.orvenadigital.create.runtime.parseColorOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.max

/** Ready-made pictures: emoji by theme. */
val EMOJI_GROUPS: List<Pair<String, List<String>>> = listOf(
    "Персонажи" to listOf("😀", "😎", "🤖", "👾", "👻", "🤡", "🥷", "🧙", "🧛", "🧟", "🦸", "👸", "🤴", "👮", "🧑‍🚀", "💀", "👽", "🎃"),
    "Животные" to listOf("🐱", "🐶", "🐸", "🐵", "🦊", "🐼", "🐨", "🐯", "🦁", "🐷", "🐮", "🐔", "🐧", "🐦", "🦄", "🐝", "🐞", "🦋", "🐢", "🐍", "🐙", "🦀", "🐟", "🐬", "🐳", "🦈", "🐊", "🦖", "🐉", "🦇"),
    "Еда" to listOf("🍎", "🍌", "🍒", "🍓", "🍉", "🍇", "🍕", "🍔", "🍟", "🍩", "🍪", "🎂", "🍭", "🍬", "🥕", "🧀", "🍦"),
    "Природа" to listOf("🌳", "🌲", "🌵", "🌸", "🌻", "🍄", "🌞", "🌙", "⭐", "☁️", "🌈", "❄️", "🔥", "💧", "⚡", "🌊", "🏔️", "🪨"),
    "Предметы" to listOf("⚽", "🏀", "🎈", "🎁", "💎", "💰", "🔑", "🧱", "🪙", "🎯", "🏆", "🎮", "🚩", "💣", "🛡️", "⚔️", "🔨", "🪄", "📦", "🔔"),
    "Транспорт" to listOf("🚗", "🚕", "🚌", "🚓", "🚑", "🚒", "🏎️", "🚀", "🛸", "✈️", "🚁", "⛵", "🚂", "🚲", "🛹"),
    "Знаки" to listOf("❤️", "💛", "💚", "💙", "💜", "✔️", "❌", "❓", "❗", "➕", "➖", "⬆️", "⬇️", "⬅️", "➡️", "💯", "🔴", "🟢", "🔵", "⏸️", "▶️"),
)

/** Adds a picture to the project and hands it back (computed from the current project). */
fun createPicture(project: Project, onEdit: ((Project) -> Project) -> Unit, name: String, source: PictureSource): Picture {
    val picture = project.addPicture(name, source).second
    onEdit { p -> if (p.pictures.any { it.id == picture.id }) p else p.copy(pictures = p.pictures + picture) }
    return picture
}

/** Reads a photo from the gallery, scales it down and stores it as PNG. */
private suspend fun importPhoto(context: Context, uri: Uri): PictureSource.Photo? = withContext(Dispatchers.IO) {
    try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 256) sample *= 2
        val bitmap = context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return@withContext null
        val scale = 256f / max(bitmap.width, bitmap.height).coerceAtLeast(1)
        val scaled = if (scale < 1f) {
            Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt().coerceAtLeast(1), (bitmap.height * scale).toInt().coerceAtLeast(1), true)
        } else {
            bitmap
        }
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.PNG, 100, out)
        val longest = max(scaled.width, scaled.height).toDouble()
        PictureSource.Photo(
            pngBase64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP),
            width = 96.0 * scaled.width / longest,
            height = 96.0 * scaled.height / longest,
        )
    } catch (e: Exception) {
        null
    }
}

/** The three ways to make a picture: draw, ready-made, photo. Calls [onCreated] with the new picture. */
@Composable
fun NewPictureButtons(project: Project, onEdit: ((Project) -> Project) -> Unit, onCreated: (Picture) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var drawing by remember { mutableStateOf(false) }
    var ready by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            scope.launch {
                val photo = importPhoto(context, uri)
                if (photo == null) {
                    Toast.makeText(context, "Не получилось открыть картинку", Toast.LENGTH_SHORT).show()
                } else {
                    onCreated(createPicture(project, onEdit, "Фото", photo))
                }
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        FilledTonalButton(onClick = { drawing = true }, modifier = Modifier.weight(1f)) { Text("✏️ Нарисовать") }
        FilledTonalButton(onClick = { ready = true }, modifier = Modifier.weight(1f)) { Text("🙂 Готовые") }
        FilledTonalButton(
            onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            modifier = Modifier.weight(1f),
        ) { Text("🖼 Фото") }
    }
    if (drawing) {
        PaintEditorDialog(initial = null, onDismiss = { drawing = false }) { source ->
            drawing = false
            onCreated(createPicture(project, onEdit, "Рисунок", source))
        }
    }
    if (ready) {
        ReadyPicturesDialog(onDismiss = { ready = false }) { name, source ->
            ready = false
            onCreated(createPicture(project, onEdit, name, source))
        }
    }
}

/** Pick a picture from the library or make a new one. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PicturePickerSheet(
    title: String,
    project: Project,
    onEdit: ((Project) -> Project) -> Unit,
    onPick: (Picture) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).navigationBarsPadding()) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(10.dp))
            NewPictureButtons(project, onEdit) { onPick(it); onDismiss() }
            Spacer(Modifier.height(12.dp))
            if (project.pictures.isEmpty()) {
                Text("В проекте пока нет картинок. Нарисуй или возьми готовую.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text("Мои картинки", fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                FlowRow(
                    modifier = Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    project.pictures.forEach { picture ->
                        PictureTile(picture) { onPick(picture); onDismiss() }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun PictureTile(picture: Picture, selected: Boolean = false, onClick: () -> Unit) {
    Column(
        Modifier
            .width(84.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(if (selected) 3.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else Color(0xFFDEE2E6), RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        PictureThumb(picture, Modifier.size(60.dp).background(Color(0xFFF8F9FA), RoundedCornerShape(8.dp)))
        Text(picture.name, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Emoji gallery and shape maker. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReadyPicturesDialog(onDismiss: () -> Unit, onPick: (String, PictureSource) -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    var shape by remember { mutableStateOf(ShapeKind.ROUNDED) }
    var color by remember { mutableStateOf("#5B3DF5") }
    var width by remember { mutableStateOf("64") }
    var height by remember { mutableStateOf("64") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Готовые картинки") },
        text = {
            Column {
                TabRow(selectedTabIndex = tab) {
                    Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Эмодзи") })
                    Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Фигуры") })
                }
                Spacer(Modifier.height(8.dp))
                Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState())) {
                    if (tab == 0) {
                        EMOJI_GROUPS.forEach { (group, emojis) ->
                            Text(group, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
                            FlowRow {
                                emojis.forEach { e ->
                                    Box(
                                        Modifier.size(46.dp).clip(RoundedCornerShape(8.dp)).clickable { onPick(e, PictureSource.Emoji(e)) },
                                        contentAlignment = Alignment.Center,
                                    ) { Text(e, fontSize = 28.sp) }
                                }
                            }
                        }
                    } else {
                        val w = width.toDoubleOrNull()?.coerceIn(4.0, 2000.0) ?: 64.0
                        val h = height.toDoubleOrNull()?.coerceIn(4.0, 2000.0) ?: 64.0
                        val preview = Picture("preview", "preview", PictureSource.Shape(shape, color, w, h))
                        PictureThumb(preview, Modifier.fillMaxWidth().height(90.dp))
                        Spacer(Modifier.height(8.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            ShapeKind.entries.forEach { k ->
                                if (k == shape) Button(onClick = { shape = k }) { Text(k.label) }
                                else OutlinedButton(onClick = { shape = k }) { Text(k.label) }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        ColorRow(color) { color = it }
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(width, { v -> width = v.filter { it.isDigit() }.take(4) }, label = { Text("Ширина") }, singleLine = true, modifier = Modifier.weight(1f))
                            OutlinedTextField(height, { v -> height = v.filter { it.isDigit() }.take(4) }, label = { Text("Высота") }, singleLine = true, modifier = Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { onPick(shape.label, PictureSource.Shape(shape, color, w, h)) }, modifier = Modifier.fillMaxWidth()) {
                            Text("Добавить фигуру")
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Закрыть") } },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ColorRow(value: String, colors: List<String> = ComponentCatalog.PALETTE + listOf("#A0522D", "#2F9E44", "#F03E3E"), onPick: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        colors.forEach { hex ->
            val selected = value.equals(hex, ignoreCase = true)
            Box(
                Modifier
                    .size(32.dp)
                    .border(if (selected) 3.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else Color(0xFFCED4DA), RoundedCornerShape(16.dp))
                    .padding(3.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(parseColorOrNull(hex) ?: Color.White)
                    .clickable { onPick(hex) },
            )
        }
    }
}

/** Full-screen library of the project's pictures: add, rename, redraw, delete. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PictureLibraryScreen(project: Project, onEdit: ((Project) -> Project) -> Unit, onClose: () -> Unit) {
    var selected by remember { mutableStateOf<Picture?>(null) }
    var renaming by remember { mutableStateOf<Picture?>(null) }
    var redrawing by remember { mutableStateOf<Picture?>(null) }
    androidx.activity.compose.BackHandler(onBack = onClose)
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Картинки проекта") },
                navigationIcon = { IconButton(onClick = onClose) { Icon(Icons.Default.Close, contentDescription = "Закрыть") } },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
            Text(
                "Картинки — это костюмы спрайтов и рисунки для детальки «Картинка». Можно нарисовать свою, взять готовую или загрузить фото.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
            NewPictureButtons(project, onEdit) {}
            Spacer(Modifier.height(16.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                project.pictures.forEach { picture -> PictureTile(picture) { selected = picture } }
            }
        }
    }
    selected?.let { picture ->
        val usedBy = project.allSprites().count { picture.id in it.costumes } +
            project.allComponents().count { it.props[Props.PICTURE] == picture.id }
        ChoiceDialog(
            title = picture.name,
            options = buildList<Pair<String, () -> Unit>> {
                add("Переименовать" to { renaming = picture })
                if (picture.source is PictureSource.Drawing) add("Перерисовать" to { redrawing = picture })
                add("Удалить" + (if (usedBy > 0) " (используется: $usedBy)" else "") to {
                    onEdit { p ->
                        p.copy(
                            pictures = p.pictures.filter { it.id != picture.id },
                        )
                    }
                })
            },
            onDismiss = { selected = null },
        )
    }
    renaming?.let { picture ->
        TextInputDialog(
            title = "Новое имя",
            initial = picture.name,
            label = "Имя",
            validate = { v -> if (v.isEmpty()) "Пустое имя" else if (project.pictures.any { it.name == v && it.id != picture.id }) "Такое уже есть" else null },
            onDone = { v -> onEdit { p -> p.copy(pictures = p.pictures.map { if (it.id == picture.id) it.copy(name = v) else it }) } },
            onDismiss = { renaming = null },
        )
    }
    redrawing?.let { picture ->
        PaintEditorDialog(initial = picture.source as? PictureSource.Drawing, onDismiss = { redrawing = null }) { source ->
            redrawing = null
            onEdit { p -> p.copy(pictures = p.pictures.map { if (it.id == picture.id) it.copy(source = source) else it }) }
        }
    }
}
