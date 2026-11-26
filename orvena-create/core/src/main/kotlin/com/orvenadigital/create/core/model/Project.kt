package com.orvenadigital.create.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A whole Orvena Create project: what the editor saves and what an exported APK carries
 * in `assets/project.json`.
 */
@Serializable
data class Project(
    val formatVersion: Int = CURRENT_FORMAT,
    val id: String,
    val name: String,
    val packageName: String,
    val versionName: String = "1.0",
    val versionCode: Int = 1,
    val themeColor: String = DEFAULT_THEME_COLOR,
    /** Free tier: the exported app shows a short "Made with Orvena Create" splash. */
    val showBranding: Boolean = true,
    val variables: List<Variable> = emptyList(),
    val screens: List<Screen>,
) {
    companion object {
        const val CURRENT_FORMAT = 1
        const val DEFAULT_THEME_COLOR = "#5B3DF5"
    }
}

@Serializable
data class Variable(
    val name: String,
    val initial: String = "0",
)

@Serializable
data class Screen(
    val id: String,
    val name: String,
    val root: Component,
    val scripts: List<Script> = emptyList(),
)

/** One "Lego brick" of the UI. Containers hold other bricks in [children]. */
@Serializable
data class Component(
    val id: String,
    val type: ComponentType,
    val props: Map<String, String> = emptyMap(),
    val children: List<Component> = emptyList(),
)

@Serializable
enum class ComponentType {
    @SerialName("column") COLUMN,
    @SerialName("row") ROW,
    @SerialName("card") CARD,
    @SerialName("text") TEXT,
    @SerialName("button") BUTTON,
    @SerialName("input") INPUT,
    @SerialName("checkbox") CHECKBOX,
    @SerialName("divider") DIVIDER,
    @SerialName("spacer") SPACER,
}

/** "When <event> happens, do <actions>". */
@Serializable
data class Script(
    val id: String,
    val event: Event,
    val actions: List<Action> = emptyList(),
)
