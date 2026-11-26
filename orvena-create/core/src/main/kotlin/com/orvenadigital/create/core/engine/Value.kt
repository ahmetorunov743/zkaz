package com.orvenadigital.create.core.engine

import kotlin.math.abs
import kotlin.math.floor

/** A value while blocks run: text, number or yes/no. Converts freely, like in Scratch. */
sealed interface Value {
    data class Str(val v: String) : Value
    data class Num(val v: Double) : Value
    data class Bool(val v: Boolean) : Value

    companion object {
        fun parse(raw: String): Value {
            raw.toNumberOrNull()?.let { return Num(it) }
            return when (raw) {
                "true" -> Bool(true)
                "false" -> Bool(false)
                else -> Str(raw)
            }
        }
    }
}

private fun String.toNumberOrNull(): Double? {
    val t = trim()
    if (t.isEmpty()) return null
    return t.replace(',', '.').toDoubleOrNull()?.takeIf { !it.isNaN() }
}

fun Value.asText(): String = when (this) {
    is Value.Str -> v
    is Value.Num -> formatNumber(v)
    is Value.Bool -> v.toString()
}

fun Value.numberOrNull(): Double? = when (this) {
    is Value.Num -> v
    is Value.Str -> v.toNumberOrNull()
    is Value.Bool -> null
}

fun Value.asNumber(): Double = when (this) {
    is Value.Bool -> if (v) 1.0 else 0.0
    else -> numberOrNull() ?: 0.0
}

fun Value.asBool(): Boolean = when (this) {
    is Value.Bool -> v
    is Value.Num -> v != 0.0
    is Value.Str -> v.isNotEmpty() && v != "false" && v != "0"
}

fun formatNumber(d: Double): String = when {
    d.isNaN() || d.isInfinite() -> "0"
    d == floor(d) && abs(d) < 1e15 -> d.toLong().toString()
    else -> d.toString()
}
