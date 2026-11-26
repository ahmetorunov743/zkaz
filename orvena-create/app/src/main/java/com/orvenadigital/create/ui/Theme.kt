package com.orvenadigital.create.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.runtime.OrvenaViolet

val OrvenaTeal = Color(0xFF00A88F)
val OrvenaOrange = Color(0xFFFF8A00)

@Composable
fun OrvenaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = OrvenaViolet,
            secondary = OrvenaTeal,
            tertiary = OrvenaOrange,
        ),
        content = content,
    )
}

/** Colors of the "Lego" pieces: each kind of brick and block has its own. */
object BrickColors {
    val event = Color(0xFFFF9F1C)
    val property = Color(0xFF4C6EF5)
    val variable = Color(0xFFE64980)
    val control = Color(0xFF12B886)
    val navigation = Color(0xFF7950F2)

    val exprText = Color(0xFFFFFFFF)
    val exprLogic = Color(0xFFD3F9D8)
    val exprMath = Color(0xFFC5F6FA)
    val exprVar = Color(0xFFFFDEEB)
    val exprProp = Color(0xFFDBE4FF)
    val exprJoin = Color(0xFFE5DBFF)

    fun component(type: ComponentType): Color = when (type) {
        ComponentType.COLUMN -> Color(0xFF7950F2)
        ComponentType.ROW -> Color(0xFF9775FA)
        ComponentType.CARD -> Color(0xFF845EF7)
        ComponentType.TEXT -> Color(0xFF228BE6)
        ComponentType.BUTTON -> Color(0xFFFF8A00)
        ComponentType.INPUT -> Color(0xFF12B886)
        ComponentType.CHECKBOX -> Color(0xFF40C057)
        ComponentType.DIVIDER -> Color(0xFF868E96)
        ComponentType.SPACER -> Color(0xFFADB5BD)
    }
}

fun <T> List<T>.replaceAt(index: Int, value: T): List<T> = toMutableList().also { it[index] = value }

fun <T> List<T>.without(index: Int): List<T> = toMutableList().also { it.removeAt(index) }

fun <T> List<T>.swap(a: Int, b: Int): List<T> {
    if (a !in indices || b !in indices) return this
    return toMutableList().also {
        val tmp = it[a]
        it[a] = it[b]
        it[b] = tmp
    }
}
