package com.orvenadigital.create.core.engine

import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.PhysicsType
import com.orvenadigital.create.core.model.Picture
import com.orvenadigital.create.core.model.RotationStyle
import com.orvenadigital.create.core.model.Screen
import com.orvenadigital.create.core.model.Sprite
import com.orvenadigital.create.core.model.Targets
import com.orvenadigital.create.core.model.allComponents
import com.orvenadigital.create.core.model.naturalSize
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign

/** Live state of one sprite (or one of its clones) while the app runs. */
class SpriteInstance(
    val sprite: Sprite,
    val stage: StageWorld,
    val isClone: Boolean,
) {
    var x = sprite.x
    var y = sprite.y
    var size = sprite.size
    var direction = sprite.direction
    var visible = sprite.visible
    var costume = 0
    var ghost = 0.0
    var vx = 0.0
    var vy = 0.0
    var physics = sprite.physics
    var bounce = sprite.bounce
    var friction = sprite.friction
    var rotationStyle: RotationStyle = sprite.rotationStyle
    var sayText: String? = null
    var sayToken = 0
    var deleted = false

    fun copyStateFrom(other: SpriteInstance) {
        x = other.x; y = other.y; size = other.size; direction = other.direction; visible = other.visible
        costume = other.costume; ghost = other.ghost; vx = other.vx; vy = other.vy; physics = other.physics
        bounce = other.bounce; friction = other.friction; rotationStyle = other.rotationStyle
    }

    fun costumeId(): String? = sprite.costumes.getOrNull(costume)

    fun picture(): Picture? = costumeId()?.let { stage.pictures[it] }

    /** Half width and half height of the sprite's box, in dp. */
    fun halfWidth(): Double = (picture()?.source?.naturalSize()?.first ?: 64.0) * size / 200.0
    fun halfHeight(): Double = (picture()?.source?.naturalSize()?.second ?: 64.0) * size / 200.0

    fun contains(px: Double, py: Double): Boolean =
        abs(px - x) <= halfWidth() && abs(py - y) <= halfHeight()
}

/** One game stage on a screen: its sprites, physics settings and finger state. */
class StageWorld(
    val component: Component,
    val pictures: Map<String, Picture>,
    /** Reads a (possibly block-changed) property of the stage component. */
    private val property: (String) -> String?,
) {
    val id: String get() = component.id

    /** Set by the renderer from the real layout, in dp. */
    var width = 360.0
    val height: Double get() = property("height")?.toDoubleOrNull()?.takeIf { it > 0 } ?: 400.0
    val gravity: Double get() = property("gravity")?.replace(',', '.')?.toDoubleOrNull() ?: 800.0
    val solidEdges: Boolean get() = property("solidEdges") != "false"

    val instances = ArrayList<SpriteInstance>()
    var fingerX = 0.0
    var fingerY = 0.0
    var fingerDown = false

    private var contacts = HashSet<Pair<SpriteInstance, SpriteInstance>>()
    private var edgeContacts = HashSet<SpriteInstance>()

    fun original(spriteId: String): SpriteInstance? =
        instances.firstOrNull { !it.isClone && it.sprite.id == spriteId }

    fun overlaps(a: SpriteInstance, b: SpriteInstance, eps: Double = 0.5): Boolean =
        abs(a.x - b.x) < a.halfWidth() + b.halfWidth() + eps &&
            abs(a.y - b.y) < a.halfHeight() + b.halfHeight() + eps

    fun touchesEdge(a: SpriteInstance): Boolean =
        a.x - a.halfWidth() <= -width / 2 + 0.5 || a.x + a.halfWidth() >= width / 2 - 0.5 ||
            a.y - a.halfHeight() <= -height / 2 + 0.5 || a.y + a.halfHeight() >= height / 2 - 0.5

    fun touching(self: SpriteInstance, target: String): Boolean {
        if (!self.visible) return false
        return when (target) {
            Targets.EDGE -> touchesEdge(self)
            Targets.FINGER -> fingerDown && self.contains(fingerX, fingerY)
            Targets.ANY -> instances.any { it !== self && it.visible && overlaps(self, it) }
            else -> instances.any { it !== self && it.visible && it.sprite.id == target && overlaps(self, it) }
        }
    }

    /** Topmost visible sprite under the point. */
    fun hit(px: Double, py: Double): SpriteInstance? =
        instances.lastOrNull { it.visible && it.ghost < 100 && it.contains(px, py) }

    /** Advances physics by [dt] seconds and reports new contacts. */
    fun step(dt: Double, onContact: (SpriteInstance, String) -> Unit) {
        if (dt > 0) physics(dt)
        detectContacts(onContact)
    }

    private fun physics(dt: Double) {
        val g = gravity
        val bodies = instances.filter { it.visible && it.physics != PhysicsType.NONE }
        for (b in bodies) {
            if (b.physics != PhysicsType.DYNAMIC) continue
            b.vy -= g * dt
            b.vx = b.vx.coerceIn(-MAX_SPEED, MAX_SPEED)
            b.vy = b.vy.coerceIn(-MAX_SPEED, MAX_SPEED)
            b.x += b.vx * dt
            b.y += b.vy * dt
        }
        repeat(2) {
            for (i in bodies.indices) {
                val a = bodies[i]
                if (a.physics != PhysicsType.DYNAMIC) continue
                for (j in bodies.indices) {
                    if (i == j) continue
                    val b = bodies[j]
                    if (b.physics == PhysicsType.DYNAMIC && j < i) continue // each dynamic pair once
                    resolve(a, b)
                }
            }
        }
        if (solidEdges) for (b in bodies) if (b.physics == PhysicsType.DYNAMIC) keepInside(b)
    }

    private fun resolve(a: SpriteInstance, b: SpriteInstance) {
        val dx = a.x - b.x
        val dy = a.y - b.y
        val ox = a.halfWidth() + b.halfWidth() - abs(dx)
        val oy = a.halfHeight() + b.halfHeight() - abs(dy)
        if (ox <= 0 || oy <= 0) return
        val restitution = (a.bounce + b.bounce) / 200.0
        val grip = ((a.friction + b.friction) / 200.0) * 0.25
        val bDynamic = b.physics == PhysicsType.DYNAMIC
        if (ox < oy) {
            val s = if (dx == 0.0) 1.0 else sign(dx)
            if (bDynamic) {
                a.x += s * ox / 2; b.x -= s * ox / 2
                val rel = a.vx - b.vx
                if (rel * s < 0) {
                    val j = -(1 + restitution) * rel / 2
                    a.vx += j; b.vx -= j
                }
            } else {
                a.x += s * ox
                if (a.vx * s < 0) a.vx = settle(-a.vx * restitution)
                a.vy *= 1 - grip
            }
        } else {
            val s = if (dy == 0.0) 1.0 else sign(dy)
            if (bDynamic) {
                a.y += s * oy / 2; b.y -= s * oy / 2
                val rel = a.vy - b.vy
                if (rel * s < 0) {
                    val j = -(1 + restitution) * rel / 2
                    a.vy += j; b.vy -= j
                }
                a.vx *= 1 - grip; b.vx *= 1 - grip
            } else {
                a.y += s * oy
                if (a.vy * s < 0) a.vy = settle(-a.vy * restitution)
                a.vx *= 1 - grip
            }
        }
    }

    private fun keepInside(b: SpriteInstance) {
        val e = b.bounce / 100.0
        val hw = b.halfWidth()
        val hh = b.halfHeight()
        val grip = b.friction / 100.0 * 0.25
        if (b.x - hw < -width / 2) { b.x = -width / 2 + hw; if (b.vx < 0) b.vx = settle(-b.vx * e) }
        if (b.x + hw > width / 2) { b.x = width / 2 - hw; if (b.vx > 0) b.vx = settle(-b.vx * e) }
        if (b.y - hh < -height / 2) {
            b.y = -height / 2 + hh
            if (b.vy < 0) b.vy = settle(-b.vy * e)
            b.vx *= 1 - grip
        }
        if (b.y + hh > height / 2) { b.y = height / 2 - hh; if (b.vy > 0) b.vy = settle(-b.vy * e) }
    }

    /** Kills tiny bounces so resting bodies stay still. */
    private fun settle(v: Double): Double = if (abs(v) < 40) 0.0 else v

    private fun detectContacts(onContact: (SpriteInstance, String) -> Unit) {
        val now = HashSet<Pair<SpriteInstance, SpriteInstance>>()
        val visible = instances.filter { it.visible }
        for (i in visible.indices) for (j in i + 1 until visible.size) {
            val a = visible[i]
            val b = visible[j]
            if (overlaps(a, b)) now += a to b
        }
        for (pair in now) {
            if (pair !in contacts) {
                onContact(pair.first, pair.second.sprite.id)
                onContact(pair.second, pair.first.sprite.id)
            }
        }
        contacts = now
        val edges = visible.filterTo(HashSet()) { touchesEdge(it) }
        for (a in edges) if (a !in edgeContacts) onContact(a, Targets.EDGE)
        edgeContacts = edges
    }

    companion object {
        const val MAX_SPEED = 3000.0
    }
}

/** Everything alive on one open screen. */
class ScreenWorld(
    val token: Int,
    val screen: Screen,
    pictures: Map<String, Picture>,
    property: (componentId: String, key: String) -> String?,
) {
    val stages: Map<String, StageWorld> = screen.root.allComponents()
        .filter { it.type == com.orvenadigital.create.core.model.ComponentType.STAGE }
        .associate { c -> c.id to StageWorld(c, pictures) { key -> property(c.id, key) } }

    init {
        for (stage in stages.values) {
            for (sprite in stage.component.sprites) stage.instances += SpriteInstance(sprite, stage, isClone = false)
        }
    }

    fun instances(): List<SpriteInstance> = stages.values.flatMap { it.instances }

    fun original(spriteId: String): SpriteInstance? = stages.values.firstNotNullOfOrNull { it.original(spriteId) }

    fun firstStage(): StageWorld? = stages.values.firstOrNull()

    fun cloneCount(): Int = instances().count { it.isClone }

    companion object {
        const val MAX_CLONES = 300
    }
}

internal fun clampAngle(degrees: Double): Double {
    var d = degrees % 360
    if (d > 180) d -= 360
    if (d <= -180) d += 360
    return d
}

internal fun minMax(a: Double, b: Double) = min(a, b) to max(a, b)
