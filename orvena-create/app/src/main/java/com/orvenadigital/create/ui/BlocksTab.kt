package com.orvenadigital.create.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.orvenadigital.create.core.model.Action
import com.orvenadigital.create.core.model.CompareOp
import com.orvenadigital.create.core.model.ComponentCatalog
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Expr
import com.orvenadigital.create.core.model.Ids
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.core.model.Screen
import com.orvenadigital.create.core.model.Script
import com.orvenadigital.create.core.model.Variable
import com.orvenadigital.create.core.model.updateScreen

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BlocksTab(project: Project, screen: Screen, onEdit: ((Project) -> Project) -> Unit) {
    val ctx = BlockContext(
        project = project,
        screen = screen,
        addVariable = { name ->
            onEdit { p -> if (p.variables.any { it.name == name }) p else p.copy(variables = p.variables + Variable(name)) }
        },
    )
    fun editScripts(transform: (List<Script>) -> List<Script>) =
        onEdit { p -> p.updateScreen(screen.id) { it.copy(scripts = transform(it.scripts)) } }

    var addEvent by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { VariablesBar(ctx, onEdit) }
        if (screen.scripts.isEmpty()) {
            item {
                Text(
                    "Здесь живёт логика экрана. Начни с события: «Когда нажата кнопка…», и прицепи к нему блоки.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(screen.scripts, key = { it.id }) { script ->
            ScriptBlock(
                ctx = ctx,
                script = script,
                onChange = { updated -> editScripts { list -> list.map { if (it.id == updated.id) updated else it } } },
                onDelete = { editScripts { list -> list.filter { it.id != script.id } } },
            )
        }
        item {
            Button(onClick = { addEvent = true }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.Add, contentDescription = null)
                Text(" Событие")
            }
        }
    }

    if (addEvent) {
        ChoiceDialog(
            title = "Когда запускать блоки?",
            options = eventOptions(ctx).map { (label, event) ->
                label to { editScripts { it + Script(Ids.random("s"), event) } }
            },
            onDismiss = { addEvent = false },
        )
    }
}

private fun eventOptions(ctx: BlockContext): List<Pair<String, Event>> {
    val out = mutableListOf<Pair<String, Event>>("Когда экран открыт" to Event.ScreenOpened)
    ctx.components.forEach { c ->
        when (c.type) {
            ComponentType.BUTTON -> out += "Когда нажата ${c.id}" to Event.Clicked(c.id)
            ComponentType.INPUT -> out += "Когда меняется текст в ${c.id}" to Event.TextChanged(c.id)
            ComponentType.CHECKBOX -> out += "Когда переключён ${c.id}" to Event.CheckedChanged(c.id)
            else -> Unit
        }
    }
    return out
}

private fun eventLabel(event: Event): String = when (event) {
    Event.ScreenOpened -> "Когда экран открыт"
    is Event.Clicked -> "Когда нажата ${event.componentId}"
    is Event.TextChanged -> "Когда меняется текст в ${event.componentId}"
    is Event.CheckedChanged -> "Когда переключён ${event.componentId}"
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun VariablesBar(ctx: BlockContext, onEdit: ((Project) -> Project) -> Unit) {
    var adding by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Variable?>(null) }
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BrickColors.variable.copy(alpha = 0.10f))
            .padding(10.dp),
    ) {
        Text("Переменные: память приложения", fontWeight = FontWeight.SemiBold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ctx.project.variables.forEach { v ->
                Chip("${v.name} = ${v.initial}", BrickColors.variable, Color.White) { selected = v }
            }
            Chip("＋ переменная", Color.White) { adding = true }
        }
    }
    if (adding) NewVariableDialog(ctx, onDismiss = { adding = false }, onCreated = {})
    selected?.let { v ->
        var editingInitial by remember(v) { mutableStateOf(false) }
        if (editingInitial) {
            TextInputDialog(
                title = "Начальное значение ${v.name}",
                initial = v.initial,
                label = "Значение",
                onDone = { value ->
                    onEdit { p -> p.copy(variables = p.variables.map { if (it.name == v.name) it.copy(initial = value) else it }) }
                },
                onDismiss = { selected = null },
            )
        } else {
            ChoiceDialog(
                title = v.name,
                options = listOf(
                    "Изменить начальное значение" to { selected = v; editingInitial = true },
                    "Удалить переменную" to { onEdit { p -> p.copy(variables = p.variables.filter { it.name != v.name }) } },
                ),
                onDismiss = { if (!editingInitial) selected = null },
            )
        }
    }
}

@Composable
private fun ScriptBlock(ctx: BlockContext, script: Script, onChange: (Script) -> Unit, onDelete: () -> Unit) {
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(BrickColors.event.copy(alpha = 0.10f))
            .border(1.dp, BrickColors.event, RoundedCornerShape(14.dp)),
    ) {
        Row(Modifier.fillMaxWidth().background(BrickColors.event).padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                eventLabel(script.event),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f).padding(vertical = 10.dp),
            )
            IconButton(onClick = onDelete) { Icon(Icons.Default.Delete, contentDescription = "Удалить событие", tint = Color.White) }
        }
        Box(Modifier.padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 8.dp)) {
            ActionList(ctx, script.actions) { onChange(script.copy(actions = it)) }
        }
    }
}

@Composable
private fun ActionList(ctx: BlockContext, actions: List<Action>, onChange: (List<Action>) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        actions.forEachIndexed { i, action ->
            ActionBlock(
                ctx = ctx,
                action = action,
                onChange = { onChange(actions.replaceAt(i, it)) },
                onDelete = { onChange(actions.without(i)) },
                onMoveUp = if (i > 0) ({ onChange(actions.swap(i, i - 1)) }) else null,
                onMoveDown = if (i < actions.lastIndex) ({ onChange(actions.swap(i, i + 1)) }) else null,
            )
        }
        AddActionButton(ctx) { onChange(actions + it) }
    }
}

private fun actionColor(action: Action): Color = when (action) {
    is Action.SetProperty -> BrickColors.property
    is Action.SetVariable, is Action.ChangeVariable -> BrickColors.variable
    is Action.ShowMessage, is Action.OpenScreen, Action.GoBack -> BrickColors.navigation
    is Action.If, is Action.Repeat -> BrickColors.control
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ActionBlock(
    ctx: BlockContext,
    action: Action,
    onChange: (Action) -> Unit,
    onDelete: () -> Unit,
    onMoveUp: (() -> Unit)?,
    onMoveDown: (() -> Unit)?,
) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(actionColor(action))) {
        Row(verticalAlignment = Alignment.Top) {
            FlowRow(
                modifier = Modifier.weight(1f).padding(start = 10.dp, top = 6.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                ActionContent(ctx, action, onChange)
            }
            BlockMenu(onDelete, onMoveUp, onMoveDown)
        }
        when (action) {
            is Action.If -> {
                NestedList(ctx, action.then) { onChange(action.copy(then = it)) }
                Text("иначе", color = Color.White, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 10.dp, bottom = 4.dp))
                NestedList(ctx, action.otherwise) { onChange(action.copy(otherwise = it)) }
            }
            is Action.Repeat -> NestedList(ctx, action.body) { onChange(action.copy(body = it)) }
            else -> Unit
        }
    }
}

@Composable
private fun NestedList(ctx: BlockContext, actions: List<Action>, onChange: (List<Action>) -> Unit) {
    Box(
        Modifier.fillMaxWidth()
            .padding(start = 14.dp, end = 6.dp, bottom = 6.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White.copy(alpha = 0.85f))
            .padding(6.dp),
    ) {
        ActionList(ctx, actions, onChange)
    }
}

@Composable
private fun ActionContent(ctx: BlockContext, action: Action, onChange: (Action) -> Unit) {
    when (action) {
        is Action.SetProperty -> {
            BlockLabel("установить")
            ComponentChip(ctx, action.componentId) { id ->
                onChange(action.copy(componentId = id, property = fitProperty(ctx, id, action.property)))
            }
            PropChip(ctx, action.componentId, action.property) { onChange(action.copy(property = it)) }
            BlockLabel("=")
            ExprView(ctx, action.value) { onChange(action.copy(value = it)) }
        }
        is Action.SetVariable -> {
            BlockLabel("задать")
            VariableChip(ctx, action.name) { onChange(action.copy(name = it)) }
            BlockLabel("=")
            ExprView(ctx, action.value) { onChange(action.copy(value = it)) }
        }
        is Action.ChangeVariable -> {
            BlockLabel("изменить")
            VariableChip(ctx, action.name) { onChange(action.copy(name = it)) }
            BlockLabel("на")
            ExprView(ctx, action.by) { onChange(action.copy(by = it)) }
        }
        is Action.ShowMessage -> {
            BlockLabel("показать сообщение")
            ExprView(ctx, action.message) { onChange(action.copy(message = it)) }
        }
        is Action.OpenScreen -> {
            BlockLabel("открыть экран")
            ScreenChip(ctx, action.screenId) { onChange(action.copy(screenId = it)) }
        }
        Action.GoBack -> BlockLabel("вернуться на прошлый экран")
        is Action.If -> {
            BlockLabel("если")
            ExprView(ctx, action.condition) { onChange(action.copy(condition = it)) }
            BlockLabel("то")
        }
        is Action.Repeat -> {
            BlockLabel("повторить")
            ExprView(ctx, action.times) { onChange(action.copy(times = it)) }
            BlockLabel("раз")
        }
    }
}

@Composable
private fun BlockMenu(onDelete: () -> Unit, onMoveUp: (() -> Unit)?, onMoveDown: (() -> Unit)?) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Default.MoreVert, contentDescription = "Ещё", tint = Color.White) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (onMoveUp != null) DropdownMenuItem(text = { Text("Выше") }, onClick = { open = false; onMoveUp() })
            if (onMoveDown != null) DropdownMenuItem(text = { Text("Ниже") }, onClick = { open = false; onMoveDown() })
            DropdownMenuItem(text = { Text("Удалить", color = MaterialTheme.colorScheme.error) }, onClick = { open = false; onDelete() })
        }
    }
}

@Composable
private fun AddActionButton(ctx: BlockContext, onAdd: (Action) -> Unit) {
    var open by remember { mutableStateOf(false) }
    TextButton(onClick = { open = true }) { Text("＋ блок") }
    if (open) {
        ChoiceDialog(
            title = "Какой блок прицепить?",
            options = actionTemplates(ctx).map { (label, make) -> label to { onAdd(make()) } },
            onDismiss = { open = false },
        )
    }
}

private fun actionTemplates(ctx: BlockContext): List<Pair<String, () -> Action>> {
    val target = ctx.components.firstOrNull { it.type == ComponentType.TEXT }
        ?: ctx.components.firstOrNull { it.id != ctx.screen.root.id }
    val variable = ctx.project.variables.firstOrNull()?.name ?: ""
    val otherScreen = ctx.project.screens.firstOrNull { it.id != ctx.screen.id }?.id ?: ctx.screen.id
    return listOf(
        "Установить свойство детальки" to {
            Action.SetProperty(target?.id ?: "", target?.let { ComponentCatalog.mainProp(it.type) } ?: Props.TEXT, Expr.Text("Привет"))
        },
        "Задать переменную" to { Action.SetVariable(variable, Expr.Num(0.0)) },
        "Изменить переменную на…" to { Action.ChangeVariable(variable, Expr.Num(1.0)) },
        "Показать сообщение" to { Action.ShowMessage(Expr.Text("Привет!")) },
        "Открыть экран" to { Action.OpenScreen(otherScreen) },
        "Вернуться назад" to { Action.GoBack },
        "Если … то … иначе" to { Action.If(Expr.Compare(CompareOp.EQ, Expr.Num(1.0), Expr.Num(1.0))) },
        "Повторить N раз" to { Action.Repeat(Expr.Num(3.0)) },
    )
}
