package com.orvenadigital.create.runtime

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import com.orvenadigital.create.core.engine.ExecutionLimitException
import com.orvenadigital.create.core.engine.Interpreter
import com.orvenadigital.create.core.engine.RuntimeHost
import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.ComponentCatalog
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.Screen
import com.orvenadigital.create.core.model.allComponents

/** One open screen in the back stack. [token] is unique, so "screen opened" fires once per visit. */
data class ScreenEntry(val token: Int, val screenId: String)

/**
 * Live state of a running project: what blocks changed, which screen is open.
 * Shared by the editor preview and the exported app, so both behave the same.
 */
class ProjectRuntime(
    val project: Project,
    private val startScreenId: String? = null,
    private val onMessage: (String) -> Unit,
) : RuntimeHost {

    private val overrides = mutableStateMapOf<String, String>()
    private val components: Map<String, Component> = project.allComponents().associateBy { it.id }
    private val interpreter = Interpreter(project, this)
    private val openedTokens = HashSet<Int>()
    private var nextToken = 1

    val backStack = mutableStateListOf<ScreenEntry>()

    init {
        restart()
    }

    fun restart() {
        overrides.clear()
        openedTokens.clear()
        interpreter.reset()
        backStack.clear()
        val first = project.screens.firstOrNull { it.id == startScreenId } ?: project.screens.firstOrNull()
        if (first != null) backStack.add(ScreenEntry(nextToken++, first.id))
    }

    fun screen(id: String): Screen? = project.screens.firstOrNull { it.id == id }

    fun prop(component: Component, key: String): String =
        overrides[key(component.id, key)] ?: component.props[key] ?: ComponentCatalog.default(component.type, key)

    override fun getProperty(componentId: String, property: String): String? {
        val component = components[componentId] ?: return null
        return prop(component, property)
    }

    override fun setProperty(componentId: String, property: String, value: String) {
        if (components.containsKey(componentId)) overrides[key(componentId, property)] = value
    }

    override fun showMessage(text: String) = onMessage(text)

    override fun openScreen(screenId: String) {
        if (screen(screenId) != null) backStack.add(ScreenEntry(nextToken++, screenId))
    }

    override fun goBack() {
        if (backStack.size > 1) backStack.removeAt(backStack.lastIndex)
    }

    fun dispatch(screen: Screen, event: Event) {
        try {
            interpreter.fire(screen, event)
        } catch (e: ExecutionLimitException) {
            onMessage(e.message ?: "Блоки остановлены")
        }
    }

    /** Fires "when screen opened" the first time an entry is shown. */
    fun onEntryShown(entry: ScreenEntry) {
        if (!openedTokens.add(entry.token)) return
        val screen = screen(entry.screenId) ?: return
        dispatch(screen, Event.ScreenOpened)
    }

    private fun key(id: String, prop: String) = "$id\u0000$prop"
}
