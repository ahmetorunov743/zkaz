package com.orvenadigital.create.core

import com.orvenadigital.create.core.engine.ExecutionLimitException
import com.orvenadigital.create.core.engine.Interpreter
import com.orvenadigital.create.core.engine.RuntimeHost
import com.orvenadigital.create.core.engine.asText
import com.orvenadigital.create.core.model.Action
import com.orvenadigital.create.core.model.ArithOp
import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Expr
import com.orvenadigital.create.core.model.ProjectFactory
import com.orvenadigital.create.core.model.ProjectJson
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.core.model.Samples
import com.orvenadigital.create.core.model.Script
import com.orvenadigital.create.core.model.addChild
import com.orvenadigital.create.core.model.allComponents
import com.orvenadigital.create.core.model.find
import com.orvenadigital.create.core.model.isValidPackageName
import com.orvenadigital.create.core.model.move
import com.orvenadigital.create.core.model.nextComponentId
import com.orvenadigital.create.core.model.remove
import com.orvenadigital.create.core.model.suggestPackageName
import com.orvenadigital.create.core.model.updateScreen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeHost : RuntimeHost {
    val props = HashMap<String, String>()
    val messages = ArrayList<String>()
    val screens = ArrayList<String>()
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
}

class CoreTest {

    @Test
    fun jsonRoundTrip() {
        val project = Samples.counter()
        val text = ProjectJson.encode(project)
        assertEquals(project, ProjectJson.decode(text))
        assertTrue(text.contains("\"kind\":\"change_var\""))
        assertTrue(text.contains("\"kind\":\"go_back\""))
    }

    @Test
    fun counterSampleWorks() {
        val project = Samples.counter()
        val host = FakeHost()
        val interpreter = Interpreter(project, host)
        val main = project.screens.first()
        repeat(3) { interpreter.fire(main, Event.Clicked("button2")) }
        interpreter.fire(main, Event.Clicked("button1"))
        assertEquals("2", host.props["text2.text"])

        interpreter.fire(main, Event.Clicked("button4"))
        assertEquals(listOf("Сначала введи имя"), host.messages)
        host.props["input1.text"] = "Саша"
        interpreter.fire(main, Event.Clicked("button4"))
        assertEquals("Привет, Саша!", host.props["text3.text"])

        interpreter.fire(main, Event.Clicked("button5"))
        assertEquals(listOf("about"), host.screens)
    }

    @Test
    fun valuesConvertLikeScratch() {
        val host = FakeHost()
        val i = Interpreter(Samples.counter(), host)
        assertEquals("5", i.eval(Expr.Arithmetic(ArithOp.ADD, Expr.Text("2"), Expr.Num(3.0))).asText())
        assertEquals("2.5", i.eval(Expr.Arithmetic(ArithOp.DIV, Expr.Num(5.0), Expr.Num(2.0))).asText())
        assertEquals("0", i.eval(Expr.Arithmetic(ArithOp.DIV, Expr.Num(5.0), Expr.Num(0.0))).asText())
        assertEquals("a1", i.eval(Expr.Join(Expr.Text("a"), Expr.Num(1.0))).asText())
    }

    @Test(expected = ExecutionLimitException::class)
    fun runawayLoopsAreStopped() {
        val project = Samples.counter()
        val host = FakeHost()
        val inner = Action.Repeat(Expr.Num(10_000.0), listOf(Action.ChangeVariable("count", Expr.Num(1.0))))
        Interpreter(project, host).execute(Action.Repeat(Expr.Num(10_000.0), listOf(inner)))
    }

    @Test
    fun screenOpenedScripts() {
        val base = ProjectFactory.newProject("Тест")
        val project = base.updateScreen("main") {
            it.copy(scripts = listOf(Script("s1", Event.ScreenOpened, listOf(Action.SetProperty("text1", Props.TEXT, Expr.Text("ok"))))))
        }
        val host = FakeHost()
        Interpreter(project, host).fire(project.screens.first(), Event.ScreenOpened)
        assertEquals("ok", host.props["text1.text"])
    }

    @Test
    fun treeEdits() {
        val project = Samples.counter()
        val root = project.screens.first().root
        assertEquals("button7", project.nextComponentId(ComponentType.BUTTON))

        val added = root.addChild("row1", Component("x", ComponentType.TEXT))
        assertEquals(listOf("button1", "button2", "x"), added.find("row1")!!.children.map { it.id })
        val moved = added.move("x", -2)
        assertEquals(listOf("x", "button1", "button2"), moved.find("row1")!!.children.map { it.id })
        val removed = moved.remove("row1")
        assertFalse(removed.allComponents().any { it.id == "button1" })
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
    }
}
