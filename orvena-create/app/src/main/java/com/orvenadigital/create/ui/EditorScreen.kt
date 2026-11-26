package com.orvenadigital.create.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.ProjectFactory
import com.orvenadigital.create.data.ProjectRepository
import com.orvenadigital.create.runtime.AndroidPlatform
import com.orvenadigital.create.runtime.ProjectRuntime
import com.orvenadigital.create.runtime.ProjectView
import com.orvenadigital.create.runtime.RuntimeTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

@Composable
fun EditorScreen(repository: ProjectRepository, projectId: String, onClose: () -> Unit) {
    var project by remember(projectId) { mutableStateOf(repository.load(projectId)) }
    val current = project
    if (current == null) {
        LaunchedEffect(Unit) { onClose() }
        return
    }

    // Autosave shortly after every change, and once more when leaving the editor.
    LaunchedEffect(current) {
        delay(500)
        withContext(Dispatchers.IO) { repository.save(current) }
    }
    val latest by rememberUpdatedState(current)
    DisposableEffect(projectId) {
        onDispose { repository.save(latest) }
    }

    var running by remember { mutableStateOf(false) }
    var pictures by remember { mutableStateOf(false) }
    val onEdit: ((Project) -> Project) -> Unit = { transform -> project = project?.let(transform) }
    BackHandler(onBack = onClose)

    when {
        running -> RunScreen(current, onClose = { running = false })
        pictures -> PictureLibraryScreen(current, onEdit, onClose = { pictures = false })
        else -> EditorContent(
            project = current,
            onEdit = onEdit,
            onRun = { running = true },
            onPictures = { pictures = true },
            onClose = onClose,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditorContent(
    project: Project,
    onEdit: ((Project) -> Project) -> Unit,
    onRun: () -> Unit,
    onPictures: () -> Unit,
    onClose: () -> Unit,
) {
    var screenId by rememberSaveable { mutableStateOf(project.screens.first().id) }
    val screen = project.screens.firstOrNull { it.id == screenId } ?: project.screens.first()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var exporting by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(project.name, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                },
                actions = {
                    IconButton(onClick = onPictures) { Icon(Icons.Default.Face, contentDescription = "Картинки") }
                    IconButton(onClick = onRun) { Icon(Icons.Default.PlayArrow, contentDescription = "Запустить") }
                    IconButton(onClick = { exporting = true }) { Icon(Icons.Default.Build, contentDescription = "Собрать APK") }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            ScreenSelector(
                project = project,
                selectedId = screen.id,
                onSelect = { screenId = it },
                onEdit = onEdit,
            )
            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Дизайн") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Блоки") })
            }
            Box(Modifier.weight(1f)) {
                when (tab) {
                    0 -> DesignerTab(project, screen, onEdit)
                    else -> BlocksTab(project, screen, onEdit)
                }
            }
        }
    }

    if (exporting) {
        ExportDialog(project = project, onEdit = onEdit, onDismiss = { exporting = false })
    }
}

@Composable
private fun ScreenSelector(
    project: Project,
    selectedId: String,
    onSelect: (String) -> Unit,
    onEdit: ((Project) -> Project) -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    var nameDialog by remember { mutableStateOf<String?>(null) } // "new" or a screen id to rename
    val selected = project.screens.first { it.id == selectedId }

    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box {
            TextButton(onClick = { menu = true }) {
                Text("Экран: ${selected.name}")
                Icon(Icons.Default.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                project.screens.forEach { s ->
                    DropdownMenuItem(text = { Text(s.name) }, onClick = { menu = false; onSelect(s.id) })
                }
                HorizontalDivider()
                DropdownMenuItem(text = { Text("＋ Новый экран") }, onClick = { menu = false; nameDialog = "new" })
                DropdownMenuItem(text = { Text("Переименовать «${selected.name}»") }, onClick = { menu = false; nameDialog = selected.id })
                if (project.screens.size > 1) {
                    DropdownMenuItem(
                        text = { Text("Удалить «${selected.name}»", color = MaterialTheme.colorScheme.error) },
                        onClick = {
                            menu = false
                            val removedId = selected.id
                            onSelect(project.screens.first { it.id != removedId }.id)
                            onEdit { p -> p.copy(screens = p.screens.filter { it.id != removedId }) }
                        },
                    )
                }
            }
        }
    }

    nameDialog?.let { target ->
        var name by remember(target) {
            mutableStateOf(if (target == "new") "Экран ${project.screens.size + 1}" else selected.name)
        }
        AlertDialog(
            onDismissRequest = { nameDialog = null },
            title = { Text(if (target == "new") "Новый экран" else "Переименовать экран") },
            text = {
                OutlinedTextField(value = name, onValueChange = { name = it.take(40) }, singleLine = true, label = { Text("Название") })
            },
            confirmButton = {
                TextButton(enabled = name.isNotBlank(), onClick = {
                    nameDialog = null
                    if (target == "new") {
                        val screen = ProjectFactory.newScreen(project, name.trim())
                        onEdit { p -> p.copy(screens = p.screens + screen) }
                        onSelect(screen.id)
                    } else {
                        val newName = name.trim()
                        onEdit { p -> p.copy(screens = p.screens.map { if (it.id == target) it.copy(name = newName) else it }) }
                    }
                }) { Text("Готово") }
            },
            dismissButton = { TextButton(onClick = { nameDialog = null }) { Text("Отмена") } },
        )
    }
}

/** Full-screen run of the project, exactly like the exported app (minus the splash). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RunScreen(project: Project, onClose: () -> Unit) {
    val context = LocalContext.current
    val runtime = remember(project) {
        ProjectRuntime(project, platform = AndroidPlatform(context))
    }
    BackHandler(onBack = onClose)
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Запуск: ${project.name}", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onClose) { Icon(Icons.Default.Close, contentDescription = "Закрыть") }
                },
                actions = {
                    IconButton(onClick = { runtime.restart() }) { Icon(Icons.Default.Refresh, contentDescription = "Перезапустить") }
                },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            RuntimeTheme(project) {
                ProjectView(runtime, Modifier.fillMaxSize())
            }
        }
    }
}
