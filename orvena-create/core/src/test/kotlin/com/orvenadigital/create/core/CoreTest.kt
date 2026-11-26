package com.orvenadigital.create.core

import com.orvenadigital.create.core.engine.Engine
import com.orvenadigital.create.core.engine.RuntimeHost
import com.orvenadigital.create.core.engine.asText
import com.orvenadigital.create.core.model.Action
import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Expr
import com.orvenadigital.create.core.model.PhysicsType
import com.orvenadigital.create.core.model.Picture
import com.orvenadigital.create.core.model.PictureSource
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.ProjectFactory
import com.orvenadigital.create.core.model.ProjectJson
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.core.model.Samples
import com.orvenadigital.create.core.model.Screen
import com.orvenadigital.create.core.model.Script
import com.orvenadigital.create.core.model.ShapeKind
import com.orvenadigital.create.core.model.Sprite
import com.orvenadigital.create.core.model.StopMode
import com.orvenadigital.create.core.model.Targets
import com.orvenadigital.create.core.model.addChild
import com.orvenadigital.create.core.model.addSprite
import com.orvenadigital.create.core.model.allComponents
import com.orvenadigital.create.core.model.find
import com.orvenadigital.create.core.model.findSprite
import com.orvenadigital.create.core.model.isValidPackageName
import com.orvenadigital.create.core.model.move
import com.orvenadigital.create.core.model.moveSprite
import com.orvenadigital.create.core.model.nextComponentId
import com.orvenadigital.create.core.model.remove
import com.orvenadigital.create.core.model.removeSprite
import com.orvenadigital.create.core.model.suggestPackageName
import com.orvenadigital.create.core.model.updateScreen
import com.orvenadigital.create.core.model.updateSprite
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeHost : RuntimeHost {
    val props = HashMap<String, String>()
    val messages = ArrayList<String>()
    val screens = ArrayList<String>()
    val notes = ArrayList<Double>()
    var answer = "42"
    override fun getProperty(componentId: String, property: String) = props["$componentId.$property"]
    override fun setProperty(componentId: String, property: String, value: String) {
        props["$componentId.$property"] = value
    }
    override fun showMessage(text: String) {
        messages += text
    }
    override fun openScreen(screenId: String) {
        screens += screenId
    }
    override fun goBack() {
        screens += "<back>"
    }
    override suspend fun ask(question: String): String = answer
    override suspend fun playNote(note: Double, seconds: Double) {
        notes += note
    }
    override fun vibrate(millis: Long) = Unit
    override fun tilt() = 0.0 to 0.0
}

@OptIn(ExperimentalCoroutinesApi::class)
class CoreTest {

    /** Engine on a test dispatcher; [frames] advances the game like a display would. */
    private class Rig(val project: Project, scope: CoroutineScope, private val test: TestScope) {
        val host = FakeHost()
        val engine = Engine(project, host, scope, clock = { test.testScheduler.currentTime * 1_000_000 })
        fun open(screen: Screen = project.screens.first()) {
            engine.enterScreen(1, screen)
            test.runCurrent()
        }
        fun dispatch(event: Event) {
            engine.dispatch(event)
            test.runCurrent()
        }
        fun frames(n: Int, dt: Double = 1.0 / 60) = repeat(n) {
            test.advanceTimeBy(16)
            engine.frame(dt)
            test.runCurrent()
        }
    }

    private fun game(vararg sprites: Sprite, pictures: List<Picture> = emptyList(), screenScripts: List<Script> = emptyList()): Project {
        val stage = Component("stage1", ComponentType.STAGE, mapOf(Props.HEIGHT to "400"), sprites = sprites.toList())
        val screen = Screen("main", "Игра", ProjectFactory.rootColumn(children = listOf(stage)), screenScripts)
        return Project(id = "g", name = "g", packageName = "com.x.g", pictures = pictures, screens = listOf(screen))
    }

    @Test
    fun jsonRoundTrip() {
        for (project in listOf(Samples.counter(), Samples.jumper())) {
            val text = ProjectJson.encode(project)
            assertEquals(project, ProjectJson.decode(text))
        }
        assertTrue(ProjectJson.encode(Samples.jumper()).contains("\"kind\":\"receive\""))
    }

    @Test
    fun oldFormatStillLoads() {
        val v1 = """{"formatVersion":1,"id":"p","name":"Old","packageName":"com.a.b",
            "screens":[{"id":"main","name":"M","root":{"id":"r","type":"column"},
            "scripts":[{"id":"s","event":{"kind":"clicked","componentId":"b"},"actions":[{"kind":"go_back"}]}]}]}"""
        val project = ProjectJson.decode(v1)
        assertEquals(emptyList<Picture>(), project.pictures)
        assertEquals(Action.GoBack, project.screens[0].scripts[0].actions[0])
    }

    @Test
    fun counterSampleWorks() = runTest {
        val rig = Rig(Samples.counter(), backgroundScope, this)
        rig.open()
        repeat(3) { rig.dispatch(Event.Clicked("button2")) }
        rig.dispatch(Event.Clicked("button1"))
        assertEquals("2", rig.host.props["text2.text"])

        rig.dispatch(Event.Clicked("button4"))
        assertEquals(listOf("Сначала введи имя"), rig.host.messages)
        rig.host.props["input1.text"] = "Саша"
        rig.dispatch(Event.Clicked("button4"))
        assertEquals("Привет, Саша!", rig.host.props["text3.text"])

        rig.dispatch(Event.Clicked("button5"))
        assertEquals(listOf("about"), rig.host.screens)
    }

    @Test
    fun broadcastRunsReceiversInScreensAndSprites() = runTest {
        val sprite = Sprite(
            "sprite1", "Кот",
            scripts = listOf(Script("r", Event.Receive("go"), listOf(Action.ChangeVariable("hits", Expr.Num(1.0))))),
        )
        val project = game(
            sprite,
            screenScripts = listOf(
                Script("s1", Event.Clicked("b"), listOf(Action.Broadcast("go", andWait = true), Action.SetVariable("after", Expr.GetVariable("hits")))),
                Script("s2", Event.Receive("go"), listOf(Action.ChangeVariable("hits", Expr.Num(10.0)))),
            ),
        )
        val rig = Rig(project, backgroundScope, this)
        rig.open()
        rig.dispatch(Event.Clicked("b"))
        assertEquals("11", rig.engine.variable("hits")!!.asText())
        assertEquals("11", rig.engine.variable("after")!!.asText()) // "and wait" waited for both receivers
    }

    @Test
    fun waitPausesOnlyItsOwnScript() = runTest {
        val project = game(
            screenScripts = listOf(
                Script("a", Event.ScreenOpened, listOf(Action.Wait(Expr.Num(1.0)), Action.SetVariable("a", Expr.Text("done")))),
                Script("b", Event.ScreenOpened, listOf(Action.SetVariable("b", Expr.Text("done")))),
            ),
        )
        val rig = Rig(project, backgroundScope, this)
        rig.open()
        assertEquals("done", rig.engine.variable("b")!!.asText())
        assertEquals(null, rig.engine.variable("a"))
        advanceTimeBy(1001)
        runCurrent()
        assertEquals("done", rig.engine.variable("a")!!.asText())
    }

    @Test
    fun foreverLoopRunsOncePerFrameAndStops() = runTest {
        val sprite = Sprite(
            "sprite1", "s",
            scripts = listOf(
                Script("loop", Event.ScreenOpened, listOf(Action.Forever(listOf(Action.ChangeX(Expr.Num(2.0)))))),
                Script("stop", Event.Receive("stop"), listOf(Action.Stop(StopMode.ALL))),
            ),
        )
        val rig = Rig(game(sprite), backgroundScope, this)
        rig.open()
        rig.frames(10)
        val x = rig.engine.current!!.original("sprite1")!!.x
        assertEquals(22.0, x, 0.001) // first pass plus 10 frames
        rig.engine.dispatch(Event.Receive("stop"))
        runCurrent()
        rig.frames(5)
        assertEquals(x, rig.engine.current!!.original("sprite1")!!.x, 0.001)
        assertEquals(0, rig.engine.runningScripts)
    }

    @Test
    fun gravityDropsBodyOntoStaticGround() = runTest {
        val pics = listOf(
            Picture("box", "box", PictureSource.Shape(ShapeKind.RECT, "#000", 20.0, 20.0)),
            Picture("floor", "floor", PictureSource.Shape(ShapeKind.RECT, "#000", 300.0, 20.0)),
        )
        val ball = Sprite("sprite1", "ball", listOf("box"), y = 100.0, physics = PhysicsType.DYNAMIC, bounce = 0.0)
        val floor = Sprite("sprite2", "floor", listOf("floor"), y = -100.0, physics = PhysicsType.STATIC)
        val rig = Rig(game(ball, floor, pictures = pics), backgroundScope, this)
        rig.open()
        rig.frames(180)
        val b = rig.engine.current!!.original("sprite1")!!
        assertEquals(-80.0, b.y, 1.0) // resting on top of the floor: -100 + 10 + 10
        assertEquals(0.0, b.vy, 1.0)
        assertTrue(b.stage.touching(b, "sprite2"))
    }

    @Test
    fun touchedEventFiresOnceOnContact() = runTest {
        val pics = listOf(Picture("box", "box", PictureSource.Shape(ShapeKind.RECT, "#000", 20.0, 20.0)))
        val mover = Sprite(
            "sprite1", "m", listOf("box"), x = -100.0,
            scripts = listOf(Script("go", Event.ScreenOpened, listOf(Action.Forever(listOf(Action.ChangeX(Expr.Num(5.0))))))),
        )
        val wall = Sprite(
            "sprite2", "w", listOf("box"), x = 0.0,
            scripts = listOf(Script("hit", Event.Touched("sprite2", "sprite1"), listOf(Action.ChangeVariable("hits", Expr.Num(1.0))))),
        )
        val rig = Rig(game(mover, wall, pictures = pics), backgroundScope, this)
        rig.open()
        rig.frames(20)
        assertEquals("1", rig.engine.variable("hits")!!.asText())
    }

    @Test
    fun clonesRunTheirOwnScripts() = runTest {
        val sprite = Sprite(
            "sprite1", "s",
            scripts = listOf(
                Script("make", Event.ScreenOpened, listOf(Action.Repeat(Expr.Num(3.0), listOf(Action.CreateClone())))),
                Script("clone", Event.CloneStarted, listOf(Action.ChangeVariable("clones", Expr.Num(1.0)), Action.ChangeX(Expr.Num(50.0)))),
                Script("kill", Event.Receive("kill"), listOf(Action.DeleteClone)),
            ),
        )
        val rig = Rig(game(sprite), backgroundScope, this)
        rig.open()
        rig.frames(5)
        // 3 from the original, plus clones cloning themselves is not possible here (clone scripts don't run "screen opened")
        assertEquals("3", rig.engine.variable("clones")!!.asText())
        assertEquals(4, rig.engine.current!!.instances().size)
        rig.dispatch(Event.Receive("kill"))
        assertEquals(1, rig.engine.current!!.instances().size)
    }

    @Test
    fun tapHitsTopmostSprite() = runTest {
        val pics = listOf(Picture("box", "box", PictureSource.Shape(ShapeKind.RECT, "#000", 40.0, 40.0)))
        val bottom = Sprite("sprite1", "a", listOf("box"), scripts = listOf(Script("t", Event.SpriteTapped("sprite1"), listOf(Action.SetVariable("tapped", Expr.Text("a"))))))
        val top = Sprite("sprite2", "b", listOf("box"), scripts = listOf(Script("t", Event.SpriteTapped("sprite2"), listOf(Action.SetVariable("tapped", Expr.Text("b"))))))
        val rig = Rig(game(bottom, top, pictures = pics), backgroundScope, this)
        rig.open()
        rig.engine.tapStage("stage1", 5.0, 5.0)
        runCurrent()
        assertEquals("b", rig.engine.variable("tapped")!!.asText())
    }

    @Test
    fun askStoresAnswerAndListsWork() = runTest {
        val project = game(
            screenScripts = listOf(
                Script(
                    "a", Event.ScreenOpened,
                    listOf(
                        Action.Ask(Expr.Text("?")),
                        Action.ListAdd("items", Expr.Sensor(com.orvenadigital.create.core.model.SensorKind.ANSWER)),
                        Action.ListAdd("items", Expr.Text("b")),
                        Action.SetVariable("n", Expr.ListLength("items")),
                        Action.SetVariable("first", Expr.ListItem("items", Expr.Num(1.0))),
                        Action.SetVariable("has", Expr.ListContains("items", Expr.Text("B"))),
                    ),
                ),
            ),
        )
        val rig = Rig(project, backgroundScope, this)
        rig.open()
        assertEquals("2", rig.engine.variable("n")!!.asText())
        assertEquals("42", rig.engine.variable("first")!!.asText())
        assertEquals("true", rig.engine.variable("has")!!.asText())
    }

    @Test
    fun jumperSampleRuns() = runTest {
        val rig = Rig(Samples.jumper(), backgroundScope, this)
        rig.open()
        rig.frames(120)
        val frog = rig.engine.current!!.original("sprite1")!!
        val ground = rig.engine.current!!.original("sprite3")!!
        assertTrue("frog should land", frog.stage.touching(frog, "sprite3"))
        val restY = frog.y
        rig.dispatch(Event.Clicked("button2")) // jump
        rig.frames(10)
        assertTrue("frog should be in the air", frog.y > restY + 20)
        rig.frames(120)
        assertEquals(restY, frog.y, 1.0)
        assertEquals(-196.0, ground.y, 0.001)
        assertTrue(rig.host.props["text1.text"]!!.startsWith("Очки: "))
    }

    @Test
    fun treeAndSpriteEdits() {
        val project = Samples.counter()
        val root = project.screens.first().root
        assertEquals("button7", project.nextComponentId(ComponentType.BUTTON))
        val added = root.addChild("row1", Component("x", ComponentType.TEXT))
        assertEquals(listOf("button1", "button2", "x"), added.find("row1")!!.children.map { it.id })
        val moved = added.move("x", -2)
        assertEquals(listOf("x", "button1", "button2"), moved.find("row1")!!.children.map { it.id })
        assertFalse(moved.remove("row1").allComponents().any { it.id == "button1" })

        val game = Samples.jumper()
        val renamed = game.updateSprite("sprite2") { it.copy(name = "Монета") }
        assertEquals("Монета", renamed.findSprite("sprite2")!!.name)
        val reordered = game.moveSprite("sprite1", -10)
        assertEquals("sprite1", reordered.screens[0].root.find("stage1")!!.sprites.first().id)
        val removed = game.removeSprite("sprite4")
        assertEquals(null, removed.findSprite("sprite4"))
        val withNew = game.addSprite("stage1", Sprite("sprite9", "Новый"))
        assertEquals("sprite9", withNew.screens[0].root.find("stage1")!!.sprites.last().id)
    }

    @Test
    fun screenOpenedScripts() = runTest {
        val project = ProjectFactory.newProject("Тест").updateScreen("main") {
            it.copy(scripts = listOf(Script("s1", Event.ScreenOpened, listOf(Action.SetProperty("text1", Props.TEXT, Expr.Text("ok"))))))
        }
        val rig = Rig(project, backgroundScope, this)
        rig.open()
        assertEquals("ok", rig.host.props["text1.text"])
    }

    @Test
    fun packageNames() {
        assertEquals("com.orvenacreate.app.moyschetchik", suggestPackageName("Мой Счётчик"))
        assertTrue(suggestPackageName("!!!").startsWith("com.orvenacreate.app.app"))
        assertTrue(isValidPackageName("com.orvenacreate.app.counter"))
        assertFalse(isValidPackageName("com.Orvena.app"))
        assertFalse(isValidPackageName("counter"))
        assertFalse(isValidPackageName("com.class.app"))
        assertTrue(isValidPackageName(suggestPackageName("123 Игра")))
        assertEquals(Targets.SELF, "")
    }
}
