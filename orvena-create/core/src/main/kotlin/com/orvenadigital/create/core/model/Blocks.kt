package com.orvenadigital.create.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Special targets for "touching", "go to", "point towards" and similar blocks. */
object Targets {
    const val SELF = ""
    const val EDGE = "_edge"
    const val ANY = "_any"
    const val FINGER = "_finger"
    const val RANDOM = "_random"
}

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

    @Serializable
    @SerialName("sprite_tapped")
    data class SpriteTapped(val spriteId: String) : Event

    @Serializable
    @SerialName("stage_tapped")
    data class StageTapped(val componentId: String) : Event

    /** "When I receive <message>": started by a broadcast from any script. */
    @Serializable
    @SerialName("receive")
    data class Receive(val message: String) : Event

    /** [spriteId] starts touching [target]: a sprite id, [Targets.EDGE] or [Targets.ANY]. */
    @Serializable
    @SerialName("touched")
    data class Touched(val spriteId: String, val target: String) : Event

    @Serializable
    @SerialName("clone_started")
    data object CloneStarted : Event
}

@Serializable
sealed interface Action {
    // ---- interface / app ----
    @Serializable
    @SerialName("set_prop")
    data class SetProperty(val componentId: String, val property: String, val value: Expr) : Action

    @Serializable
    @SerialName("message")
    data class ShowMessage(val message: Expr) : Action

    @Serializable
    @SerialName("open_screen")
    data class OpenScreen(val screenId: String) : Action

    @Serializable
    @SerialName("go_back")
    data object GoBack : Action

    /** Shows a question with a text field and waits for the answer (see [SensorKind.ANSWER]). */
    @Serializable
    @SerialName("ask")
    data class Ask(val question: Expr) : Action

    // ---- variables and lists ----
    @Serializable
    @SerialName("set_var")
    data class SetVariable(val name: String, val value: Expr) : Action

    @Serializable
    @SerialName("change_var")
    data class ChangeVariable(val name: String, val by: Expr) : Action

    @Serializable
    @SerialName("list_add")
    data class ListAdd(val list: String, val value: Expr) : Action

    @Serializable
    @SerialName("list_delete")
    data class ListDelete(val list: String, val index: Expr) : Action

    @Serializable
    @SerialName("list_clear")
    data class ListClear(val list: String) : Action

    @Serializable
    @SerialName("list_replace")
    data class ListReplace(val list: String, val index: Expr, val value: Expr) : Action

    // ---- control ----
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

    @Serializable
    @SerialName("forever")
    data class Forever(val body: List<Action> = emptyList()) : Action

    @Serializable
    @SerialName("repeat_until")
    data class RepeatUntil(val condition: Expr, val body: List<Action> = emptyList()) : Action

    @Serializable
    @SerialName("wait")
    data class Wait(val seconds: Expr) : Action

    @Serializable
    @SerialName("wait_until")
    data class WaitUntil(val condition: Expr) : Action

    @Serializable
    @SerialName("stop")
    data class Stop(val mode: StopMode) : Action

    @Serializable
    @SerialName("broadcast")
    data class Broadcast(val message: String, val andWait: Boolean = false) : Action

    @Serializable
    @SerialName("create_clone")
    data class CreateClone(val spriteId: String = Targets.SELF) : Action

    @Serializable
    @SerialName("delete_clone")
    data object DeleteClone : Action

    @Serializable
    @SerialName("reset_timer")
    data object ResetTimer : Action

    // ---- motion (sprite) ----
    @Serializable
    @SerialName("move")
    data class Move(val steps: Expr) : Action

    @Serializable
    @SerialName("turn")
    data class Turn(val degrees: Expr) : Action

    @Serializable
    @SerialName("point_dir")
    data class PointInDirection(val direction: Expr) : Action

    @Serializable
    @SerialName("point_towards")
    data class PointTowards(val target: String) : Action

    @Serializable
    @SerialName("goto_xy")
    data class GoTo(val x: Expr, val y: Expr) : Action

    @Serializable
    @SerialName("goto_target")
    data class GoToTarget(val target: String) : Action

    @Serializable
    @SerialName("glide")
    data class Glide(val seconds: Expr, val x: Expr, val y: Expr) : Action

    @Serializable
    @SerialName("change_x")
    data class ChangeX(val by: Expr) : Action

    @Serializable
    @SerialName("set_x")
    data class SetX(val value: Expr) : Action

    @Serializable
    @SerialName("change_y")
    data class ChangeY(val by: Expr) : Action

    @Serializable
    @SerialName("set_y")
    data class SetY(val value: Expr) : Action

    @Serializable
    @SerialName("bounce_edge")
    data object BounceOnEdge : Action

    @Serializable
    @SerialName("rotation_style")
    data class SetRotationStyle(val style: RotationStyle) : Action

    // ---- looks (sprite) ----
    @Serializable
    @SerialName("set_costume")
    data class SetCostume(val costume: Expr) : Action

    @Serializable
    @SerialName("next_costume")
    data object NextCostume : Action

    @Serializable
    @SerialName("set_size")
    data class SetSize(val percent: Expr) : Action

    @Serializable
    @SerialName("change_size")
    data class ChangeSize(val by: Expr) : Action

    @Serializable
    @SerialName("show")
    data object Show : Action

    @Serializable
    @SerialName("hide")
    data object Hide : Action

    @Serializable
    @SerialName("say")
    data class Say(val text: Expr) : Action

    @Serializable
    @SerialName("say_for")
    data class SayFor(val text: Expr, val seconds: Expr) : Action

    @Serializable
    @SerialName("set_ghost")
    data class SetGhost(val percent: Expr) : Action

    @Serializable
    @SerialName("front")
    data object GoToFront : Action

    // ---- physics (sprite) ----
    @Serializable
    @SerialName("set_physics")
    data class SetPhysics(val type: PhysicsType) : Action

    @Serializable
    @SerialName("set_velocity")
    data class SetVelocity(val vx: Expr, val vy: Expr) : Action

    @Serializable
    @SerialName("push")
    data class Push(val dvx: Expr, val dvy: Expr) : Action

    @Serializable
    @SerialName("set_gravity")
    data class SetGravity(val value: Expr) : Action

    @Serializable
    @SerialName("set_bounce")
    data class SetBounce(val percent: Expr) : Action

    @Serializable
    @SerialName("set_friction")
    data class SetFriction(val percent: Expr) : Action

    // ---- sound ----
    @Serializable
    @SerialName("play_note")
    data class PlayNote(val note: Expr, val seconds: Expr) : Action

    @Serializable
    @SerialName("vibrate")
    data class Vibrate(val millis: Expr) : Action
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

    @Serializable
    @SerialName("math_fn")
    data class MathFunc(val fn: MathFn, val value: Expr) : Expr

    @Serializable
    @SerialName("text_length")
    data class TextLength(val value: Expr) : Expr

    @Serializable
    @SerialName("letter_of")
    data class LetterOf(val index: Expr, val text: Expr) : Expr

    @Serializable
    @SerialName("contains")
    data class Contains(val text: Expr, val part: Expr) : Expr

    @Serializable
    @SerialName("list_item")
    data class ListItem(val list: String, val index: Expr) : Expr

    @Serializable
    @SerialName("list_length")
    data class ListLength(val list: String) : Expr

    @Serializable
    @SerialName("list_contains")
    data class ListContains(val list: String, val value: Expr) : Expr

    /** Is this sprite touching [target] (sprite id, edge, finger, any)? */
    @Serializable
    @SerialName("touching")
    data class Touching(val target: String) : Expr

    @Serializable
    @SerialName("sensor")
    data class Sensor(val kind: SensorKind) : Expr

    @Serializable
    @SerialName("sprite_attr")
    data class SpriteAttr(val spriteId: String, val attr: SpriteAttrKind) : Expr

    @Serializable
    @SerialName("distance")
    data class DistanceTo(val target: String) : Expr
}

@Serializable
enum class ArithOp(val symbol: String) {
    @SerialName("add") ADD("+"),
    @SerialName("sub") SUB("−"),
    @SerialName("mul") MUL("×"),
    @SerialName("div") DIV("÷"),
    @SerialName("mod") MOD("остаток"),
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

@Serializable
enum class MathFn(val label: String) {
    @SerialName("abs") ABS("модуль"),
    @SerialName("floor") FLOOR("округлить вниз"),
    @SerialName("ceil") CEIL("округлить вверх"),
    @SerialName("round") ROUND("округлить"),
    @SerialName("sqrt") SQRT("корень"),
    @SerialName("sin") SIN("sin"),
    @SerialName("cos") COS("cos"),
    @SerialName("tan") TAN("tan"),
    @SerialName("ln") LN("ln"),
    @SerialName("log10") LOG10("log10"),
}

@Serializable
enum class StopMode(val label: String) {
    @SerialName("all") ALL("всё"),
    @SerialName("this") THIS_SCRIPT("этот скрипт"),
    @SerialName("other") OTHER_SCRIPTS("другие скрипты спрайта"),
}

@Serializable
enum class PhysicsType(val label: String) {
    @SerialName("none") NONE("без физики"),
    @SerialName("dynamic") DYNAMIC("падает и толкается"),
    @SerialName("static") STATIC("неподвижная опора"),
}

@Serializable
enum class RotationStyle(val label: String) {
    @SerialName("all") ALL_AROUND("кругом"),
    @SerialName("left_right") LEFT_RIGHT("влево-вправо"),
    @SerialName("none") DONT_ROTATE("не вращать"),
}

@Serializable
enum class SensorKind(val label: String) {
    @SerialName("finger_x") FINGER_X("палец x"),
    @SerialName("finger_y") FINGER_Y("палец y"),
    @SerialName("finger_down") FINGER_DOWN("палец нажат?"),
    @SerialName("timer") TIMER("таймер"),
    @SerialName("answer") ANSWER("ответ"),
    @SerialName("tilt_x") TILT_X("наклон влево-вправо"),
    @SerialName("tilt_y") TILT_Y("наклон вперёд-назад"),
    @SerialName("stage_width") STAGE_WIDTH("ширина сцены"),
    @SerialName("stage_height") STAGE_HEIGHT("высота сцены"),
    @SerialName("year") YEAR("год"),
    @SerialName("month") MONTH("месяц"),
    @SerialName("day") DAY("число"),
    @SerialName("weekday") WEEKDAY("день недели"),
    @SerialName("hour") HOUR("час"),
    @SerialName("minute") MINUTE("минута"),
    @SerialName("second") SECOND("секунда"),
}

@Serializable
enum class SpriteAttrKind(val label: String) {
    @SerialName("x") X("x"),
    @SerialName("y") Y("y"),
    @SerialName("direction") DIRECTION("направление"),
    @SerialName("size") SIZE("размер"),
    @SerialName("costume_number") COSTUME_NUMBER("номер костюма"),
    @SerialName("costume_name") COSTUME_NAME("имя костюма"),
    @SerialName("vx") VELOCITY_X("скорость x"),
    @SerialName("vy") VELOCITY_Y("скорость y"),
}

/** Next value in an enum, wrapping around: used by the editor to cycle operators on tap. */
inline fun <reified T : Enum<T>> T.next(): T {
    val values = enumValues<T>()
    return values[(ordinal + 1) % values.size]
}
