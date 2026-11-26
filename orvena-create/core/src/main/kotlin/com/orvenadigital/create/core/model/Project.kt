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
    val lists: List<String> = emptyList(),
    /** Names used by "broadcast" and "when I receive". */
    val messages: List<String> = emptyList(),
    /** Picture library: costumes of sprites and images of the UI. */
    val pictures: List<Picture> = emptyList(),
    val screens: List<Screen>,
) {
    companion object {
        const val CURRENT_FORMAT = 2
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

/** One "Lego brick" of the UI. Containers hold other bricks in [children]; a game stage holds [sprites]. */
@Serializable
data class Component(
    val id: String,
    val type: ComponentType,
    val props: Map<String, String> = emptyMap(),
    val children: List<Component> = emptyList(),
    val sprites: List<Sprite> = emptyList(),
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
    @SerialName("image") IMAGE,
    @SerialName("stage") STAGE,
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

/**
 * A game character living on a stage. Coordinates are in dp from the stage center, y up.
 * Direction like in Scratch: 90 points right, 0 up.
 */
@Serializable
data class Sprite(
    val id: String,
    val name: String,
    val costumes: List<String> = emptyList(),
    val x: Double = 0.0,
    val y: Double = 0.0,
    val size: Double = 100.0,
    val direction: Double = 90.0,
    val visible: Boolean = true,
    val rotationStyle: RotationStyle = RotationStyle.ALL_AROUND,
    val physics: PhysicsType = PhysicsType.NONE,
    /** 0–100 %. */
    val bounce: Double = 20.0,
    /** 0–100 %. */
    val friction: Double = 50.0,
    val scripts: List<Script> = emptyList(),
)

@Serializable
data class Picture(
    val id: String,
    val name: String,
    val source: PictureSource,
)

@Serializable
sealed interface PictureSource {
    @Serializable
    @SerialName("emoji")
    data class Emoji(val text: String) : PictureSource

    @Serializable
    @SerialName("shape")
    data class Shape(val shape: ShapeKind, val color: String, val width: Double = 64.0, val height: Double = 64.0) : PictureSource

    /** Hand-drawn picture. Points are normalized to 0..1 inside the [width] × [height] box. */
    @Serializable
    @SerialName("drawing")
    data class Drawing(
        val strokes: List<Stroke>,
        val background: String = "",
        val width: Double = 64.0,
        val height: Double = 64.0,
    ) : PictureSource

    /** Imported photo, PNG in base64, downscaled. */
    @Serializable
    @SerialName("photo")
    data class Photo(val pngBase64: String, val width: Double = 64.0, val height: Double = 64.0) : PictureSource
}

@Serializable
data class Stroke(
    val color: String,
    /** Width relative to the box width. */
    val width: Float,
    /** x0, y0, x1, y1, … normalized to 0..1. */
    val points: List<Float>,
)

@Serializable
enum class ShapeKind(val label: String) {
    @SerialName("rect") RECT("Прямоугольник"),
    @SerialName("rounded") ROUNDED("Скруглённый"),
    @SerialName("circle") CIRCLE("Круг"),
    @SerialName("triangle") TRIANGLE("Треугольник"),
    @SerialName("diamond") DIAMOND("Ромб"),
    @SerialName("star") STAR("Звезда"),
    @SerialName("heart") HEART("Сердце"),
}

/** Size a picture has at 100 %, in dp. */
fun PictureSource.naturalSize(): Pair<Double, Double> = when (this) {
    is PictureSource.Emoji -> 64.0 to 64.0
    is PictureSource.Shape -> width to height
    is PictureSource.Drawing -> width to height
    is PictureSource.Photo -> width to height
}
