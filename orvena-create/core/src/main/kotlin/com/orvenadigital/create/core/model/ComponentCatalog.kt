package com.orvenadigital.create.core.model

object Props {
    const val TEXT = "text"
    const val HINT = "hint"
    const val TEXT_SIZE = "textSize"
    const val TEXT_COLOR = "textColor"
    const val BOLD = "bold"
    const val ALIGN = "align"
    const val BACKGROUND = "background"
    const val PADDING = "padding"
    const val SPACING = "spacing"
    const val FILL_WIDTH = "fillWidth"
    const val WEIGHT = "weight"
    const val VISIBLE = "visible"
    const val ENABLED = "enabled"
    const val CHECKED = "checked"
    const val HEIGHT = "height"
    const val PICTURE = "picture"
    const val GRAVITY = "gravity"
    const val SOLID_EDGES = "solidEdges"
}

enum class PropKind { TEXT, NUMBER, BOOL, COLOR, CHOICE, PICTURE }

data class PropDef(
    val key: String,
    val label: String,
    val kind: PropKind,
    val default: String,
    val choices: List<Pair<String, String>> = emptyList(),
)

/** Everything the editor and the runtime need to know about each kind of brick. */
object ComponentCatalog {

    val ALIGN_CHOICES = listOf("start" to "Слева", "center" to "По центру", "end" to "Справа")

    private val visible = PropDef(Props.VISIBLE, "Видимый", PropKind.BOOL, "true")
    private val padding = PropDef(Props.PADDING, "Внутренний отступ", PropKind.NUMBER, "0")
    private val background = PropDef(Props.BACKGROUND, "Фон", PropKind.COLOR, "")
    private val fillWidth = PropDef(Props.FILL_WIDTH, "На всю ширину", PropKind.BOOL, "false")
    private val weight = PropDef(Props.WEIGHT, "Вес в строке", PropKind.NUMBER, "0")
    private val spacing = PropDef(Props.SPACING, "Расстояние между блоками", PropKind.NUMBER, "8")
    private val align = PropDef(Props.ALIGN, "Выравнивание", PropKind.CHOICE, "start", ALIGN_CHOICES)
    private val common = listOf(visible, fillWidth, weight, padding, background)

    fun label(type: ComponentType): String = when (type) {
        ComponentType.COLUMN -> "Колонка"
        ComponentType.ROW -> "Строка"
        ComponentType.CARD -> "Карточка"
        ComponentType.TEXT -> "Текст"
        ComponentType.BUTTON -> "Кнопка"
        ComponentType.INPUT -> "Поле ввода"
        ComponentType.CHECKBOX -> "Флажок"
        ComponentType.IMAGE -> "Картинка"
        ComponentType.STAGE -> "Игровая сцена"
        ComponentType.DIVIDER -> "Разделитель"
        ComponentType.SPACER -> "Отступ"
    }

    fun description(type: ComponentType): String = when (type) {
        ComponentType.COLUMN -> "Кладёт блоки сверху вниз"
        ComponentType.ROW -> "Кладёт блоки слева направо"
        ComponentType.CARD -> "Рамка с тенью для группы блоков"
        ComponentType.TEXT -> "Надпись"
        ComponentType.BUTTON -> "Нажимается и запускает блоки"
        ComponentType.INPUT -> "Сюда пользователь пишет текст"
        ComponentType.CHECKBOX -> "Галочка вкл/выкл"
        ComponentType.IMAGE -> "Нарисованная, готовая или фото"
        ComponentType.STAGE -> "Поле для 2D-игры: спрайты и физика"
        ComponentType.DIVIDER -> "Тонкая линия"
        ComponentType.SPACER -> "Пустое место"
    }

    fun idPrefix(type: ComponentType): String = when (type) {
        ComponentType.COLUMN -> "column"
        ComponentType.ROW -> "row"
        ComponentType.CARD -> "card"
        ComponentType.TEXT -> "text"
        ComponentType.BUTTON -> "button"
        ComponentType.INPUT -> "input"
        ComponentType.CHECKBOX -> "checkbox"
        ComponentType.IMAGE -> "image"
        ComponentType.STAGE -> "stage"
        ComponentType.DIVIDER -> "divider"
        ComponentType.SPACER -> "spacer"
    }

    fun isContainer(type: ComponentType): Boolean =
        type == ComponentType.COLUMN || type == ComponentType.ROW || type == ComponentType.CARD

    fun props(type: ComponentType): List<PropDef> = when (type) {
        ComponentType.COLUMN, ComponentType.CARD -> listOf(spacing, align) + common
        ComponentType.ROW -> listOf(spacing) + common
        ComponentType.TEXT -> listOf(
            PropDef(Props.TEXT, "Текст", PropKind.TEXT, ""),
            PropDef(Props.TEXT_SIZE, "Размер шрифта", PropKind.NUMBER, "16"),
            PropDef(Props.TEXT_COLOR, "Цвет текста", PropKind.COLOR, ""),
            PropDef(Props.BOLD, "Жирный", PropKind.BOOL, "false"),
            align,
        ) + common
        ComponentType.BUTTON -> listOf(
            PropDef(Props.TEXT, "Текст", PropKind.TEXT, ""),
            PropDef(Props.ENABLED, "Активна", PropKind.BOOL, "true"),
        ) + common
        ComponentType.INPUT -> listOf(
            PropDef(Props.TEXT, "Текст", PropKind.TEXT, ""),
            PropDef(Props.HINT, "Подсказка", PropKind.TEXT, ""),
        ) + common
        ComponentType.CHECKBOX -> listOf(
            PropDef(Props.TEXT, "Текст", PropKind.TEXT, ""),
            PropDef(Props.CHECKED, "Отмечен", PropKind.BOOL, "false"),
        ) + common
        ComponentType.IMAGE -> listOf(
            PropDef(Props.PICTURE, "Картинка", PropKind.PICTURE, ""),
            PropDef(Props.HEIGHT, "Высота", PropKind.NUMBER, "120"),
        ) + common
        ComponentType.STAGE -> listOf(
            PropDef(Props.HEIGHT, "Высота", PropKind.NUMBER, "400"),
            PropDef(Props.BACKGROUND, "Фон", PropKind.COLOR, "#E7F5FF"),
            PropDef(Props.GRAVITY, "Гравитация (вниз)", PropKind.NUMBER, "800"),
            PropDef(Props.SOLID_EDGES, "Края — стены", PropKind.BOOL, "true"),
            visible,
            fillWidth,
        )
        ComponentType.DIVIDER -> common
        ComponentType.SPACER -> listOf(PropDef(Props.HEIGHT, "Высота", PropKind.NUMBER, "16"), visible)
    }

    fun prop(type: ComponentType, key: String): PropDef? = props(type).firstOrNull { it.key == key }

    fun default(type: ComponentType, key: String): String = prop(type, key)?.default ?: ""

    /** The property blocks most often read or change on this brick. */
    fun mainProp(type: ComponentType): String? = when (type) {
        ComponentType.TEXT, ComponentType.BUTTON, ComponentType.INPUT -> Props.TEXT
        ComponentType.CHECKBOX -> Props.CHECKED
        ComponentType.IMAGE -> Props.PICTURE
        ComponentType.STAGE -> Props.BACKGROUND
        ComponentType.COLUMN, ComponentType.ROW, ComponentType.CARD,
        ComponentType.DIVIDER, ComponentType.SPACER -> Props.VISIBLE
    }

    /** Props a freshly added brick starts with. */
    fun initialProps(type: ComponentType): Map<String, String> = when (type) {
        ComponentType.COLUMN -> mapOf(Props.FILL_WIDTH to "true")
        ComponentType.ROW -> mapOf(Props.FILL_WIDTH to "true")
        ComponentType.CARD -> mapOf(Props.FILL_WIDTH to "true")
        ComponentType.TEXT -> mapOf(Props.TEXT to "Новый текст")
        ComponentType.BUTTON -> mapOf(Props.TEXT to "Кнопка")
        ComponentType.INPUT -> mapOf(Props.HINT to "Введите текст", Props.FILL_WIDTH to "true")
        ComponentType.CHECKBOX -> mapOf(Props.TEXT to "Флажок")
        ComponentType.IMAGE -> emptyMap()
        ComponentType.STAGE -> mapOf(Props.FILL_WIDTH to "true")
        ComponentType.DIVIDER -> emptyMap()
        ComponentType.SPACER -> emptyMap()
    }

    /** Colors offered by the editor's color picker. */
    val PALETTE = listOf(
        "#000000", "#FFFFFF", "#5B3DF5", "#00A88F", "#FF8A00",
        "#E64980", "#228BE6", "#40C057", "#FAB005", "#F1F3F5",
    )
}
