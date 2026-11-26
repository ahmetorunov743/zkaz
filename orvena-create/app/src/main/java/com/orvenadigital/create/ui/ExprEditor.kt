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
import androidx.compose.material3.HorizontalDivider
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
import com.orvenadigital.create.core.model.ArithOp
import com.orvenadigital.create.core.model.CompareOp
import com.orvenadigital.create.core.model.ComponentCatalog
import com.orvenadigital.create.core.model.Expr
import com.orvenadigital.create.core.model.LogicOp
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.core.model.next

/**
 * A value slot of a block. Plain values are chips; composite ones are nested boxes that hold
 * other slots, so expressions snap together like bricks: "соединить «Привет, » [input1.текст]".
 * Tapping the bold head of any value opens a dialog to edit it or swap it for another kind.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExprView(ctx: BlockContext, expr: Expr, onChange: (Expr) -> Unit) {
    var dialog by remember { mutableStateOf(false) }
    val open = { dialog = true }

    when (expr) {
        is Expr.Text -> Chip("«${expr.value}»", BrickColors.exprText, onClick = open)
        is Expr.Num -> Chip(formatNumber(expr.value), BrickColors.exprText, onClick = open)
        is Expr.Bool -> Chip(if (expr.value) "да" else "нет", BrickColors.exprLogic, onClick = open)
        is Expr.GetVariable -> Chip(expr.name.ifEmpty { "переменная?" }, BrickColors.exprVar, onClick = open)

        is Expr.GetProperty -> ExprBox(BrickColors.exprProp) {
            Head("свойство", open)
            ComponentChip(ctx, expr.componentId) { id -> onChange(expr.copy(componentId = id, property = fitProperty(ctx, id, expr.property))) }
            PropChip(ctx, expr.componentId, expr.property) { onChange(expr.copy(property = it)) }
        }

        is Expr.Join -> ExprBox(BrickColors.exprJoin) {
            Head("соединить", open)
            ExprView(ctx, expr.left) { onChange(expr.copy(left = it)) }
            ExprView(ctx, expr.right) { onChange(expr.copy(right = it)) }
        }

        is Expr.Arithmetic -> ExprBox(BrickColors.exprMath) {
            Head("посчитать", open)
            ExprView(ctx, expr.left) { onChange(expr.copy(left = it)) }
            OpChip(expr.op.symbol) { onChange(expr.copy(op = expr.op.next())) }
            ExprView(ctx, expr.right) { onChange(expr.copy(right = it)) }
        }

        is Expr.Compare -> ExprBox(BrickColors.exprLogic) {
            Head("сравнить", open)
            ExprView(ctx, expr.left) { onChange(expr.copy(left = it)) }
            OpChip(expr.op.symbol) { onChange(expr.copy(op = expr.op.next())) }
            ExprView(ctx, expr.right) { onChange(expr.copy(right = it)) }
        }

        is Expr.Logic -> ExprBox(BrickColors.exprLogic) {
            Head("условие", open)
            ExprView(ctx, expr.left) { onChange(expr.copy(left = it)) }
            OpChip(expr.op.symbol) { onChange(expr.copy(op = expr.op.next())) }
            ExprView(ctx, expr.right) { onChange(expr.copy(right = it)) }
        }

        is Expr.Not -> ExprBox(BrickColors.exprLogic) {
            Head("не", open)
            ExprView(ctx, expr.value) { onChange(expr.copy(value = it)) }
        }

        is Expr.RandomInt -> ExprBox(BrickColors.exprMath) {
            Head("случайное от", open)
            ExprView(ctx, expr.from) { onChange(expr.copy(from = it)) }
            BlockLabel("до", Color(0xFF212529))
            ExprView(ctx, expr.to) { onChange(expr.copy(to = it)) }
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
        color = Color(0xFF212529),
        style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable(onClick = onClick).padding(horizontal = 4.dp, vertical = 5.dp),
    )
}

@Composable
private fun OpChip(symbol: String, onClick: () -> Unit) {
    Chip(symbol, Color(0xFF212529), Color.White, onClick)
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
        title = { Text(if (editable) "Значение" else "Заменить значение") },
        text = {
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState())) {
                when (expr) {
                    is Expr.Text -> OutlinedTextField(
                        value = text,
                        onValueChange = { text = it },
                        label = { Text("Текст") },
                        modifier = Modifier.fillMaxWidth(),
                    )
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
                    else -> Unit
                }
                Spacer(Modifier.height(8.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
                Text("Заменить на:", fontWeight = FontWeight.Medium)
                replacements(ctx, expr).forEach { (label, make) ->
                    Text(
                        label,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onChange(make())
                                onDismiss()
                            }
                            .padding(vertical = 10.dp),
                    )
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
}

/** Kinds a value can turn into. Composite kinds wrap the current value, so nothing is lost. */
private fun replacements(ctx: BlockContext, current: Expr): List<Pair<String, () -> Expr>> {
    val firstVariable = ctx.project.variables.firstOrNull()?.name ?: ""
    val brick = ctx.components.firstOrNull { it.id != ctx.screen.root.id && ComponentCatalog.mainProp(it.type) == Props.TEXT }
    val out = mutableListOf<Pair<String, () -> Expr>>(
        "Текст" to { Expr.Text("") },
        "Число" to { Expr.Num(0.0) },
        "Да / нет" to { Expr.Bool(true) },
        "Переменная" to { Expr.GetVariable(firstVariable) },
        "Свойство детальки" to { Expr.GetProperty(brick?.id ?: "", Props.TEXT) },
        "Соединить текст" to { Expr.Join(current, Expr.Text("")) },
        "Посчитать (+ − × ÷ %)" to { Expr.Arithmetic(ArithOp.ADD, current, Expr.Num(1.0)) },
        "Сравнить (= ≠ < >)" to { Expr.Compare(CompareOp.EQ, current, Expr.Num(0.0)) },
        "Условие и / или" to { Expr.Logic(LogicOp.AND, current, Expr.Bool(true)) },
        "Не (наоборот)" to { Expr.Not(current) },
        "Случайное число" to { Expr.RandomInt(Expr.Num(1.0), Expr.Num(10.0)) },
    )
    val inner: Expr? = when (current) {
        is Expr.Join -> current.left
        is Expr.Arithmetic -> current.left
        is Expr.Compare -> current.left
        is Expr.Logic -> current.left
        is Expr.Not -> current.value
        else -> null
    }
    if (inner != null) out += "Убрать обёртку (оставить внутреннее)" to { inner }
    return out
}
