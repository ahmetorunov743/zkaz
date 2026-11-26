package com.orvenadigital.create.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.orvenadigital.create.core.engine.formatNumber
import com.orvenadigital.create.core.model.Expr
import com.orvenadigital.create.core.model.MathFn
import com.orvenadigital.create.core.model.SensorKind
import com.orvenadigital.create.core.model.SpriteAttrKind
import com.orvenadigital.create.core.model.Targets
import com.orvenadigital.create.core.model.next

private val DARK = Color(0xFF212529)

private fun colorOf(expr: Expr): Color = when (expr) {
    is Expr.Text, is Expr.Num -> Color.White
    is Expr.Bool, is Expr.Compare, is Expr.Logic, is Expr.Not -> Color(0xFFD3F9D8)
    is Expr.Arithmetic, is Expr.RandomInt, is Expr.MathFunc -> Color(0xFFC3FAE8)
    is Expr.Join, is Expr.TextLength, is Expr.LetterOf, is Expr.Contains -> Color(0xFFE5DBFF)
    is Expr.GetVariable, is Expr.ListItem, is Expr.ListLength, is Expr.ListContains -> Color(0xFFFFE8CC)
    is Expr.GetProperty -> Color(0xFFDBE4FF)
    is Expr.Touching, is Expr.Sensor, is Expr.DistanceTo -> Color(0xFFC5F6FA)
    is Expr.SpriteAttr -> Color(0xFFD0EBFF)
}

/**
 * A value slot of a block. Plain values are chips; composite ones are nested boxes that hold
 * other slots, so values snap together like bricks: "соединить «Привет, » [input1.текст]".
 * Tapping the bold head of any value opens a dialog to edit it or swap it for another block.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExprView(ctx: BlockContext, expr: Expr, onChange: (Expr) -> Unit) {
    var dialog by remember { mutableStateOf(false) }
    val open = { dialog = true }
    val color = colorOf(expr)

    when (expr) {
        is Expr.Text -> Chip("«${expr.value}»", color, onClick = open)
        is Expr.Num -> Chip(formatNumber(expr.value), color, onClick = open)
        is Expr.Bool -> Chip(if (expr.value) "да" else "нет", color, onClick = open)
        is Expr.GetVariable -> Chip(expr.name.ifEmpty { "переменная?" }, color, onClick = open)

        is Expr.GetProperty -> ExprBox(color) {
            Head("свойство", open)
            ComponentChip(ctx, expr.componentId) { id -> onChange(expr.copy(componentId = id, property = fitProperty(ctx, id, expr.property))) }
            PropChip(ctx, expr.componentId, expr.property) { onChange(expr.copy(property = it)) }
        }
        is Expr.Join -> ExprBox(color) {
            Head("соединить", open)
            ExprView(ctx, expr.left) { onChange(expr.copy(left = it)) }
            ExprView(ctx, expr.right) { onChange(expr.copy(right = it)) }
        }
        is Expr.Arithmetic -> ExprBox(color) {
            Head("посчитать", open)
            ExprView(ctx, expr.left) { onChange(expr.copy(left = it)) }
            OpChip(expr.op.symbol) { onChange(expr.copy(op = expr.op.next())) }
            ExprView(ctx, expr.right) { onChange(expr.copy(right = it)) }
        }
        is Expr.Compare -> ExprBox(color) {
            Head("сравнить", open)
            ExprView(ctx, expr.left) { onChange(expr.copy(left = it)) }
            OpChip(expr.op.symbol) { onChange(expr.copy(op = expr.op.next())) }
            ExprView(ctx, expr.right) { onChange(expr.copy(right = it)) }
        }
        is Expr.Logic -> ExprBox(color) {
            Head("условие", open)
            ExprView(ctx, expr.left) { onChange(expr.copy(left = it)) }
            OpChip(expr.op.symbol) { onChange(expr.copy(op = expr.op.next())) }
            ExprView(ctx, expr.right) { onChange(expr.copy(right = it)) }
        }
        is Expr.Not -> ExprBox(color) {
            Head("не", open)
            ExprView(ctx, expr.value) { onChange(expr.copy(value = it)) }
        }
        is Expr.RandomInt -> ExprBox(color) {
            Head("случайное от", open)
            ExprView(ctx, expr.from) { onChange(expr.copy(from = it)) }
            BlockLabel("до", DARK)
            ExprView(ctx, expr.to) { onChange(expr.copy(to = it)) }
        }
        is Expr.MathFunc -> ExprBox(color) {
            Head("функция", open)
            EnumChip(expr.fn, MathFn.entries, { it.label }) { onChange(expr.copy(fn = it)) }
            ExprView(ctx, expr.value) { onChange(expr.copy(value = it)) }
        }
        is Expr.TextLength -> ExprBox(color) {
            Head("длина", open)
            ExprView(ctx, expr.value) { onChange(expr.copy(value = it)) }
        }
        is Expr.LetterOf -> ExprBox(color) {
            Head("буква", open)
            ExprView(ctx, expr.index) { onChange(expr.copy(index = it)) }
            BlockLabel("в", DARK)
            ExprView(ctx, expr.text) { onChange(expr.copy(text = it)) }
        }
        is Expr.Contains -> ExprBox(color) {
            Head("текст", open)
            ExprView(ctx, expr.text) { onChange(expr.copy(text = it)) }
            BlockLabel("содержит", DARK)
            ExprView(ctx, expr.part) { onChange(expr.copy(part = it)) }
        }
        is Expr.ListItem -> ExprBox(color) {
            Head("элемент", open)
            ExprView(ctx, expr.index) { onChange(expr.copy(index = it)) }
            BlockLabel("из", DARK)
            ListChip(ctx, expr.list) { onChange(expr.copy(list = it)) }
        }
        is Expr.ListLength -> ExprBox(color) {
            Head("длина списка", open)
            ListChip(ctx, expr.list) { onChange(expr.copy(list = it)) }
        }
        is Expr.ListContains -> ExprBox(color) {
            Head("список", open)
            ListChip(ctx, expr.list) { onChange(expr.copy(list = it)) }
            BlockLabel("содержит", DARK)
            ExprView(ctx, expr.value) { onChange(expr.copy(value = it)) }
        }
        is Expr.Touching -> ExprBox(color) {
            Head("касаюсь", open)
            TargetChip(ctx, expr.target, listOf(Targets.EDGE, Targets.FINGER, Targets.ANY)) { onChange(expr.copy(target = it)) }
            BlockLabel("?", DARK)
        }
        is Expr.Sensor -> ExprBox(color) {
            Head("датчик", open)
            EnumChip(expr.kind, SensorKind.entries, { it.label }) { onChange(expr.copy(kind = it)) }
        }
        is Expr.SpriteAttr -> ExprBox(color) {
            Head("свойство", open)
            EnumChip(expr.attr, SpriteAttrKind.entries, { it.label }) { onChange(expr.copy(attr = it)) }
            BlockLabel("у", DARK)
            TargetChip(ctx, expr.spriteId, if (ctx.owner != null) listOf(Targets.SELF) else emptyList(), includeOwner = true) {
                onChange(expr.copy(spriteId = it))
            }
        }
        is Expr.DistanceTo -> ExprBox(color) {
            Head("расстояние до", open)
            TargetChip(ctx, expr.target, listOf(Targets.FINGER)) { onChange(expr.copy(target = it)) }
        }
    }

    if (dialog) {
        ExprDialog(ctx, expr, onChange, onDismiss = { dialog = false })
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExprBox(color: Color, content: @Composable () -> Unit) {
    FlowRow(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(color)
            .border(1.dp, Color.Black.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        content()
    }
}

@Composable
private fun Head(text: String, onClick: () -> Unit) {
    Text(
        text,
        fontWeight = FontWeight.Bold,
        color = DARK,
        style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable(onClick = onClick).padding(horizontal = 4.dp, vertical = 5.dp),
    )
}

@Composable
private fun OpChip(symbol: String, onClick: () -> Unit) {
    Chip(symbol, DARK, Color.White, onClick)
}

private fun innerOf(expr: Expr): Expr? = when (expr) {
    is Expr.Join -> expr.left
    is Expr.Arithmetic -> expr.left
    is Expr.Compare -> expr.left
    is Expr.Logic -> expr.left
    is Expr.Not -> expr.value
    is Expr.MathFunc -> expr.value
    is Expr.TextLength -> expr.value
    is Expr.LetterOf -> expr.text
    is Expr.Contains -> expr.text
    is Expr.ListContains -> expr.value
    else -> null
}

@Composable
private fun ExprDialog(ctx: BlockContext, expr: Expr, onChange: (Expr) -> Unit, onDismiss: () -> Unit) {
    var text by remember {
        mutableStateOf(
            when (expr) {
                is Expr.Text -> expr.value
                is Expr.Num -> formatNumber(expr.value)
                else -> ""
            },
        )
    }
    var newVariable by remember { mutableStateOf(false) }
    var palette by remember { mutableStateOf(false) }
    val editable = expr is Expr.Text || expr is Expr.Num

    fun commitLiteral() {
        when (expr) {
            is Expr.Text -> onChange(Expr.Text(text))
            is Expr.Num -> onChange(Expr.Num(text.replace(',', '.').toDoubleOrNull() ?: 0.0))
            else -> Unit
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (editable) "Значение" else "Значение-блок") },
        text = {
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState())) {
                when (expr) {
                    is Expr.Text -> {
                        OutlinedTextField(value = text, onValueChange = { text = it }, label = { Text("Текст") }, modifier = Modifier.fillMaxWidth())
                        val costumes = ctx.ownerCostumeNames()
                        if (costumes.isNotEmpty()) {
                            Spacer(Modifier.height(6.dp))
                            Text("Костюмы спрайта:", style = MaterialTheme.typography.bodySmall)
                            costumes.forEach { name -> TextButton(onClick = { onChange(Expr.Text(name)); onDismiss() }) { Text(name) } }
                        }
                    }
                    is Expr.Num -> OutlinedTextField(
                        value = text,
                        onValueChange = { v -> text = v.filter { it.isDigit() || it == '.' || it == ',' || it == '-' }.take(15) },
                        label = { Text("Число") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    is Expr.Bool -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(true to "да", false to "нет").forEach { (v, label) ->
                            if (expr.value == v) {
                                Button(onClick = { onChange(Expr.Bool(v)); onDismiss() }) { Text(label) }
                            } else {
                                OutlinedButton(onClick = { onChange(Expr.Bool(v)); onDismiss() }) { Text(label) }
                            }
                        }
                    }
                    is Expr.GetVariable -> Column {
                        Text("Переменная:", fontWeight = FontWeight.Medium)
                        ctx.project.variables.forEach { v ->
                            TextButton(onClick = { onChange(Expr.GetVariable(v.name)); onDismiss() }) { Text(v.name) }
                        }
                        TextButton(onClick = { newVariable = true }) { Text("＋ Новая переменная") }
                    }
                    else -> Text("Нажимай на кусочки внутри блока, чтобы их поменять.", style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(12.dp))
                Button(onClick = { palette = true }, modifier = Modifier.fillMaxWidth()) { Text("Заменить другим блоком…") }
                innerOf(expr)?.let { inner ->
                    OutlinedButton(onClick = { onChange(inner); onDismiss() }, modifier = Modifier.fillMaxWidth()) {
                        Text("Убрать обёртку")
                    }
                }
            }
        },
        confirmButton = {
            if (editable) {
                TextButton(onClick = { commitLiteral(); onDismiss() }) { Text("Готово") }
            } else {
                TextButton(onClick = onDismiss) { Text("Закрыть") }
            }
        },
    )

    if (newVariable) {
        NewVariableDialog(ctx, onDismiss = { newVariable = false }, onCreated = { name ->
            onChange(Expr.GetVariable(name))
            onDismiss()
        })
    }
    if (palette) {
        BlockPaletteSheet(
            title = "Какое значение?",
            items = BlockCatalog.visible(BlockCatalog.exprs, ctx).filterIsInstance<ExprItem>(),
            onPick = { item ->
                onChange(item.make(ctx, expr))
                onDismiss()
            },
            onDismiss = { palette = false },
        )
    }
}
