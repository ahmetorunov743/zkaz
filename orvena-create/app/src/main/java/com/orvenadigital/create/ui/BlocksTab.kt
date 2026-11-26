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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
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
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Ids
import com.orvenadigital.create.core.model.PhysicsType
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.RotationStyle
import com.orvenadigital.create.core.model.Screen
import com.orvenadigital.create.core.model.Script
import com.orvenadigital.create.core.model.StopMode
import com.orvenadigital.create.core.model.Targets
import com.orvenadigital.create.core.model.Variable
import com.orvenadigital.create.core.model.picture
import com.orvenadigital.create.core.model.sprites
import com.orvenadigital.create.core.model.updateScreen
import com.orvenadigital.create.core.model.updateSprite
import com.orvenadigital.create.runtime.PictureThumb

@Composable
fun BlocksTab(project: Project, screen: Screen, onEdit: ((Project) -> Project) -> Unit) {
    val sprites = screen.sprites()
    var ownerId by remember(screen.id) { mutableStateOf<String?>(null) }
    val owner = sprites.firstOrNull { it.id == ownerId }
    val ctx = BlockContext(project, screen, owner, onEdit)
    val scripts = owner?.scripts ?: screen.scripts

    fun editScripts(transform: (List<Script>) -> List<Script>) = onEdit { p ->
        if (owner == null) {
            p.updateScreen(screen.id) { it.copy(scripts = transform(it.scripts)) }
        } else {
            p.updateSprite(owner.id) { it.copy(scripts = transform(it.scripts)) }
        }
    }

    var addEvent by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (sprites.isNotEmpty()) {
            item {
                OwnerSelector(project, screen, ownerId) { ownerId = it }
            }
        }
        item { DataBar(ctx) }
        if (scripts.isEmpty()) {
            item {
                Text(
                    if (owner == null) {
                        "Здесь логика экрана. Начни с события, например «Когда нажата кнопка…», и прицепи к нему блоки."
                    } else {
                        "Блоки спрайта «${owner.name}». Начни с «Когда экран открыт / игра началась» или «Когда меня нажали»."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(scripts, key = { it.id }) { script ->
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
        BlockPaletteSheet(
            title = "Когда запускать блоки?",
            items = BlockCatalog.visible(BlockCatalog.events, ctx).filterIsInstance<EventItem>(),
            onPick = { item ->
                val event = item.make(ctx)
                editScripts { it + Script(Ids.random("s"), event) }
            },
            onDismiss = { addEvent = false },
        )
    }
}

@Composable
private fun OwnerSelector(project: Project, screen: Screen, ownerId: String?, onSelect: (String?) -> Unit) {
    Column {
        Text("Чьи блоки:", style = MaterialTheme.typography.labelLarge)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                OwnerChip("📱 Экран", null, selected = ownerId == null) { onSelect(null) }
            }
            items(screen.sprites(), key = { it.id }) { sprite ->
                OwnerChip(sprite.name, project.picture(sprite.costumes.firstOrNull() ?: ""), selected = ownerId == sprite.id) {
                    onSelect(sprite.id)
                }
            }
        }
    }
}

@Composable
private fun OwnerChip(title: String, picture: com.orvenadigital.create.core.model.Picture?, selected: Boolean, onClick: () -> Unit) {
    val color = MaterialTheme.colorScheme.primary
    Row(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) color.copy(alpha = 0.15f) else Color.Transparent)
            .border(if (selected) 2.dp else 1.dp, if (selected) color else Color(0xFFCED4DA), RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (picture != null) {
            PictureThumb(picture, Modifier.size(24.dp))
            Spacer(Modifier.size(6.dp))
        }
        Text(title, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
    }
}

/** Variables, lists and messages of the project: the app's memory and its "radio". */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DataBar(ctx: BlockContext) {
    var adding by remember { mutableStateOf<String?>(null) } // "var", "list", "msg"
    var selected by remember { mutableStateOf<Variable?>(null) }
    var editingInitial by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BlockCategory.VARIABLES.color.copy(alpha = 0.08f))
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Память и сообщения", fontWeight = FontWeight.SemiBold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ctx.project.variables.forEach { v ->
                Chip("${v.name} = ${v.initial}", BlockCategory.VARIABLES.color, Color.White) { selected = v }
            }
            ctx.project.lists.forEach { l -> Chip("☰ $l", Color(0xFFFFD8A8)) {} }
            ctx.project.messages.forEach { m -> Chip("✉ $m", Color(0xFFFFF3BF)) {} }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Chip("＋ переменная", Color.White) { adding = "var" }
            Chip("＋ список", Color.White) { adding = "list" }
            Chip("＋ сообщение", Color.White) { adding = "msg" }
        }
    }
    when (adding) {
        "var" -> NewVariableDialog(ctx, onDismiss = { adding = null }, onCreated = {})
        "list" -> NameDialog("Новый список", "Например «рекорды»", ctx.project.lists, onDismiss = { adding = null }) { ctx.addList(it) }
        "msg" -> NameDialog("Новое сообщение", "Например «старт»", ctx.project.messages, onDismiss = { adding = null }) { ctx.addMessage(it) }
    }
    selected?.let { v ->
        if (editingInitial) {
            TextInputDialog(
                title = "Начальное значение ${v.name}",
                initial = v.initial,
                label = "Значение",
                onDone = { value ->
                    ctx.onEdit { p -> p.copy(variables = p.variables.map { if (it.name == v.name) it.copy(initial = value) else it }) }
                },
                onDismiss = {
                    selected = null
                    editingInitial = false
                },
            )
        } else {
            ChoiceDialog(
                title = v.name,
                options = listOf(
                    "Изменить начальное значение" to { selected = v; editingInitial = true },
                    "Удалить переменную" to { ctx.onEdit { p -> p.copy(variables = p.variables.filter { it.name != v.name }) } },
                ),
                onDismiss = { if (!editingInitial) selected = null },
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ScriptBlock(ctx: BlockContext, script: Script, onChange: (Script) -> Unit, onDelete: () -> Unit) {
    val color = BlockCategory.EVENTS.color
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(color.copy(alpha = 0.08f))
            .border(1.dp, color, RoundedCornerShape(14.dp)),
    ) {
        Row(Modifier.fillMaxWidth().background(color).padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            FlowRow(
                modifier = Modifier.weight(1f).padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                EventHeader(ctx, script.event) { onChange(script.copy(event = it)) }
            }
            IconButton(onClick = onDelete) { Icon(Icons.Default.Delete, contentDescription = "Удалить событие", tint = Color.White) }
        }
        Box(Modifier.padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 8.dp)) {
            ActionList(ctx, script.actions) { onChange(script.copy(actions = it)) }
        }
    }
}

@Composable
private fun EventHeader(ctx: BlockContext, event: Event, onChange: (Event) -> Unit) {
    val ownerId = ctx.owner?.id
    when (event) {
        Event.ScreenOpened -> BlockLabel("Когда экран открыт / игра началась")
        is Event.Clicked -> {
            BlockLabel("Когда нажата")
            ComponentChip(ctx, event.componentId, setOf(ComponentType.BUTTON)) { onChange(event.copy(componentId = it)) }
        }
        is Event.TextChanged -> {
            BlockLabel("Когда меняется текст в")
            ComponentChip(ctx, event.componentId, setOf(ComponentType.INPUT)) { onChange(event.copy(componentId = it)) }
        }
        is Event.CheckedChanged -> {
            BlockLabel("Когда переключён")
            ComponentChip(ctx, event.componentId, setOf(ComponentType.CHECKBOX)) { onChange(event.copy(componentId = it)) }
        }
        is Event.SpriteTapped -> if (event.spriteId == ownerId) {
            BlockLabel("Когда меня нажали")
        } else {
            BlockLabel("Когда нажат")
            TargetChip(ctx, event.spriteId, emptyList(), includeOwner = true) { onChange(event.copy(spriteId = it)) }
        }
        is Event.StageTapped -> {
            BlockLabel("Когда нажали на сцену")
            ComponentChip(ctx, event.componentId, setOf(ComponentType.STAGE)) { onChange(event.copy(componentId = it)) }
        }
        is Event.Receive -> {
            BlockLabel("Когда я получу")
            MessageChip(ctx, event.message) { onChange(event.copy(message = it)) }
        }
        is Event.Touched -> {
            if (event.spriteId == ownerId) {
                BlockLabel("Когда я касаюсь")
            } else {
                BlockLabel("Когда")
                TargetChip(ctx, event.spriteId, emptyList(), includeOwner = true) { onChange(event.copy(spriteId = it)) }
                BlockLabel("касается")
            }
            TargetChip(ctx, event.target, listOf(Targets.ANY, Targets.EDGE)) { onChange(event.copy(target = it)) }
        }
        Event.CloneStarted -> BlockLabel("Когда я появлюсь как клон")
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
                onDuplicate = { onChange(actions.toMutableList().also { it.add(i + 1, action) }) },
                onMoveUp = if (i > 0) ({ onChange(actions.swap(i, i - 1)) }) else null,
                onMoveDown = if (i < actions.lastIndex) ({ onChange(actions.swap(i, i + 1)) }) else null,
            )
        }
        AddActionButton(ctx) { onChange(actions + it) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ActionBlock(
    ctx: BlockContext,
    action: Action,
    onChange: (Action) -> Unit,
    onDelete: () -> Unit,
    onDuplicate: () -> Unit,
    onMoveUp: (() -> Unit)?,
    onMoveDown: (() -> Unit)?,
) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(categoryOf(action).color)) {
        Row(verticalAlignment = Alignment.Top) {
            FlowRow(
                modifier = Modifier.weight(1f).padding(start = 10.dp, top = 6.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                ActionContent(ctx, action, onChange)
            }
            BlockMenu(onDelete, onDuplicate, onMoveUp, onMoveDown)
        }
        when (action) {
            is Action.If -> {
                NestedList(ctx, action.then) { onChange(action.copy(then = it)) }
                Text("иначе", color = Color.White, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 10.dp, bottom = 4.dp))
                NestedList(ctx, action.otherwise) { onChange(action.copy(otherwise = it)) }
            }
            is Action.Repeat -> NestedList(ctx, action.body) { onChange(action.copy(body = it)) }
            is Action.Forever -> NestedList(ctx, action.body) { onChange(action.copy(body = it)) }
            is Action.RepeatUntil -> NestedList(ctx, action.body) { onChange(action.copy(body = it)) }
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
            .background(Color.White.copy(alpha = 0.88f))
            .padding(6.dp),
    ) {
        ActionList(ctx, actions, onChange)
    }
}

private val selfTargets = listOf(Targets.RANDOM, Targets.FINGER)

@Composable
private fun ActionContent(ctx: BlockContext, action: Action, onChange: (Action) -> Unit) {
    @Composable
    fun E(e: com.orvenadigital.create.core.model.Expr, set: (com.orvenadigital.create.core.model.Expr) -> Action) =
        ExprView(ctx, e) { onChange(set(it)) }

    when (action) {
        // ---- events
        is Action.Broadcast -> {
            BlockLabel(if (action.andWait) "отправить всем" else "отправить всем")
            MessageChip(ctx, action.message) { onChange(action.copy(message = it)) }
            if (action.andWait) BlockLabel("и ждать")
        }
        // ---- control
        is Action.If -> { BlockLabel("если"); E(action.condition) { action.copy(condition = it) }; BlockLabel("то") }
        is Action.Repeat -> { BlockLabel("повторить"); E(action.times) { action.copy(times = it) }; BlockLabel("раз") }
        is Action.Forever -> BlockLabel("всегда")
        is Action.RepeatUntil -> { BlockLabel("повторять пока не"); E(action.condition) { action.copy(condition = it) } }
        is Action.Wait -> { BlockLabel("ждать"); E(action.seconds) { action.copy(seconds = it) }; BlockLabel("сек") }
        is Action.WaitUntil -> { BlockLabel("ждать пока не"); E(action.condition) { action.copy(condition = it) } }
        is Action.Stop -> {
            BlockLabel("стоп")
            EnumChip(action.mode, StopMode.entries, { it.label }) { onChange(action.copy(mode = it)) }
        }
        is Action.CreateClone -> {
            BlockLabel("создать клон")
            TargetChip(ctx, action.spriteId, if (ctx.owner != null) listOf(Targets.SELF) else emptyList(), includeOwner = false) {
                onChange(action.copy(spriteId = it))
            }
        }
        Action.DeleteClone -> BlockLabel("удалить этот клон")
        Action.ResetTimer -> BlockLabel("сбросить таймер")
        // ---- motion
        is Action.Move -> { BlockLabel("идти"); E(action.steps) { action.copy(steps = it) }; BlockLabel("шагов") }
        is Action.Turn -> { BlockLabel("повернуть на"); E(action.degrees) { action.copy(degrees = it) }; BlockLabel("°") }
        is Action.PointInDirection -> { BlockLabel("смотреть в направлении"); E(action.direction) { action.copy(direction = it) } }
        is Action.PointTowards -> {
            BlockLabel("смотреть на")
            TargetChip(ctx, action.target, listOf(Targets.FINGER)) { onChange(action.copy(target = it)) }
        }
        is Action.GoTo -> {
            BlockLabel("перейти в x:"); E(action.x) { action.copy(x = it) }
            BlockLabel("y:"); E(action.y) { action.copy(y = it) }
        }
        is Action.GoToTarget -> {
            BlockLabel("перейти к")
            TargetChip(ctx, action.target, selfTargets) { onChange(action.copy(target = it)) }
        }
        is Action.Glide -> {
            BlockLabel("плыть"); E(action.seconds) { action.copy(seconds = it) }
            BlockLabel("сек к x:"); E(action.x) { action.copy(x = it) }
            BlockLabel("y:"); E(action.y) { action.copy(y = it) }
        }
        is Action.ChangeX -> { BlockLabel("изменить x на"); E(action.by) { action.copy(by = it) } }
        is Action.SetX -> { BlockLabel("установить x в"); E(action.value) { action.copy(value = it) } }
        is Action.ChangeY -> { BlockLabel("изменить y на"); E(action.by) { action.copy(by = it) } }
        is Action.SetY -> { BlockLabel("установить y в"); E(action.value) { action.copy(value = it) } }
        Action.BounceOnEdge -> BlockLabel("если на краю, оттолкнуться")
        is Action.SetRotationStyle -> {
            BlockLabel("стиль вращения")
            EnumChip(action.style, RotationStyle.entries, { it.label }) { onChange(action.copy(style = it)) }
        }
        // ---- looks
        is Action.SetCostume -> { BlockLabel("сменить костюм на"); E(action.costume) { action.copy(costume = it) } }
        Action.NextCostume -> BlockLabel("следующий костюм")
        is Action.SetSize -> { BlockLabel("размер"); E(action.percent) { action.copy(percent = it) }; BlockLabel("%") }
        is Action.ChangeSize -> { BlockLabel("изменить размер на"); E(action.by) { action.copy(by = it) } }
        Action.Show -> BlockLabel("показаться")
        Action.Hide -> BlockLabel("спрятаться")
        is Action.Say -> { BlockLabel("сказать"); E(action.text) { action.copy(text = it) } }
        is Action.SayFor -> {
            BlockLabel("сказать"); E(action.text) { action.copy(text = it) }
            E(action.seconds) { action.copy(seconds = it) }; BlockLabel("сек")
        }
        is Action.SetGhost -> { BlockLabel("прозрачность"); E(action.percent) { action.copy(percent = it) }; BlockLabel("%") }
        Action.GoToFront -> BlockLabel("на передний план")
        // ---- physics
        is Action.SetPhysics -> {
            BlockLabel("физика:")
            EnumChip(action.type, PhysicsType.entries, { it.label }) { onChange(action.copy(type = it)) }
        }
        is Action.SetVelocity -> {
            BlockLabel("скорость x:"); E(action.vx) { action.copy(vx = it) }
            BlockLabel("y:"); E(action.vy) { action.copy(vy = it) }
        }
        is Action.Push -> {
            BlockLabel("толкнуть x:"); E(action.dvx) { action.copy(dvx = it) }
            BlockLabel("y:"); E(action.dvy) { action.copy(dvy = it) }
        }
        is Action.SetGravity -> { BlockLabel("гравитация сцены"); E(action.value) { action.copy(value = it) } }
        is Action.SetBounce -> { BlockLabel("упругость"); E(action.percent) { action.copy(percent = it) }; BlockLabel("%") }
        is Action.SetFriction -> { BlockLabel("трение"); E(action.percent) { action.copy(percent = it) }; BlockLabel("%") }
        // ---- sound
        is Action.PlayNote -> {
            BlockLabel("нота"); E(action.note) { action.copy(note = it) }
            E(action.seconds) { action.copy(seconds = it) }; BlockLabel("сек")
        }
        is Action.Vibrate -> { BlockLabel("вибрация"); E(action.millis) { action.copy(millis = it) }; BlockLabel("мс") }
        // ---- interface
        is Action.SetProperty -> {
            BlockLabel("установить")
            ComponentChip(ctx, action.componentId) { id ->
                onChange(action.copy(componentId = id, property = fitProperty(ctx, id, action.property)))
            }
            PropChip(ctx, action.componentId, action.property) { onChange(action.copy(property = it)) }
            BlockLabel("=")
            E(action.value) { action.copy(value = it) }
        }
        is Action.Ask -> { BlockLabel("спросить"); E(action.question) { action.copy(question = it) }; BlockLabel("и ждать") }
        is Action.ShowMessage -> { BlockLabel("показать сообщение"); E(action.message) { action.copy(message = it) } }
        is Action.OpenScreen -> {
            BlockLabel("открыть экран")
            ScreenChip(ctx, action.screenId) { onChange(action.copy(screenId = it)) }
        }
        Action.GoBack -> BlockLabel("вернуться на прошлый экран")
        // ---- variables and lists
        is Action.SetVariable -> {
            BlockLabel("задать")
            VariableChip(ctx, action.name) { onChange(action.copy(name = it)) }
            BlockLabel("=")
            E(action.value) { action.copy(value = it) }
        }
        is Action.ChangeVariable -> {
            BlockLabel("изменить")
            VariableChip(ctx, action.name) { onChange(action.copy(name = it)) }
            BlockLabel("на")
            E(action.by) { action.copy(by = it) }
        }
        is Action.ListAdd -> {
            BlockLabel("добавить"); E(action.value) { action.copy(value = it) }
            BlockLabel("в"); ListChip(ctx, action.list) { onChange(action.copy(list = it)) }
        }
        is Action.ListDelete -> {
            BlockLabel("удалить"); E(action.index) { action.copy(index = it) }
            BlockLabel("из"); ListChip(ctx, action.list) { onChange(action.copy(list = it)) }
        }
        is Action.ListReplace -> {
            BlockLabel("заменить"); E(action.index) { action.copy(index = it) }
            BlockLabel("в"); ListChip(ctx, action.list) { onChange(action.copy(list = it)) }
            BlockLabel("на"); E(action.value) { action.copy(value = it) }
        }
        is Action.ListClear -> {
            BlockLabel("очистить"); ListChip(ctx, action.list) { onChange(action.copy(list = it)) }
        }
    }
}

@Composable
private fun BlockMenu(onDelete: () -> Unit, onDuplicate: () -> Unit, onMoveUp: (() -> Unit)?, onMoveDown: (() -> Unit)?) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Default.MoreVert, contentDescription = "Ещё", tint = Color.White) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (onMoveUp != null) DropdownMenuItem(text = { Text("Выше") }, onClick = { open = false; onMoveUp() })
            if (onMoveDown != null) DropdownMenuItem(text = { Text("Ниже") }, onClick = { open = false; onMoveDown() })
            DropdownMenuItem(text = { Text("Дублировать") }, onClick = { open = false; onDuplicate() })
            DropdownMenuItem(text = { Text("Удалить", color = MaterialTheme.colorScheme.error) }, onClick = { open = false; onDelete() })
        }
    }
}

@Composable
private fun AddActionButton(ctx: BlockContext, onAdd: (Action) -> Unit) {
    var open by remember { mutableStateOf(false) }
    TextButton(onClick = { open = true }) { Text("＋ блок") }
    if (open) {
        BlockPaletteSheet(
            title = "Какой блок прицепить?",
            items = BlockCatalog.visible(BlockCatalog.actions, ctx).filterIsInstance<ActionItem>(),
            onPick = { item -> onAdd(item.make(ctx)) },
            onDismiss = { open = false },
        )
    }
}
