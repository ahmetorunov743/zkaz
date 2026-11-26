package com.orvenadigital.create.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.ComponentCatalog
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.core.model.Screen
import com.orvenadigital.create.core.model.allComponents
import com.orvenadigital.create.core.model.findComponent

/** What block editors need to offer choices: bricks of this screen, variables, screens. */
class BlockContext(
    val project: Project,
    val screen: Screen,
    val addVariable: (String) -> Unit,
) {
    val components: List<Component> = screen.root.allComponents()
    fun typeOf(id: String): ComponentType? = project.findComponent(id)?.type
}

@Composable
fun Chip(text: String, color: Color = Color.White, textColor: Color = Color(0xFF212529), onClick: () -> Unit) {
    Text(
        text = text,
        color = textColor,
        style = MaterialTheme.typography.labelLarge,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(color)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 5.dp),
    )
}

@Composable
fun BlockLabel(text: String, color: Color = Color.White) {
    Text(text, color = color, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 5.dp))
}

/** A list of choices; picking one runs it and closes the dialog. */
@Composable
fun ChoiceDialog(title: String, options: List<Pair<String, () -> Unit>>, onDismiss: () -> Unit, empty: String = "Пока нечего выбрать") {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                if (options.isEmpty()) Text(empty, color = MaterialTheme.colorScheme.onSurfaceVariant)
                options.forEachIndexed { i, (label, action) ->
                    if (i > 0) HorizontalDivider()
                    Text(
                        label,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onDismiss()
                                action()
                            }
                            .padding(vertical = 12.dp),
                    )
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Закрыть") } },
    )
}

@Composable
fun TextInputDialog(
    title: String,
    initial: String,
    label: String,
    number: Boolean = false,
    validate: (String) -> String? = { null },
    onDone: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var value by remember { mutableStateOf(initial) }
    val error = validate(value.trim())
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = value,
                onValueChange = { value = it.take(200) },
                label = { Text(label) },
                singleLine = true,
                isError = error != null,
                supportingText = if (error != null) {
                    { Text(error) }
                } else {
                    null
                },
                keyboardOptions = if (number) KeyboardOptions(keyboardType = KeyboardType.Decimal) else KeyboardOptions.Default,
            )
        },
        confirmButton = {
            TextButton(enabled = error == null, onClick = {
                onDismiss()
                onDone(value.trim())
            }) { Text("Готово") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
    )
}

@Composable
fun ComponentChip(ctx: BlockContext, componentId: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val exists = ctx.components.any { it.id == componentId }
    Chip(if (exists) componentId else "деталька?", if (exists) Color.White else Color(0xFFFFE3E3)) { open = true }
    if (open) {
        ChoiceDialog(
            title = "Какая деталька?",
            options = ctx.components.filter { it.id != ctx.screen.root.id }.map { c ->
                "${ComponentCatalog.label(c.type)} · ${c.id}" to { onPick(c.id) }
            },
            onDismiss = { open = false },
            empty = "На этом экране ещё нет деталек",
        )
    }
}

@Composable
fun PropChip(ctx: BlockContext, componentId: String, property: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val type = ctx.typeOf(componentId)
    val label = type?.let { ComponentCatalog.prop(it, property)?.label } ?: property
    Chip(label.lowercase()) { open = true }
    if (open) {
        val defs = type?.let { ComponentCatalog.props(it) }.orEmpty()
        ChoiceDialog(
            title = "Какое свойство?",
            options = defs.map { def -> def.label to { onPick(def.key) } },
            onDismiss = { open = false },
            empty = "Сначала выбери детальку",
        )
    }
}

@Composable
fun VariableChip(ctx: BlockContext, name: String, onPick: (String) -> Unit) {
    var mode by remember { mutableIntStateOf(0) } // 0 closed, 1 list, 2 new
    val exists = ctx.project.variables.any { it.name == name }
    Chip(if (exists) name else "переменная?", if (exists) BrickColors.exprVar else Color(0xFFFFE3E3)) { mode = 1 }
    when (mode) {
        1 -> ChoiceDialog(
            title = "Какая переменная?",
            options = ctx.project.variables.map { v -> v.name to { onPick(v.name) } } +
                ("＋ Новая переменная" to { mode = 2 }),
            onDismiss = { if (mode == 1) mode = 0 },
        )
        2 -> NewVariableDialog(ctx, onDismiss = { mode = 0 }, onCreated = onPick)
    }
}

@Composable
fun NewVariableDialog(ctx: BlockContext, onDismiss: () -> Unit, onCreated: (String) -> Unit) {
    TextInputDialog(
        title = "Новая переменная",
        initial = "",
        label = "Имя, например score",
        validate = { v ->
            when {
                v.isEmpty() -> "Придумай имя"
                ctx.project.variables.any { it.name == v } -> "Такая уже есть"
                else -> null
            }
        },
        onDone = { v ->
            ctx.addVariable(v)
            onCreated(v)
        },
        onDismiss = onDismiss,
    )
}

@Composable
fun ScreenChip(ctx: BlockContext, screenId: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val screen = ctx.project.screens.firstOrNull { it.id == screenId }
    Chip(screen?.name ?: "экран?", if (screen != null) Color.White else Color(0xFFFFE3E3)) { open = true }
    if (open) {
        ChoiceDialog(
            title = "Какой экран?",
            options = ctx.project.screens.map { s -> s.name to { onPick(s.id) } },
            onDismiss = { open = false },
        )
    }
}

/** When the brick changes, keep the property if the new brick has it, else use its main one. */
fun fitProperty(ctx: BlockContext, componentId: String, property: String): String {
    val type = ctx.typeOf(componentId) ?: return property
    return if (ComponentCatalog.prop(type, property) != null) property else ComponentCatalog.mainProp(type) ?: Props.VISIBLE
}
