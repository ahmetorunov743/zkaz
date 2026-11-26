package com.orvenadigital.create.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orvenadigital.create.core.engine.formatNumber
import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.ComponentCatalog
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.core.model.PhysicsType
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.ProjectFactory
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.core.model.RotationStyle
import com.orvenadigital.create.core.model.Screen
import com.orvenadigital.create.core.model.Sprite
import com.orvenadigital.create.core.model.addChild
import com.orvenadigital.create.core.model.addSprite
import com.orvenadigital.create.core.model.find
import com.orvenadigital.create.core.model.findSprite
import com.orvenadigital.create.core.model.move
import com.orvenadigital.create.core.model.moveSprite
import com.orvenadigital.create.core.model.nextSpriteId
import com.orvenadigital.create.core.model.picture
import com.orvenadigital.create.core.model.remove
import com.orvenadigital.create.core.model.removeSprite
import com.orvenadigital.create.core.model.update
import com.orvenadigital.create.core.model.updateScreen
import com.orvenadigital.create.core.model.updateSprite
import com.orvenadigital.create.runtime.AndroidPlatform
import com.orvenadigital.create.runtime.PictureThumb
import com.orvenadigital.create.runtime.ProjectRuntime
import com.orvenadigital.create.runtime.ProjectView
import com.orvenadigital.create.runtime.RuntimeTheme

private sealed interface DesignRow {
    val key: String

    data class Brick(val component: Component, val depth: Int, val index: Int, val siblings: Int) : DesignRow {
        override val key get() = "c_" + component.id
    }

    data class SpriteRow(val sprite: Sprite, val depth: Int, val index: Int, val siblings: Int) : DesignRow {
        override val key get() = "s_" + sprite.id
    }
}

private fun flatten(root: Component): List<DesignRow> {
    val out = ArrayList<DesignRow>()
    fun walk(c: Component, depth: Int, index: Int, siblings: Int) {
        out += DesignRow.Brick(c, depth, index, siblings)
        c.sprites.forEachIndexed { i, s -> out += DesignRow.SpriteRow(s, depth + 1, i, c.sprites.size) }
        c.children.forEachIndexed { i, child -> walk(child, depth + 1, i, c.children.size) }
    }
    walk(root, 0, 0, 1)
    return out
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DesignerTab(project: Project, screen: Screen, onEdit: ((Project) -> Project) -> Unit) {
    var editingId by remember(screen.id) { mutableStateOf<String?>(null) }
    var editingSpriteId by remember(screen.id) { mutableStateOf<String?>(null) }
    var addToId by remember(screen.id) { mutableStateOf<String?>(null) }
    var spriteForStage by remember(screen.id) { mutableStateOf<String?>(null) }

    fun updateRoot(transform: (Component) -> Component) =
        onEdit { p -> p.updateScreen(screen.id) { it.copy(root = transform(it.root)) } }

    Column(Modifier.fillMaxSize()) {
        PreviewFrame(project, screen, Modifier.fillMaxWidth().weight(0.42f))
        HorizontalDivider()
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(0.58f),
            contentPadding = PaddingValues(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            item {
                Text(
                    "Детальки экрана: нажми, чтобы настроить. ＋ кладёт новую внутрь. В «Игровую сцену» ＋ добавляет спрайт.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(4.dp),
                )
            }
            items(flatten(screen.root), key = { it.key }) { row ->
                when (row) {
                    is DesignRow.Brick -> BrickRow(
                        row = row,
                        isRoot = row.component.id == screen.root.id,
                        onClick = { editingId = row.component.id },
                        onAdd = {
                            if (row.component.type == ComponentType.STAGE) spriteForStage = row.component.id else addToId = row.component.id
                        },
                        onMove = { delta -> updateRoot { it.move(row.component.id, delta) } },
                        onDelete = { updateRoot { it.remove(row.component.id) } },
                    )
                    is DesignRow.SpriteRow -> SpriteRowView(
                        project = project,
                        row = row,
                        onClick = { editingSpriteId = row.sprite.id },
                        onMove = { delta -> onEdit { it.moveSprite(row.sprite.id, delta) } },
                        onDelete = { onEdit { it.removeSprite(row.sprite.id) } },
                    )
                }
            }
        }
    }

    addToId?.let { parentId ->
        ModalBottomSheet(onDismissRequest = { addToId = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            BrickPalette(onPick = { type ->
                val brick = ProjectFactory.component(project, type)
                updateRoot { it.addChild(parentId, brick) }
                addToId = null
                editingId = brick.id
            })
        }
    }

    spriteForStage?.let { stageId ->
        PicturePickerSheet(
            title = "Костюм нового спрайта",
            project = project,
            onEdit = onEdit,
            onPick = { picture ->
                val sprite = Sprite(id = project.nextSpriteId(), name = picture.name, costumes = listOf(picture.id))
                onEdit { it.addSprite(stageId, sprite) }
                editingSpriteId = sprite.id
            },
            onDismiss = { spriteForStage = null },
        )
    }

    editingId?.let { id ->
        val component = screen.root.find(id)
        if (component == null) {
            LaunchedEffect(id) { editingId = null }
        } else {
            ModalBottomSheet(onDismissRequest = { editingId = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
                PropertyEditor(
                    project = project,
                    component = component,
                    onEdit = onEdit,
                    onChange = { updated -> updateRoot { root -> root.update(id) { it.copy(props = updated.props) } } },
                )
            }
        }
    }

    editingSpriteId?.let { id ->
        val sprite = project.findSprite(id)
        if (sprite == null) {
            LaunchedEffect(id) { editingSpriteId = null }
        } else {
            ModalBottomSheet(onDismissRequest = { editingSpriteId = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
                SpriteEditor(project, sprite, onEdit) { transform -> onEdit { it.updateSprite(id, transform) } }
            }
        }
    }
}

@Composable
private fun PreviewFrame(project: Project, screen: Screen, modifier: Modifier) {
    val context = LocalContext.current
    val runtime = remember(project, screen.id) {
        ProjectRuntime(project, startScreenId = screen.id, platform = AndroidPlatform(context))
    }
    Box(modifier.background(Color(0xFFF1F3F5)).padding(10.dp)) {
        Box(
            Modifier.fillMaxSize()
                .clip(RoundedCornerShape(16.dp))
                .border(2.dp, Color(0xFF343A40), RoundedCornerShape(16.dp)),
        ) {
            RuntimeTheme(project) {
                ProjectView(runtime, Modifier.fillMaxSize(), handleBack = false)
            }
        }
    }
}

@Composable
private fun BrickRow(
    row: DesignRow.Brick,
    isRoot: Boolean,
    onClick: () -> Unit,
    onAdd: () -> Unit,
    onMove: (Int) -> Unit,
    onDelete: () -> Unit,
) {
    val c = row.component
    val color = BrickColors.component(c.type)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = (row.depth * 18).dp)
            .clip(RoundedCornerShape(10.dp))
            .background(color.copy(alpha = 0.12f))
            .clickable(onClick = onClick)
            .height(52.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(8.dp).fillMaxHeight().background(color))
        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
            Text(
                if (isRoot) "Экран (${ComponentCatalog.label(c.type)})" else "${ComponentCatalog.label(c.type)} · ${c.id}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val preview = if (c.type == ComponentType.STAGE) "${c.sprites.size} спрайт(ов)" else c.props[Props.TEXT] ?: c.props[Props.HINT]
            if (!preview.isNullOrEmpty()) {
                Text(preview, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (ComponentCatalog.isContainer(c.type) || c.type == ComponentType.STAGE) {
            SmallIcon(onAdd) {
                Icon(Icons.Default.Add, contentDescription = if (c.type == ComponentType.STAGE) "Добавить спрайт" else "Добавить внутрь", tint = color)
            }
        }
        if (!isRoot) {
            SmallIcon({ onMove(-1) }, enabled = row.index > 0) { Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Выше") }
            SmallIcon({ onMove(1) }, enabled = row.index < row.siblings - 1) { Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Ниже") }
            SmallIcon(onDelete) { Icon(Icons.Default.Delete, contentDescription = "Удалить") }
        }
    }
}

@Composable
private fun SpriteRowView(project: Project, row: DesignRow.SpriteRow, onClick: () -> Unit, onMove: (Int) -> Unit, onDelete: () -> Unit) {
    val s = row.sprite
    val color = Color(0xFF0CA678)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = (row.depth * 18).dp)
            .clip(RoundedCornerShape(10.dp))
            .border(1.dp, color.copy(alpha = 0.5f), RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .height(52.dp)
            .padding(start = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PictureThumb(project.picture(s.costumes.firstOrNull() ?: ""), Modifier.size(36.dp))
        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
            Text("Спрайт «${s.name}»", fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${s.costumes.size} кост. · ${s.physics.label} · ${s.scripts.size} скр.",
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
            )
        }
        SmallIcon({ onMove(-1) }, enabled = row.index > 0) { Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Ниже слоем") }
        SmallIcon({ onMove(1) }, enabled = row.index < row.siblings - 1) { Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Выше слоем") }
        SmallIcon(onDelete) { Icon(Icons.Default.Delete, contentDescription = "Удалить спрайт") }
    }
}

@Composable
private fun SmallIcon(onClick: () -> Unit, enabled: Boolean = true, content: @Composable () -> Unit) {
    IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(36.dp)) { content() }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BrickPalette(onPick: (ComponentType) -> Unit) {
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).navigationBarsPadding(),
    ) {
        Text("Добавить детальку", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(12.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ComponentType.entries.forEach { type ->
                val color = BrickColors.component(type)
                Column(
                    Modifier
                        .width(150.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(color)
                        .clickable { onPick(type) }
                        .padding(12.dp),
                ) {
                    // two studs on top, like a real brick
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        repeat(2) { Box(Modifier.size(width = 18.dp, height = 6.dp).background(Color.White.copy(alpha = 0.6f), RoundedCornerShape(3.dp))) }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(ComponentCatalog.label(type), color = Color.White, fontWeight = FontWeight.Bold)
                    Text(ComponentCatalog.description(type), color = Color.White.copy(alpha = 0.9f), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** Number field that accepts negatives and decimals; reports only valid numbers. */
@Composable
private fun NumberField(label: String, value: Double, modifier: Modifier = Modifier, onValue: (Double) -> Unit) {
    var text by remember { mutableStateOf(formatNumber(value)) }
    OutlinedTextField(
        value = text,
        onValueChange = { v ->
            text = v.filter { it.isDigit() || it == '-' || it == '.' || it == ',' }.take(10)
            text.replace(',', '.').toDoubleOrNull()?.let(onValue)
        },
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier,
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SpriteEditor(project: Project, sprite: Sprite, onEdit: ((Project) -> Project) -> Unit, update: ((Sprite) -> Sprite) -> Unit) {
    var addingCostume by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).imePadding().navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Спрайт", style = MaterialTheme.typography.titleLarge)
        Text(
            "Его блоки — во вкладке «Блоки»: выбери «${sprite.name}» вверху.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = sprite.name,
            onValueChange = { v -> update { it.copy(name = v.take(40)) } },
            label = { Text("Имя") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Text("Костюмы (выделен стартовый, нажми, чтобы сделать стартовым)", fontWeight = FontWeight.Medium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            sprite.costumes.forEachIndexed { i, id ->
                val picture = project.picture(id)
                Box {
                    if (picture != null) {
                        PictureTile(picture, selected = i == 0) {
                            update { s -> s.copy(costumes = listOf(id) + s.costumes.filter { it != id }) }
                        }
                    } else {
                        Text("удалена", modifier = Modifier.padding(12.dp))
                    }
                    Text(
                        "✕",
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFFFA5252))
                            .clickable { update { s -> s.copy(costumes = s.costumes.filterIndexed { j, _ -> j != i }) } }
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                        color = Color.White,
                    )
                }
            }
            OutlinedButton(onClick = { addingCostume = true }) { Text("＋ костюм") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberField("x", sprite.x, Modifier.weight(1f)) { v -> update { it.copy(x = v) } }
            NumberField("y", sprite.y, Modifier.weight(1f)) { v -> update { it.copy(y = v) } }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberField("Размер %", sprite.size, Modifier.weight(1f)) { v -> update { it.copy(size = v.coerceIn(1.0, 2000.0)) } }
            NumberField("Направление", sprite.direction, Modifier.weight(1f)) { v -> update { it.copy(direction = v) } }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Видимый", modifier = Modifier.weight(1f))
            Switch(checked = sprite.visible, onCheckedChange = { v -> update { it.copy(visible = v) } })
        }
        Text("Вращение", fontWeight = FontWeight.Medium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            RotationStyle.entries.forEach { style ->
                if (sprite.rotationStyle == style) {
                    Button(onClick = {}) { Text(style.label) }
                } else {
                    OutlinedButton(onClick = { update { it.copy(rotationStyle = style) } }) { Text(style.label) }
                }
            }
        }
        Text("Физика", fontWeight = FontWeight.Medium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PhysicsType.entries.forEach { type ->
                if (sprite.physics == type) {
                    Button(onClick = {}) { Text(type.label) }
                } else {
                    OutlinedButton(onClick = { update { it.copy(physics = type) } }) { Text(type.label) }
                }
            }
        }
        if (sprite.physics != PhysicsType.NONE) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                NumberField("Упругость %", sprite.bounce, Modifier.weight(1f)) { v -> update { it.copy(bounce = v.coerceIn(0.0, 100.0)) } }
                NumberField("Трение %", sprite.friction, Modifier.weight(1f)) { v -> update { it.copy(friction = v.coerceIn(0.0, 100.0)) } }
            }
            Text(
                "«Падает и толкается» — на спрайт действует гравитация сцены. «Неподвижная опора» стоит на месте, об неё ударяются: земля, стены, платформы.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(24.dp))
    }
    if (addingCostume) {
        PicturePickerSheet(
            title = "Новый костюм",
            project = project,
            onEdit = onEdit,
            onPick = { picture -> update { it.copy(costumes = it.costumes + picture.id) } },
            onDismiss = { addingCostume = false },
        )
    }
}
