package com.orvenadigital.create.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
sealed interface Event {
    @Serializable
    @SerialName("screen_opened")
    data object ScreenOpened : Event

    @Serializable
    @SerialName("clicked")
    data class Clicked(val componentId: String) : Event

    @Serializable
    @SerialName("text_changed")
    data class TextChanged(val componentId: String) : Event

    @Serializable
    @SerialName("checked_changed")
    data class CheckedChanged(val componentId: String) : Event
}

@Serializable
sealed interface Action {
    @Serializable
    @SerialName("set_prop")
    data class SetProperty(val componentId: String, val property: String, val value: Expr) : Action

    @Serializable
    @SerialName("set_var")
    data class SetVariable(val name: String, val value: Expr) : Action

    @Serializable
    @SerialName("change_var")
    data class ChangeVariable(val name: String, val by: Expr) : Action

    @Serializable
    @SerialName("message")
    data class ShowMessage(val message: Expr) : Action

    @Serializable
    @SerialName("open_screen")
    data class OpenScreen(val screenId: String) : Action

    @Serializable
    @SerialName("go_back")
    data object GoBack : Action

    @Serializable
    @SerialName("if")
    data class If(
        val condition: Expr,
        val then: List<Action> = emptyList(),
        val otherwise: List<Action> = emptyList(),
    ) : Action

    @Serializable
    @SerialName("repeat")
    data class Repeat(val times: Expr, val body: List<Action> = emptyList()) : Action
}

@Serializable
sealed interface Expr {
    @Serializable
    @SerialName("text")
    data class Text(val value: String) : Expr

    @Serializable
    @SerialName("number")
    data class Num(val value: Double) : Expr

    @Serializable
    @SerialName("bool")
    data class Bool(val value: Boolean) : Expr

    @Serializable
    @SerialName("var")
    data class GetVariable(val name: String) : Expr

    @Serializable
    @SerialName("prop")
    data class GetProperty(val componentId: String, val property: String) : Expr

    @Serializable
    @SerialName("join")
    data class Join(val left: Expr, val right: Expr) : Expr

    @Serializable
    @SerialName("arith")
    data class Arithmetic(val op: ArithOp, val left: Expr, val right: Expr) : Expr

    @Serializable
    @SerialName("compare")
    data class Compare(val op: CompareOp, val left: Expr, val right: Expr) : Expr

    @Serializable
    @SerialName("logic")
    data class Logic(val op: LogicOp, val left: Expr, val right: Expr) : Expr

    @Serializable
    @SerialName("not")
    data class Not(val value: Expr) : Expr

    @Serializable
    @SerialName("random")
    data class RandomInt(val from: Expr, val to: Expr) : Expr
}

@Serializable
enum class ArithOp(val symbol: String) {
    @SerialName("add") ADD("+"),
    @SerialName("sub") SUB("−"),
    @SerialName("mul") MUL("×"),
    @SerialName("div") DIV("÷"),
    @SerialName("mod") MOD("%"),
}

@Serializable
enum class CompareOp(val symbol: String) {
    @SerialName("eq") EQ("="),
    @SerialName("neq") NEQ("≠"),
    @SerialName("lt") LT("<"),
    @SerialName("gt") GT(">"),
    @SerialName("le") LE("≤"),
    @SerialName("ge") GE("≥"),
}

@Serializable
enum class LogicOp(val symbol: String) {
    @SerialName("and") AND("и"),
    @SerialName("or") OR("или"),
}

/** Next value in an enum, wrapping around: used by the editor to cycle operators on tap. */
inline fun <reified T : Enum<T>> T.next(): T {
    val values = enumValues<T>()
    return values[(ordinal + 1) % values.size]
}
