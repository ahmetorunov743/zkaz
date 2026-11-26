package com.orvenadigital.create.core.engine

import com.orvenadigital.create.core.model.Action
import com.orvenadigital.create.core.model.ArithOp
import com.orvenadigital.create.core.model.CompareOp
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Expr
import com.orvenadigital.create.core.model.LogicOp
import com.orvenadigital.create.core.model.MathFn
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.Screen
import com.orvenadigital.create.core.model.Script
import com.orvenadigital.create.core.model.SensorKind
import com.orvenadigital.create.core.model.SpriteAttrKind
import com.orvenadigital.create.core.model.StopMode
import com.orvenadigital.create.core.model.Targets
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.Calendar
import kotlin.coroutines.resume
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.random.Random

/** What blocks can touch outside the game world. The Android runtime implements it. */
interface RuntimeHost {
    fun getProperty(componentId: String, property: String): String?
    fun setProperty(componentId: String, property: String, value: String)
    fun showMessage(text: String)
    fun openScreen(screenId: String)
    fun goBack()
    suspend fun ask(question: String): String
    suspend fun playNote(note: Double, seconds: Double)
    fun vibrate(millis: Long)
    /** Device tilt in degrees: left-right and forward-back. */
    fun tilt(): Pair<Double, Double>
}

private class StopScript : Exception() {
    override fun fillInStackTrace(): Throwable = this
}

private data class ThreadKey(val token: Int, val owner: SpriteInstance?, val scriptId: String)

private class Ctx(val world: ScreenWorld, val self: SpriteInstance?, val key: ThreadKey) {
    var steps = 0
}

/**
 * Runs blocks like Scratch: every event starts its scripts as parallel "threads" (coroutines).
 * Loops give way once per frame, "wait" blocks pause only their own script, and
 * "broadcast" starts every "when I receive" script, in screens and in sprites alike.
 *
 * Single-threaded: everything (events, [frame], coroutines) runs on one dispatcher.
 */
class Engine(
    val project: Project,
    private val host: RuntimeHost,
    private val scope: CoroutineScope,
    private val random: Random = Random.Default,
    private val clock: () -> Long = System::nanoTime,
) {
    private val variables = LinkedHashMap<String, Value>()
    private val lists = LinkedHashMap<String, MutableList<Value>>()
    private val pictures = project.pictures.associateBy { it.id }
    private val worlds = LinkedHashMap<Int, ScreenWorld>()
    private val threads = HashMap<ThreadKey, Job>()
    private val frameWaiters = ArrayList<CancellableContinuation<Unit>>()
    private var timerStart = clock()
    private var answer = ""

    var current: ScreenWorld? = null
        private set

    /** Something visible changed since the last frame. */
    var redrawRequested = false
        private set

    init {
        resetData()
    }

    private fun resetData() {
        variables.clear()
        for (v in project.variables) variables[v.name] = Value.parse(v.initial)
        lists.clear()
        for (l in project.lists) lists[l] = ArrayList()
        timerStart = clock()
        answer = ""
    }

    fun reset() {
        stopAll()
        worlds.clear()
        current = null
        resetData()
    }

    fun variable(name: String): Value? = variables[name]

    fun list(name: String): List<Value> = lists[name].orEmpty()

    val runningScripts: Int get() = threads.size

    // ---------------------------------------------------------------- screens and events

    /** A screen was opened: build its world and fire "when screen opened". */
    fun enterScreen(token: Int, screen: Screen): ScreenWorld {
        current?.let { stopSpriteThreads(it) }
        val world = ScreenWorld(token, screen, pictures) { id, key -> host.getProperty(id, key) }
        worlds[token] = world
        current = world
        fire(world, Event.ScreenOpened)
        return world
    }

    /** A screen was closed: its sprites stop, the screen below becomes current. */
    fun leaveScreen(token: Int) {
        val world = worlds.remove(token) ?: return
        stopSpriteThreads(world)
        if (current === world) current = worlds.values.lastOrNull()
    }

    fun world(token: Int): ScreenWorld? = worlds[token]

    fun dispatch(event: Event) {
        current?.let { fire(it, event) }
    }

    /** A finger touched a stage at ([x], [y]) in stage coordinates. */
    fun tapStage(stageId: String, x: Double, y: Double) {
        val world = current ?: return
        val stage = world.stages[stageId] ?: return
        stage.fingerX = x
        stage.fingerY = y
        stage.fingerDown = true
        val hit = stage.hit(x, y)
        if (hit != null) fire(world, Event.SpriteTapped(hit.sprite.id), target = hit)
        else fire(world, Event.StageTapped(stageId))
    }

    /** Called once per display frame: physics, contacts, then loops waiting for the frame go on. */
    fun frame(dtSeconds: Double) {
        val world = current
        redrawRequested = false
        if (world != null) {
            for (stage in world.stages.values) {
                stage.step(dtSeconds) { instance, target -> onContact(world, instance, target) }
            }
        }
        if (frameWaiters.isNotEmpty()) {
            val waiting = ArrayList(frameWaiters)
            frameWaiters.clear()
            for (c in waiting) if (c.isActive) c.resume(Unit)
        }
    }

    private fun fire(world: ScreenWorld, event: Event, target: SpriteInstance? = null): List<Job> {
        val jobs = ArrayList<Job>()
        if (event != Event.CloneStarted) {
            for (s in world.screen.scripts) if (s.event == event) jobs += start(world, null, s)
        }
        val owners: List<SpriteInstance> = when (event) {
            is Event.SpriteTapped, Event.CloneStarted -> listOfNotNull(target)
            is Event.Receive -> world.instances()
            else -> world.instances().filter { !it.isClone }
        }
        for (owner in owners) {
            for (s in owner.sprite.scripts) if (s.event == event) jobs += start(world, owner, s)
        }
        return jobs
    }

    private fun onContact(world: ScreenWorld, instance: SpriteInstance, target: String) {
        fun matches(e: Event) = e is Event.Touched && e.spriteId == instance.sprite.id &&
            (e.target == target || (e.target == Targets.ANY && target != Targets.EDGE))
        for (s in world.screen.scripts) if (matches(s.event)) start(world, null, s)
        for (s in instance.sprite.scripts) if (matches(s.event)) start(world, instance, s)
    }

    // ---------------------------------------------------------------- threads

    private fun start(world: ScreenWorld, owner: SpriteInstance?, script: Script): Job {
        val key = ThreadKey(world.token, owner, script.id)
        threads.remove(key)?.cancel() // like Scratch: an event restarts its running script
        val job = scope.launch {
            try {
                run(script.actions, Ctx(world, owner, key))
            } catch (_: StopScript) {
                // "stop this script"
            }
        }
        threads[key] = job
        job.invokeOnCompletion { if (threads[key] === job) threads.remove(key) }
        return job
    }

    fun stopAll() {
        val all = threads.values.toList()
        threads.clear()
        all.forEach { it.cancel() }
    }

    private fun stopSpriteThreads(world: ScreenWorld) {
        val keys = threads.keys.filter { it.token == world.token && it.owner != null }
        keys.forEach { threads.remove(it)?.cancel() }
    }

    private fun stopOwner(world: ScreenWorld, owner: SpriteInstance?, except: ThreadKey?) {
        val keys = threads.keys.filter { it.token == world.token && it.owner === owner && it != except }
        keys.forEach { threads.remove(it)?.cancel() }
    }

    suspend fun awaitFrame() = suspendCancellableCoroutine<Unit> { cont ->
        frameWaiters += cont
        cont.invokeOnCancellation { frameWaiters.remove(cont) }
    }

    private fun redraw() {
        redrawRequested = true
    }

    // ---------------------------------------------------------------- actions

    private suspend fun run(actions: List<Action>, ctx: Ctx) {
        for (action in actions) exec(action, ctx)
    }

    private suspend fun loopYield(ctx: Ctx, always: Boolean) {
        if (always || redrawRequested) {
            ctx.steps = 0
            awaitFrame()
        }
    }

    private suspend fun exec(action: Action, ctx: Ctx) {
        if (++ctx.steps > YIELD_STEPS) {
            // a long computation without pauses: let the screen breathe instead of freezing
            ctx.steps = 0
            awaitFrame()
        }
        val self = ctx.self
        when (action) {
            // ---- interface
            is Action.SetProperty -> {
                host.setProperty(action.componentId, action.property, eval(action.value, ctx).asText())
                redraw()
            }
            is Action.ShowMessage -> host.showMessage(eval(action.message, ctx).asText())
            is Action.OpenScreen -> host.openScreen(action.screenId)
            Action.GoBack -> host.goBack()
            is Action.Ask -> answer = host.ask(eval(action.question, ctx).asText())

            // ---- variables and lists
            is Action.SetVariable -> variables[action.name] = eval(action.value, ctx)
            is Action.ChangeVariable -> {
                val current = variables[action.name]?.asNumber() ?: 0.0
                variables[action.name] = Value.Num(current + eval(action.by, ctx).asNumber())
            }
            is Action.ListAdd -> {
                val list = lists.getOrPut(action.list) { ArrayList() }
                if (list.size < MAX_LIST) list += eval(action.value, ctx)
            }
            is Action.ListDelete -> {
                val list = lists[action.list] ?: return
                val index = listIndex(eval(action.index, ctx), list.size)
                if (index != null) list.removeAt(index)
            }
            is Action.ListClear -> lists[action.list]?.clear()
            is Action.ListReplace -> {
                val list = lists[action.list] ?: return
                val index = listIndex(eval(action.index, ctx), list.size)
                if (index != null) list[index] = eval(action.value, ctx)
            }

            // ---- control
            is Action.If -> if (eval(action.condition, ctx).asBool()) run(action.then, ctx) else run(action.otherwise, ctx)
            is Action.Repeat -> {
                val times = eval(action.times, ctx).asNumber().toInt().coerceIn(0, MAX_REPEAT)
                repeat(times) {
                    run(action.body, ctx)
                    loopYield(ctx, always = false)
                }
            }
            is Action.Forever -> while (true) {
                run(action.body, ctx)
                loopYield(ctx, always = true)
            }
            is Action.RepeatUntil -> while (!eval(action.condition, ctx).asBool()) {
                run(action.body, ctx)
                loopYield(ctx, always = true)
            }
            is Action.Wait -> {
                val ms = (eval(action.seconds, ctx).asNumber() * 1000).toLong().coerceIn(0, MAX_WAIT_MS)
                if (ms == 0L) awaitFrame() else delay(ms)
            }
            is Action.WaitUntil -> while (!eval(action.condition, ctx).asBool()) awaitFrame()
            is Action.Stop -> when (action.mode) {
                StopMode.ALL -> {
                    stopAll()
                    throw StopScript()
                }
                StopMode.THIS_SCRIPT -> throw StopScript()
                StopMode.OTHER_SCRIPTS -> stopOwner(ctx.world, self, except = ctx.key)
            }
            is Action.Broadcast -> {
                val jobs = fire(ctx.world, Event.Receive(action.message))
                if (action.andWait) jobs.joinAll()
            }
            is Action.CreateClone -> {
                val source = if (action.spriteId == Targets.SELF) self else ctx.world.original(action.spriteId)
                if (source != null && !source.deleted && ctx.world.cloneCount() < ScreenWorld.MAX_CLONES) {
                    val clone = SpriteInstance(source.sprite, source.stage, isClone = true)
                    clone.copyStateFrom(source)
                    val at = source.stage.instances.indexOf(source).coerceAtLeast(0)
                    source.stage.instances.add(at, clone)
                    redraw()
                    fire(ctx.world, Event.CloneStarted, target = clone)
                }
            }
            Action.DeleteClone -> if (self != null && self.isClone) {
                self.deleted = true
                self.stage.instances.remove(self)
                redraw()
                stopOwner(ctx.world, self, except = ctx.key)
                throw StopScript()
            }
            Action.ResetTimer -> timerStart = clock()

            // ---- sound
            is Action.PlayNote -> host.playNote(
                eval(action.note, ctx).asNumber().coerceIn(0.0, 127.0),
                eval(action.seconds, ctx).asNumber().coerceIn(0.0, 10.0),
            )
            is Action.Vibrate -> host.vibrate(eval(action.millis, ctx).asNumber().toLong().coerceIn(0, 5000))

            // ---- sprite-only blocks: do nothing on a screen script
            else -> if (self != null) spriteAction(action, self, ctx)
        }
    }

    private suspend fun spriteAction(action: Action, s: SpriteInstance, ctx: Ctx) {
        when (action) {
            // ---- motion
            is Action.Move -> {
                val steps = eval(action.steps, ctx).asNumber()
                val rad = Math.toRadians(s.direction)
                s.x += steps * sin(rad)
                s.y += steps * cos(rad)
            }
            is Action.Turn -> s.direction = clampAngle(s.direction + eval(action.degrees, ctx).asNumber())
            is Action.PointInDirection -> s.direction = clampAngle(eval(action.direction, ctx).asNumber())
            is Action.PointTowards -> {
                val (tx, ty) = targetPoint(action.target, s, ctx) ?: return
                if (tx != s.x || ty != s.y) s.direction = clampAngle(Math.toDegrees(atan2(tx - s.x, ty - s.y)))
            }
            is Action.GoTo -> {
                s.x = eval(action.x, ctx).asNumber()
                s.y = eval(action.y, ctx).asNumber()
            }
            is Action.GoToTarget -> {
                val (tx, ty) = targetPoint(action.target, s, ctx) ?: return
                s.x = tx
                s.y = ty
            }
            is Action.Glide -> {
                val seconds = eval(action.seconds, ctx).asNumber().coerceIn(0.0, MAX_WAIT_MS / 1000.0)
                val tx = eval(action.x, ctx).asNumber()
                val ty = eval(action.y, ctx).asNumber()
                val sx = s.x
                val sy = s.y
                val started = clock()
                while (seconds > 0) {
                    val t = (clock() - started) / 1e9 / seconds
                    if (t >= 1) break
                    s.x = sx + (tx - sx) * t
                    s.y = sy + (ty - sy) * t
                    redraw()
                    awaitFrame()
                }
                s.x = tx
                s.y = ty
            }
            is Action.ChangeX -> s.x += eval(action.by, ctx).asNumber()
            is Action.SetX -> s.x = eval(action.value, ctx).asNumber()
            is Action.ChangeY -> s.y += eval(action.by, ctx).asNumber()
            is Action.SetY -> s.y = eval(action.value, ctx).asNumber()
            Action.BounceOnEdge -> bounceOnEdge(s)
            is Action.SetRotationStyle -> s.rotationStyle = action.style

            // ---- looks
            is Action.SetCostume -> {
                val index = costumeIndex(s, eval(action.costume, ctx))
                if (index != null) s.costume = index
            }
            Action.NextCostume -> if (s.sprite.costumes.isNotEmpty()) s.costume = (s.costume + 1) % s.sprite.costumes.size
            is Action.SetSize -> s.size = eval(action.percent, ctx).asNumber().coerceIn(1.0, 2000.0)
            is Action.ChangeSize -> s.size = (s.size + eval(action.by, ctx).asNumber()).coerceIn(1.0, 2000.0)
            Action.Show -> s.visible = true
            Action.Hide -> s.visible = false
            is Action.Say -> {
                s.sayToken++
                s.sayText = eval(action.text, ctx).asText().ifEmpty { null }
            }
            is Action.SayFor -> {
                val token = ++s.sayToken
                s.sayText = eval(action.text, ctx).asText().ifEmpty { null }
                redraw()
                val ms = (eval(action.seconds, ctx).asNumber() * 1000).toLong().coerceIn(0, MAX_WAIT_MS)
                delay(ms)
                if (s.sayToken == token) s.sayText = null
            }
            is Action.SetGhost -> s.ghost = eval(action.percent, ctx).asNumber().coerceIn(0.0, 100.0)
            Action.GoToFront -> {
                val list = s.stage.instances
                if (list.remove(s)) list.add(s)
            }

            // ---- physics
            is Action.SetPhysics -> {
                s.physics = action.type
                if (action.type != com.orvenadigital.create.core.model.PhysicsType.DYNAMIC) {
                    s.vx = 0.0
                    s.vy = 0.0
                }
            }
            is Action.SetVelocity -> {
                s.vx = eval(action.vx, ctx).asNumber()
                s.vy = eval(action.vy, ctx).asNumber()
            }
            is Action.Push -> {
                s.vx += eval(action.dvx, ctx).asNumber()
                s.vy += eval(action.dvy, ctx).asNumber()
            }
            is Action.SetGravity -> host.setProperty(s.stage.id, "gravity", eval(action.value, ctx).asText())
            is Action.SetBounce -> s.bounce = eval(action.percent, ctx).asNumber().coerceIn(0.0, 100.0)
            is Action.SetFriction -> s.friction = eval(action.percent, ctx).asNumber().coerceIn(0.0, 100.0)

            else -> Unit
        }
        redraw()
    }

    private fun bounceOnEdge(s: SpriteInstance) {
        val w = s.stage.width / 2
        val h = s.stage.height / 2
        val hw = s.halfWidth()
        val hh = s.halfHeight()
        if (s.x - hw < -w) { s.x = -w + hw; s.direction = clampAngle(-s.direction); s.vx = kotlin.math.abs(s.vx) }
        if (s.x + hw > w) { s.x = w - hw; s.direction = clampAngle(-s.direction); s.vx = -kotlin.math.abs(s.vx) }
        if (s.y + hh > h) { s.y = h - hh; s.direction = clampAngle(180 - s.direction); s.vy = -kotlin.math.abs(s.vy) }
        if (s.y - hh < -h) { s.y = -h + hh; s.direction = clampAngle(180 - s.direction); s.vy = kotlin.math.abs(s.vy) }
    }

    private fun targetPoint(target: String, s: SpriteInstance?, ctx: Ctx): Pair<Double, Double>? {
        val stage = s?.stage ?: ctx.world.firstStage()
        return when (target) {
            Targets.RANDOM -> {
                val w = (stage?.width ?: 360.0) / 2
                val h = (stage?.height ?: 400.0) / 2
                random.nextDouble(-w, w) to random.nextDouble(-h, h)
            }
            Targets.FINGER -> stage?.let { it.fingerX to it.fingerY }
            else -> ctx.world.original(target)?.let { it.x to it.y }
        }
    }

    private fun costumeIndex(s: SpriteInstance, value: Value): Int? {
        val costumes = s.sprite.costumes
        if (costumes.isEmpty()) return null
        if (value is Value.Str) {
            // a costume name wins over a number-like text
            val byName = costumes.indexOfFirst { id -> pictures[id]?.name == value.v }
            if (byName >= 0) return byName
            val byId = costumes.indexOf(value.v)
            if (byId >= 0) return byId
        }
        val n = value.numberOrNull() ?: return null
        return (n.toInt() - 1).mod(costumes.size)
    }

    private fun listIndex(value: Value, size: Int): Int? {
        val text = value.asText().trim().lowercase()
        val i = when (text) {
            "последний", "last" -> size - 1
            else -> value.asNumber().toInt() - 1
        }
        return i.takeIf { it in 0 until size }
    }

    // ---------------------------------------------------------------- expressions

    private fun eval(expr: Expr, ctx: Ctx): Value = when (expr) {
        is Expr.Text -> Value.Str(expr.value)
        is Expr.Num -> Value.Num(expr.value)
        is Expr.Bool -> Value.Bool(expr.value)
        is Expr.GetVariable -> variables[expr.name] ?: Value.Str("")
        is Expr.GetProperty -> Value.Str(host.getProperty(expr.componentId, expr.property) ?: "")
        is Expr.Join -> Value.Str(eval(expr.left, ctx).asText() + eval(expr.right, ctx).asText())
        is Expr.Arithmetic -> {
            val a = eval(expr.left, ctx).asNumber()
            val b = eval(expr.right, ctx).asNumber()
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
        is Expr.Compare -> Value.Bool(compare(expr.op, eval(expr.left, ctx), eval(expr.right, ctx)))
        is Expr.Logic -> {
            val a = eval(expr.left, ctx).asBool()
            Value.Bool(
                when (expr.op) {
                    LogicOp.AND -> a && eval(expr.right, ctx).asBool()
                    LogicOp.OR -> a || eval(expr.right, ctx).asBool()
                },
            )
        }
        is Expr.Not -> Value.Bool(!eval(expr.value, ctx).asBool())
        is Expr.RandomInt -> {
            val a = eval(expr.from, ctx).asNumber().toLong()
            val b = eval(expr.to, ctx).asNumber().toLong()
            Value.Num(random.nextLong(minOf(a, b), maxOf(a, b) + 1).toDouble())
        }
        is Expr.MathFunc -> {
            val v = eval(expr.value, ctx).asNumber()
            Value.Num(
                when (expr.fn) {
                    MathFn.ABS -> kotlin.math.abs(v)
                    MathFn.FLOOR -> kotlin.math.floor(v)
                    MathFn.CEIL -> kotlin.math.ceil(v)
                    MathFn.ROUND -> kotlin.math.round(v)
                    MathFn.SQRT -> if (v < 0) 0.0 else kotlin.math.sqrt(v)
                    MathFn.SIN -> clean(sin(Math.toRadians(v)))
                    MathFn.COS -> clean(cos(Math.toRadians(v)))
                    MathFn.TAN -> clean(kotlin.math.tan(Math.toRadians(v)))
                    MathFn.LN -> if (v <= 0) 0.0 else kotlin.math.ln(v)
                    MathFn.LOG10 -> if (v <= 0) 0.0 else kotlin.math.log10(v)
                },
            )
        }
        is Expr.TextLength -> Value.Num(eval(expr.value, ctx).asText().length.toDouble())
        is Expr.LetterOf -> {
            val text = eval(expr.text, ctx).asText()
            val i = eval(expr.index, ctx).asNumber().toInt() - 1
            Value.Str(if (i in text.indices) text[i].toString() else "")
        }
        is Expr.Contains -> Value.Bool(eval(expr.text, ctx).asText().contains(eval(expr.part, ctx).asText(), ignoreCase = true))
        is Expr.ListItem -> {
            val list = lists[expr.list].orEmpty()
            listIndex(eval(expr.index, ctx), list.size)?.let { list[it] } ?: Value.Str("")
        }
        is Expr.ListLength -> Value.Num(lists[expr.list].orEmpty().size.toDouble())
        is Expr.ListContains -> {
            val needle = eval(expr.value, ctx).asText()
            Value.Bool(lists[expr.list].orEmpty().any { it.asText().equals(needle, ignoreCase = true) })
        }
        is Expr.Touching -> Value.Bool(ctx.self?.let { it.stage.touching(it, expr.target) } ?: false)
        is Expr.Sensor -> sensor(expr.kind, ctx)
        is Expr.SpriteAttr -> spriteAttr(expr, ctx)
        is Expr.DistanceTo -> {
            val s = ctx.self
            val p = if (s != null) targetPoint(expr.target, s, ctx) else null
            Value.Num(if (s != null && p != null) hypot(p.first - s.x, p.second - s.y) else 0.0)
        }
    }

    private fun clean(v: Double): Double = kotlin.math.round(v * 1e10) / 1e10

    private fun sensor(kind: SensorKind, ctx: Ctx): Value {
        val stage = ctx.self?.stage ?: ctx.world.firstStage()
        val calendar by lazy { Calendar.getInstance() }
        return when (kind) {
            SensorKind.FINGER_X -> Value.Num(kotlin.math.round(stage?.fingerX ?: 0.0))
            SensorKind.FINGER_Y -> Value.Num(kotlin.math.round(stage?.fingerY ?: 0.0))
            SensorKind.FINGER_DOWN -> Value.Bool(stage?.fingerDown ?: false)
            SensorKind.TIMER -> Value.Num(kotlin.math.round((clock() - timerStart) / 1e6) / 1000.0)
            SensorKind.ANSWER -> Value.Str(answer)
            SensorKind.TILT_X -> Value.Num(kotlin.math.round(host.tilt().first))
            SensorKind.TILT_Y -> Value.Num(kotlin.math.round(host.tilt().second))
            SensorKind.STAGE_WIDTH -> Value.Num(kotlin.math.round(stage?.width ?: 0.0))
            SensorKind.STAGE_HEIGHT -> Value.Num(kotlin.math.round(stage?.height ?: 0.0))
            SensorKind.YEAR -> Value.Num(calendar.get(Calendar.YEAR).toDouble())
            SensorKind.MONTH -> Value.Num((calendar.get(Calendar.MONTH) + 1).toDouble())
            SensorKind.DAY -> Value.Num(calendar.get(Calendar.DAY_OF_MONTH).toDouble())
            SensorKind.WEEKDAY -> Value.Num((((calendar.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1).toDouble()) // Monday = 1
            SensorKind.HOUR -> Value.Num(calendar.get(Calendar.HOUR_OF_DAY).toDouble())
            SensorKind.MINUTE -> Value.Num(calendar.get(Calendar.MINUTE).toDouble())
            SensorKind.SECOND -> Value.Num(calendar.get(Calendar.SECOND).toDouble())
        }
    }

    private fun spriteAttr(expr: Expr.SpriteAttr, ctx: Ctx): Value {
        val empty = if (expr.attr == SpriteAttrKind.COSTUME_NAME) Value.Str("") else Value.Num(0.0)
        val s = (if (expr.spriteId == Targets.SELF) ctx.self else ctx.world.original(expr.spriteId)) ?: return empty
        return when (expr.attr) {
            SpriteAttrKind.X -> Value.Num(kotlin.math.round(s.x * 100) / 100)
            SpriteAttrKind.Y -> Value.Num(kotlin.math.round(s.y * 100) / 100)
            SpriteAttrKind.DIRECTION -> Value.Num(s.direction)
            SpriteAttrKind.SIZE -> Value.Num(s.size)
            SpriteAttrKind.COSTUME_NUMBER -> Value.Num((s.costume + 1).toDouble())
            SpriteAttrKind.COSTUME_NAME -> Value.Str(s.picture()?.name ?: "")
            SpriteAttrKind.VELOCITY_X -> Value.Num(kotlin.math.round(s.vx))
            SpriteAttrKind.VELOCITY_Y -> Value.Num(kotlin.math.round(s.vy))
        }
    }

    private fun compare(op: CompareOp, a: Value, b: Value): Boolean {
        val na = a.numberOrNull()
        val nb = b.numberOrNull()
        val cmp = if (na != null && nb != null) na.compareTo(nb) else a.asText().lowercase().compareTo(b.asText().lowercase())
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
        const val MAX_REPEAT = 100_000
        const val MAX_LIST = 10_000
        const val MAX_WAIT_MS = 3_600_000L
        private const val YIELD_STEPS = 20_000
    }
}
