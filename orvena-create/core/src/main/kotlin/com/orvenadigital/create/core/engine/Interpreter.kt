package com.orvenadigital.create.core.engine

import com.orvenadigital.create.core.model.Action
import com.orvenadigital.create.core.model.ArithOp
import com.orvenadigital.create.core.model.CompareOp
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Expr
import com.orvenadigital.create.core.model.LogicOp
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.Screen
import kotlin.random.Random

/** What blocks can touch in the running app. The Compose runtime implements it. */
interface RuntimeHost {
    fun getProperty(componentId: String, property: String): String?
    fun setProperty(componentId: String, property: String, value: String)
    fun showMessage(text: String)
    fun openScreen(screenId: String)
    fun goBack()
}

class ExecutionLimitException(message: String) : RuntimeException(message)

class Interpreter(
    private val project: Project,
    private val host: RuntimeHost,
    private val random: Random = Random.Default,
    private val maxSteps: Int = 200_000,
) {
    private val variables = LinkedHashMap<String, Value>()
    private var steps = 0

    init {
        reset()
    }

    fun reset() {
        variables.clear()
        for (v in project.variables) variables[v.name] = Value.parse(v.initial)
    }

    fun variable(name: String): Value? = variables[name]

    /** Runs every script of [screen] that listens to [event]. */
    fun fire(screen: Screen, event: Event) {
        steps = 0
        for (script in screen.scripts) {
            if (script.event == event) execute(script.actions)
        }
    }

    fun execute(actions: List<Action>) {
        for (action in actions) execute(action)
    }

    private fun tick() {
        if (++steps > maxSteps) {
            throw ExecutionLimitException("Блоки выполняются слишком долго: остановлено после $maxSteps шагов")
        }
    }

    fun execute(action: Action) {
        tick()
        when (action) {
            is Action.SetProperty -> host.setProperty(action.componentId, action.property, eval(action.value).asText())
            is Action.SetVariable -> variables[action.name] = eval(action.value)
            is Action.ChangeVariable -> {
                val current = variables[action.name]?.asNumber() ?: 0.0
                variables[action.name] = Value.Num(current + eval(action.by).asNumber())
            }
            is Action.ShowMessage -> host.showMessage(eval(action.message).asText())
            is Action.OpenScreen -> host.openScreen(action.screenId)
            Action.GoBack -> host.goBack()
            is Action.If -> if (eval(action.condition).asBool()) execute(action.then) else execute(action.otherwise)
            is Action.Repeat -> {
                val times = eval(action.times).asNumber().toInt().coerceIn(0, MAX_REPEAT)
                repeat(times) { execute(action.body) }
            }
        }
    }

    fun eval(expr: Expr): Value {
        tick()
        return when (expr) {
            is Expr.Text -> Value.Str(expr.value)
            is Expr.Num -> Value.Num(expr.value)
            is Expr.Bool -> Value.Bool(expr.value)
            is Expr.GetVariable -> variables[expr.name] ?: Value.Str("")
            is Expr.GetProperty -> Value.Str(host.getProperty(expr.componentId, expr.property) ?: "")
            is Expr.Join -> Value.Str(eval(expr.left).asText() + eval(expr.right).asText())
            is Expr.Arithmetic -> {
                val a = eval(expr.left).asNumber()
                val b = eval(expr.right).asNumber()
                Value.Num(
                    when (expr.op) {
                        ArithOp.ADD -> a + b
                        ArithOp.SUB -> a - b
                        ArithOp.MUL -> a * b
                        ArithOp.DIV -> if (b == 0.0) 0.0 else a / b
                        ArithOp.MOD -> if (b == 0.0) 0.0 else a.mod(b)
                    },
                )
            }
            is Expr.Compare -> Value.Bool(compare(expr.op, eval(expr.left), eval(expr.right)))
            is Expr.Logic -> {
                val a = eval(expr.left).asBool()
                Value.Bool(
                    when (expr.op) {
                        LogicOp.AND -> a && eval(expr.right).asBool()
                        LogicOp.OR -> a || eval(expr.right).asBool()
                    },
                )
            }
            is Expr.Not -> Value.Bool(!eval(expr.value).asBool())
            is Expr.RandomInt -> {
                val a = eval(expr.from).asNumber().toLong()
                val b = eval(expr.to).asNumber().toLong()
                val lo = minOf(a, b)
                val hi = maxOf(a, b)
                Value.Num(random.nextLong(lo, hi + 1).toDouble())
            }
        }
    }

    private fun compare(op: CompareOp, a: Value, b: Value): Boolean {
        val na = a.numberOrNull()
        val nb = b.numberOrNull()
        val cmp = if (na != null && nb != null) na.compareTo(nb) else a.asText().compareTo(b.asText())
        return when (op) {
            CompareOp.EQ -> cmp == 0
            CompareOp.NEQ -> cmp != 0
            CompareOp.LT -> cmp < 0
            CompareOp.GT -> cmp > 0
            CompareOp.LE -> cmp <= 0
            CompareOp.GE -> cmp >= 0
        }
    }

    companion object {
        const val MAX_REPEAT = 10_000
    }
}
