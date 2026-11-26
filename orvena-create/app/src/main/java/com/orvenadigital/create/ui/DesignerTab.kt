package com.orvenadigital.create.ui

import android.widget.Toast
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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.ComponentCatalog
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.ProjectFactory
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.core.model.Screen
import com.orvenadigital.create.core.model.addChild
import com.orvenadigital.create.core.model.find
import com.orvenadigital.create.core.model.move
import com.orvenadigital.create.core.model.remove
import com.orvenadigital.create.core.model.update
import com.orvenadigital.create.core.model.updateScreen
import com.orvenadigital.create.runtime.ProjectRuntime
import com.orvenadigital.create.runtime.ProjectView
import com.orvenadigital.create.runtime.RuntimeTheme

private data class TreeRow(val component: Component, val depth: Int, val index: Int, val siblings: Int)

private fun flatten(root: Component): List<TreeRow> {
    val out = ArrayList<TreeRow>()
    fun walk(c: Component, depth: Int, index: Int, siblings: Int) {
        out += TreeRow(c, depth, index, siblings)
        c.children.forEachIndexed { i, child -> walk(child, depth + 1, i, c.children.size) }
    }
    walk(root, 0, 0, 1)
    return out
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DesignerTab(project: Project, screen: Screen, onEdit: ((Project) -> Project) -> Unit) {
    var editingId by remember(screen.id) { mutableStateOf<String?>(null) }
    var addToId by remember(screen.id) { mutableStateOf<String?>(null) }

    fun updateRoot(transform: (Component) -> Component) =
        onEdit { p -> p.updateScreen(screen.id) { it.copy(root = transform(it.root)) } }

    Column(Modifier.fillMaxSize()) {
        PreviewFrame(project, screen, Modifier.fillMaxWidth().weight(0.42f))
        HorizontalDivider()
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(0.58f),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            item {
                Text(
                    "Детальки экрана: нажми, чтобы настроить. ＋ кладёт новую внутрь контейнера.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(4.dp),
                )
            }
            items(flatten(screen.root), key = { it.component.id }) { row ->
                BrickRow(
                    row = row,
                    isRoot = row.component.id == screen.root.id,
                    onClick = { editingId = row.component.id },
                    onAdd = { addToId = row.component.id },
                    onMove = { delta -> updateRoot { it.move(row.component.id, delta) } },
                    onDelete = { updateRoot { it.remove(row.component.id) } },
                )
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

    editingId?.let { id ->
        val component = screen.root.find(id)
        if (component == null) {
            androidx.compose.runtime.LaunchedEffect(id) { editingId = null }
        } else {
            ModalBottomSheet(onDismissRequest = { editingId = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
                PropertyEditor(
                    component = component,
                    onChange = { updated -> updateRoot { root -> root.update(id) { it.copy(props = updated.props) } } },
                )
            }
        }
    }
}

@Composable
private fun PreviewFrame(project: Project, screen: Screen, modifier: Modifier) {
    val context = LocalContext.current
    val runtime = remember(project, screen.id) {
        ProjectRuntime(project, startScreenId = screen.id) { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() }
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
    row: TreeRow,
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
            val preview = c.props[Props.TEXT] ?: c.props[Props.HINT]
            if (!preview.isNullOrEmpty()) {
                Text(preview, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (ComponentCatalog.isContainer(c.type)) {
            SmallIcon(onAdd) { Icon(Icons.Default.Add, contentDescription = "Добавить внутрь", tint = color) }
        }
        if (!isRoot) {
            SmallIcon({ onMove(-1) }, enabled = row.index > 0) { Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Выше") }
            SmallIcon({ onMove(1) }, enabled = row.index < row.siblings - 1) { Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Ниже") }
            SmallIcon(onDelete) { Icon(Icons.Default.Delete, contentDescription = "Удалить") }
        }
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
