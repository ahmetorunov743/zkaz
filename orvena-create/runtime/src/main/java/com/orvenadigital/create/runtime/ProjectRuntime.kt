package com.orvenadigital.create.runtime

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.orvenadigital.create.core.engine.Engine
import com.orvenadigital.create.core.engine.RuntimeHost
import com.orvenadigital.create.core.engine.ScreenWorld
import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.ComponentCatalog
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Picture
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.Screen
import com.orvenadigital.create.core.model.allComponents
import com.orvenadigital.create.core.model.picture
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/** One open screen in the back stack. Each visit gets its own [token] and game world. */
data class ScreenEntry(val token: Int, val screenId: String)

class AskRequest(val question: String, val answer: CompletableDeferred<String>)

/**
 * Live state of a running project: what blocks changed, which screen is open, the game worlds.
 * Shared by the editor preview and the exported app, so both behave the same.
 */
class ProjectRuntime(
    val project: Project,
    private val startScreenId: String? = null,
    private val platform: Platform,
) : RuntimeHost {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val overrides = mutableStateMapOf<String, String>()
    private val components: Map<String, Component> = project.allComponents().associateBy { it.id }
    private var nextToken = 1

    val engine = Engine(project, this, scope)
    val backStack = mutableStateListOf<ScreenEntry>()

    /** Ticks every display frame; game canvases read it to redraw. */
    val frameTick = mutableLongStateOf(0L)

    var askRequest by mutableStateOf<AskRequest?>(null)
        private set

    var tiltX = 0.0
    var tiltY = 0.0

    init {
        restart()
    }

    fun restart() {
        askRequest?.answer?.cancel()
        askRequest = null
        engine.reset()
        overrides.clear()
        backStack.clear()
        val first = project.screens.firstOrNull { it.id == startScreenId } ?: project.screens.firstOrNull()
        if (first != null) push(first)
    }

    private fun push(screen: Screen) {
        val entry = ScreenEntry(nextToken++, screen.id)
        backStack.add(entry)
        engine.enterScreen(entry.token, screen)
    }

    fun dispose() {
        engine.stopAll()
        askRequest?.answer?.cancel()
        scope.cancel()
    }

    fun screen(id: String): Screen? = project.screens.firstOrNull { it.id == id }

    fun world(token: Int): ScreenWorld? = engine.world(token)

    fun picture(idOrName: String): Picture? = if (idOrName.isEmpty()) null else project.picture(idOrName)

    fun prop(component: Component, key: String): String =
        overrides[key(component.id, key)] ?: component.props[key] ?: ComponentCatalog.default(component.type, key)

    fun dispatch(event: Event) = engine.dispatch(event)

    fun frame(dtSeconds: Double) {
        engine.frame(dtSeconds)
        frameTick.longValue++
    }

    fun answer(text: String) {
        askRequest?.answer?.complete(text)
    }

    // ---- RuntimeHost

    override fun getProperty(componentId: String, property: String): String? {
        val component = components[componentId] ?: return null
        return prop(component, property)
    }

    override fun setProperty(componentId: String, property: String, value: String) {
        if (components.containsKey(componentId)) overrides[key(componentId, property)] = value
    }

    override fun showMessage(text: String) = platform.toast(text)

    override fun openScreen(screenId: String) {
        screen(screenId)?.let { push(it) }
    }

    override fun goBack() {
        if (backStack.size > 1) {
            val entry = backStack.removeAt(backStack.lastIndex)
            engine.leaveScreen(entry.token)
        }
    }

    override suspend fun ask(question: String): String {
        val deferred = CompletableDeferred<String>()
        askRequest = AskRequest(question, deferred)
        return try {
            deferred.await()
        } finally {
            if (askRequest?.answer === deferred) askRequest = null
        }
    }

    override suspend fun playNote(note: Double, seconds: Double) = platform.playNote(note, seconds)

    override fun vibrate(millis: Long) = platform.vibrate(millis)

    override fun tilt(): Pair<Double, Double> = tiltX to tiltY

    private fun key(id: String, prop: String) = "$id\u0000$prop"
}
