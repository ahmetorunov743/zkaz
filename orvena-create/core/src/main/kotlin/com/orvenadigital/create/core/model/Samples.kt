package com.orvenadigital.create.core.model

/** Ready-made projects that show what the bricks and blocks can do. */
object Samples {

    fun counter(id: String = "sample_counter"): Project {
        val main = Screen(
            id = "main",
            name = "Главный",
            root = ProjectFactory.rootColumn(
                children = listOf(
                    Component(
                        "text1", ComponentType.TEXT,
                        mapOf(Props.TEXT to "Счётчик", Props.TEXT_SIZE to "28", Props.BOLD to "true"),
                    ),
                    Component(
                        "text2", ComponentType.TEXT,
                        mapOf(Props.TEXT to "0", Props.TEXT_SIZE to "56", Props.TEXT_COLOR to "#5B3DF5", Props.BOLD to "true"),
                    ),
                    Component(
                        "row1", ComponentType.ROW,
                        mapOf(Props.FILL_WIDTH to "true", Props.SPACING to "12"),
                        children = listOf(
                            Component("button1", ComponentType.BUTTON, mapOf(Props.TEXT to "−1", Props.WEIGHT to "1")),
                            Component("button2", ComponentType.BUTTON, mapOf(Props.TEXT to "+1", Props.WEIGHT to "1")),
                        ),
                    ),
                    Component("button3", ComponentType.BUTTON, mapOf(Props.TEXT to "Сбросить", Props.FILL_WIDTH to "true")),
                    Component("divider1", ComponentType.DIVIDER),
                    Component(
                        "card1", ComponentType.CARD,
                        mapOf(Props.FILL_WIDTH to "true", Props.SPACING to "8"),
                        children = listOf(
                            Component("input1", ComponentType.INPUT, mapOf(Props.HINT to "Как тебя зовут?", Props.FILL_WIDTH to "true")),
                            Component("button4", ComponentType.BUTTON, mapOf(Props.TEXT to "Поздороваться")),
                            Component("text3", ComponentType.TEXT, mapOf(Props.TEXT to "", Props.TEXT_SIZE to "18")),
                        ),
                    ),
                    Component("button5", ComponentType.BUTTON, mapOf(Props.TEXT to "О приложении →")),
                ),
            ),
            scripts = listOf(
                Script(
                    "s_plus", Event.Clicked("button2"),
                    listOf(
                        Action.ChangeVariable("count", Expr.Num(1.0)),
                        Action.SetProperty("text2", Props.TEXT, Expr.GetVariable("count")),
                    ),
                ),
                Script(
                    "s_minus", Event.Clicked("button1"),
                    listOf(
                        Action.ChangeVariable("count", Expr.Num(-1.0)),
                        Action.SetProperty("text2", Props.TEXT, Expr.GetVariable("count")),
                    ),
                ),
                Script(
                    "s_reset", Event.Clicked("button3"),
                    listOf(
                        Action.SetVariable("count", Expr.Num(0.0)),
                        Action.SetProperty("text2", Props.TEXT, Expr.GetVariable("count")),
                        Action.ShowMessage(Expr.Text("Сброшено")),
                    ),
                ),
                Script(
                    "s_hello", Event.Clicked("button4"),
                    listOf(
                        Action.If(
                            condition = Expr.Compare(CompareOp.EQ, Expr.GetProperty("input1", Props.TEXT), Expr.Text("")),
                            then = listOf(Action.ShowMessage(Expr.Text("Сначала введи имя"))),
                            otherwise = listOf(
                                Action.SetProperty(
                                    "text3", Props.TEXT,
                                    Expr.Join(
                                        Expr.Join(Expr.Text("Привет, "), Expr.GetProperty("input1", Props.TEXT)),
                                        Expr.Text("!"),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
                Script("s_about", Event.Clicked("button5"), listOf(Action.OpenScreen("about"))),
            ),
        )
        val about = Screen(
            id = "about",
            name = "О приложении",
            root = ProjectFactory.rootColumn(
                id = "screen_root2",
                children = listOf(
                    Component("text4", ComponentType.TEXT, mapOf(Props.TEXT to "О приложении", Props.TEXT_SIZE to "24", Props.BOLD to "true")),
                    Component("text5", ComponentType.TEXT, mapOf(Props.TEXT to "Собрано из блоков в Orvena Create, без единой строчки кода.")),
                    Component("button6", ComponentType.BUTTON, mapOf(Props.TEXT to "← Назад")),
                ),
            ),
            scripts = listOf(Script("s_back", Event.Clicked("button6"), listOf(Action.GoBack))),
        )
        return Project(
            id = id,
            name = "Счётчик",
            packageName = "com.orvenacreate.app.counter",
            variables = listOf(Variable("count", "0")),
            screens = listOf(main, about),
        )
    }
}
