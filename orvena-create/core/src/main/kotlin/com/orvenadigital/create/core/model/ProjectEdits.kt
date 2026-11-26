package com.orvenadigital.create.core.model

import kotlin.random.Random

// Immutable edits on the project tree. The editor always builds a new Project from the old one.

fun Component.allComponents(): List<Component> {
    val out = ArrayList<Component>()
    fun walk(c: Component) {
        out += c
        c.children.forEach(::walk)
    }
    walk(this)
    return out
}

fun Component.find(id: String): Component? {
    if (this.id == id) return this
    for (child in children) child.find(id)?.let { return it }
    return null
}

fun Component.update(id: String, transform: (Component) -> Component): Component {
    if (this.id == id) return transform(this)
    if (children.isEmpty()) return this
    return copy(children = children.map { it.update(id, transform) })
}

fun Component.remove(id: String): Component =
    copy(children = children.filter { it.id != id }.map { it.remove(id) })

fun Component.addChild(parentId: String, child: Component): Component =
    update(parentId) { it.copy(children = it.children + child) }

/** Moves [id] by [delta] positions among its siblings. */
fun Component.move(id: String, delta: Int): Component {
    val index = children.indexOfFirst { it.id == id }
    if (index >= 0) {
        val target = (index + delta).coerceIn(0, children.lastIndex)
        if (target == index) return this
        val list = children.toMutableList()
        val item = list.removeAt(index)
        list.add(target, item)
        return copy(children = list)
    }
    return copy(children = children.map { it.move(id, delta) })
}

fun Component.parentOf(id: String): Component? {
    if (children.any { it.id == id }) return this
    for (child in children) child.parentOf(id)?.let { return it }
    return null
}

fun Project.allComponents(): List<Component> = screens.flatMap { it.root.allComponents() }

fun Project.findComponent(id: String): Component? =
    screens.firstNotNullOfOrNull { it.root.find(id) }

fun Project.updateScreen(screenId: String, transform: (Screen) -> Screen): Project =
    copy(screens = screens.map { if (it.id == screenId) transform(it) else it })

fun Project.nextComponentId(type: ComponentType): String {
    val prefix = ComponentCatalog.idPrefix(type)
    val used = allComponents().mapTo(HashSet()) { it.id }
    var n = 1
    while ("$prefix$n" in used) n++
    return "$prefix$n"
}

object Ids {
    private const val ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
    fun random(prefix: String, length: Int = 8): String =
        prefix + (1..length).map { ALPHABET[Random.nextInt(ALPHABET.length)] }.joinToString("")
}

object ProjectFactory {

    fun newProject(name: String): Project {
        val id = Ids.random("p")
        val screen = Screen(
            id = "main",
            name = "Главный",
            root = rootColumn(
                children = listOf(
                    Component(
                        "text1",
                        ComponentType.TEXT,
                        mapOf(Props.TEXT to "Привет! Это $name", Props.TEXT_SIZE to "22", Props.BOLD to "true"),
                    ),
                ),
            ),
        )
        return Project(
            id = id,
            name = name,
            packageName = suggestPackageName(name, id),
            screens = listOf(screen),
        )
    }

    fun rootColumn(id: String = "screen_root", children: List<Component> = emptyList()) = Component(
        id = id,
        type = ComponentType.COLUMN,
        props = mapOf(Props.PADDING to "16", Props.SPACING to "12", Props.FILL_WIDTH to "true"),
        children = children,
    )

    fun newScreen(project: Project, name: String): Screen {
        val used = project.screens.mapTo(HashSet()) { it.id }
        var n = 2
        while ("screen$n" in used) n++
        val id = "screen$n"
        val rootIds = project.allComponents().mapTo(HashSet()) { it.id }
        var r = 2
        while ("screen_root$r" in rootIds) r++
        return Screen(id = id, name = name, root = rootColumn(id = "screen_root$r"))
    }

    fun component(project: Project, type: ComponentType): Component =
        Component(project.nextComponentId(type), type, ComponentCatalog.initialProps(type))
}

private val PACKAGE_REGEX = Regex("^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$")
private val JAVA_KEYWORDS = setOf(
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
    "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
    "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
    "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
    "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
    "volatile", "while", "true", "false", "null",
)

fun isValidPackageName(name: String): Boolean =
    name.length <= 150 && PACKAGE_REGEX.matches(name) && name.split('.').none { it in JAVA_KEYWORDS }

private val TRANSLIT = mapOf(
    'а' to "a", 'б' to "b", 'в' to "v", 'г' to "g", 'д' to "d", 'е' to "e", 'ё' to "e", 'ж' to "zh",
    'з' to "z", 'и' to "i", 'й' to "y", 'к' to "k", 'л' to "l", 'м' to "m", 'н' to "n", 'о' to "o",
    'п' to "p", 'р' to "r", 'с' to "s", 'т' to "t", 'у' to "u", 'ф' to "f", 'х' to "h", 'ц' to "ts",
    'ч' to "ch", 'ш' to "sh", 'щ' to "sch", 'ъ' to "", 'ы' to "y", 'ь' to "", 'э' to "e", 'ю' to "yu",
    'я' to "ya",
)

/** "Мой Счётчик" -> "com.orvenacreate.app.moyschetchik". */
fun suggestPackageName(appName: String, fallbackSeed: String = Ids.random("", 6)): String {
    val slug = buildString {
        for (ch in appName.lowercase()) {
            when {
                ch in 'a'..'z' || ch in '0'..'9' -> append(ch)
                TRANSLIT.containsKey(ch) -> append(TRANSLIT.getValue(ch))
            }
        }
    }.trimStart { it.isDigit() }.take(40)
    val last = if (slug.isEmpty() || slug in JAVA_KEYWORDS) "app" + fallbackSeed.filter { it.isLetterOrDigit() }.lowercase() else slug
    return "com.orvenacreate.app.$last"
}

// ---- sprites ----

fun Screen.sprites(): List<Sprite> = root.allComponents().flatMap { it.sprites }

fun Project.allSprites(): List<Sprite> = allComponents().flatMap { it.sprites }

fun Project.findSprite(id: String): Sprite? = allSprites().firstOrNull { it.id == id }

/** The stage component that holds sprite [spriteId]. */
fun Project.stageOf(spriteId: String): Component? = allComponents().firstOrNull { c -> c.sprites.any { it.id == spriteId } }

private fun Component.mapAll(transform: (Component) -> Component): Component =
    transform(copy(children = children.map { it.mapAll(transform) }))

fun Project.updateSprite(id: String, transform: (Sprite) -> Sprite): Project = copy(
    screens = screens.map { screen ->
        screen.copy(root = screen.root.mapAll { c ->
            if (c.sprites.any { it.id == id }) c.copy(sprites = c.sprites.map { if (it.id == id) transform(it) else it }) else c
        })
    },
)

fun Project.removeSprite(id: String): Project = copy(
    screens = screens.map { screen ->
        screen.copy(root = screen.root.mapAll { c -> c.copy(sprites = c.sprites.filter { it.id != id }) })
    },
)

/** Moves sprite [id] by [delta] in its stage's layer order. */
fun Project.moveSprite(id: String, delta: Int): Project = copy(
    screens = screens.map { screen ->
        screen.copy(root = screen.root.mapAll { c ->
            val index = c.sprites.indexOfFirst { it.id == id }
            if (index < 0) return@mapAll c
            val target = (index + delta).coerceIn(0, c.sprites.lastIndex)
            val list = c.sprites.toMutableList()
            list.add(target, list.removeAt(index))
            c.copy(sprites = list)
        })
    },
)

fun Project.addSprite(stageId: String, sprite: Sprite): Project = copy(
    screens = screens.map { screen ->
        screen.copy(root = screen.root.update(stageId) { it.copy(sprites = it.sprites + sprite) })
    },
)

fun Project.nextSpriteId(): String {
    val used = allSprites().mapTo(HashSet()) { it.id }
    var n = 1
    while ("sprite$n" in used) n++
    return "sprite$n"
}

// ---- pictures ----

fun Project.picture(idOrName: String): Picture? =
    pictures.firstOrNull { it.id == idOrName } ?: pictures.firstOrNull { it.name == idOrName }

fun Project.nextPictureId(): String {
    val used = pictures.mapTo(HashSet()) { it.id }
    var n = 1
    while ("pic$n" in used) n++
    return "pic$n"
}

fun Project.uniquePictureName(base: String): String {
    val used = pictures.mapTo(HashSet()) { it.name }
    if (base !in used) return base
    var n = 2
    while ("$base $n" in used) n++
    return "$base $n"
}

fun Project.addPicture(name: String, source: PictureSource): Pair<Project, Picture> {
    val picture = Picture(nextPictureId(), uniquePictureName(name), source)
    return copy(pictures = pictures + picture) to picture
}
