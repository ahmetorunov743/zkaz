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

    /** A small platformer: physics, broadcasts, touching, sounds and a forever loop. */
    fun jumper(id: String = "sample_jumper"): Project {
        val pictures = listOf(
            Picture("p_frog", "Лягушка", PictureSource.Emoji("🐸")),
            Picture("p_star", "Звезда", PictureSource.Emoji("⭐")),
            Picture("p_cloud", "Облако", PictureSource.Emoji("☁️")),
            Picture("p_ground", "Земля", PictureSource.Shape(ShapeKind.RECT, "#2F9E44", width = 700.0, height = 28.0)),
            Picture("p_platform", "Платформа", PictureSource.Shape(ShapeKind.ROUNDED, "#A0522D", width = 120.0, height = 18.0)),
        )
        val score = Expr.GetVariable("score")
        val randomSpot = Action.GoTo(
            Expr.RandomInt(Expr.Num(-140.0), Expr.Num(140.0)),
            Expr.RandomInt(Expr.Num(-60.0), Expr.Num(150.0)),
        )
        val frog = Sprite(
            id = "sprite1", name = "Лягушка", costumes = listOf("p_frog"),
            x = -100.0, y = -120.0, physics = PhysicsType.DYNAMIC, bounce = 0.0, friction = 80.0,
            rotationStyle = RotationStyle.LEFT_RIGHT,
            scripts = listOf(
                Script(
                    "f_jump", Event.Receive("прыжок"),
                    listOf(
                        Action.If(
                            Expr.Logic(LogicOp.OR, Expr.Touching("sprite3"), Expr.Touching("sprite5")),
                            then = listOf(Action.Push(Expr.Num(0.0), Expr.Num(560.0))),
                        ),
                    ),
                ),
                Script(
                    "f_left", Event.Receive("влево"),
                    listOf(
                        Action.PointInDirection(Expr.Num(-90.0)),
                        Action.SetVelocity(Expr.Num(-220.0), Expr.SpriteAttr(Targets.SELF, SpriteAttrKind.VELOCITY_Y)),
                    ),
                ),
                Script(
                    "f_right", Event.Receive("вправо"),
                    listOf(
                        Action.PointInDirection(Expr.Num(90.0)),
                        Action.SetVelocity(Expr.Num(220.0), Expr.SpriteAttr(Targets.SELF, SpriteAttrKind.VELOCITY_Y)),
                    ),
                ),
                Script("f_tap", Event.SpriteTapped("sprite1"), listOf(Action.SayFor(Expr.Text("Ква!"), Expr.Num(1.0)))),
                Script(
                    "f_win", Event.Receive("победа"),
                    listOf(Action.SayFor(Expr.Text("Победа! 🎉"), Expr.Num(2.0)), Action.PlayNote(Expr.Num(84.0), Expr.Num(0.4))),
                ),
            ),
        )
        val star = Sprite(
            id = "sprite2", name = "Звезда", costumes = listOf("p_star"), size = 70.0, x = 60.0, y = 60.0,
            scripts = listOf(
                Script("s_start", Event.ScreenOpened, listOf(randomSpot, Action.Forever(listOf(Action.Turn(Expr.Num(3.0)))))),
                Script(
                    "s_hit", Event.Touched("sprite2", "sprite1"),
                    listOf(
                        Action.ChangeVariable("score", Expr.Num(1.0)),
                        Action.SetProperty("text1", Props.TEXT, Expr.Join(Expr.Text("Очки: "), score)),
                        Action.PlayNote(Expr.Num(76.0), Expr.Num(0.12)),
                        randomSpot,
                        Action.If(
                            Expr.Compare(CompareOp.EQ, score, Expr.Num(10.0)),
                            then = listOf(Action.Broadcast("победа")),
                        ),
                    ),
                ),
            ),
        )
        val ground = Sprite(
            id = "sprite3", name = "Земля", costumes = listOf("p_ground"), y = -196.0, physics = PhysicsType.STATIC,
        )
        val cloud = Sprite(
            id = "sprite4", name = "Облако", costumes = listOf("p_cloud"), size = 90.0, x = -60.0, y = 150.0,
            scripts = listOf(
                Script(
                    "c_fly", Event.ScreenOpened,
                    listOf(
                        Action.Forever(
                            listOf(
                                Action.ChangeX(Expr.Num(0.6)),
                                Action.If(
                                    Expr.Compare(CompareOp.GT, Expr.SpriteAttr(Targets.SELF, SpriteAttrKind.X), Expr.Num(230.0)),
                                    then = listOf(Action.SetX(Expr.Num(-230.0))),
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        )
        val platform = Sprite(
            id = "sprite5", name = "Платформа", costumes = listOf("p_platform"), x = 80.0, y = -60.0, physics = PhysicsType.STATIC,
        )
        val stage = Component(
            "stage1", ComponentType.STAGE,
            mapOf(Props.FILL_WIDTH to "true", Props.HEIGHT to "420", Props.BACKGROUND to "#D0EBFF"),
            sprites = listOf(cloud, ground, platform, star, frog),
        )
        val screen = Screen(
            id = "main",
            name = "Игра",
            root = ProjectFactory.rootColumn(
                children = listOf(
                    Component("text1", ComponentType.TEXT, mapOf(Props.TEXT to "Очки: 0", Props.TEXT_SIZE to "22", Props.BOLD to "true")),
                    stage,
                    Component(
                        "row1", ComponentType.ROW, mapOf(Props.FILL_WIDTH to "true", Props.SPACING to "8"),
                        children = listOf(
                            Component("button1", ComponentType.BUTTON, mapOf(Props.TEXT to "◀", Props.WEIGHT to "1")),
                            Component("button2", ComponentType.BUTTON, mapOf(Props.TEXT to "Прыжок", Props.WEIGHT to "2")),
                            Component("button3", ComponentType.BUTTON, mapOf(Props.TEXT to "▶", Props.WEIGHT to "1")),
                        ),
                    ),
                    Component("text2", ComponentType.TEXT, mapOf(Props.TEXT to "Собери 10 звёзд. Тапни по сцене — прыжок.", Props.TEXT_SIZE to "13")),
                ),
            ),
            scripts = listOf(
                Script("g_left", Event.Clicked("button1"), listOf(Action.Broadcast("влево"))),
                Script("g_jump", Event.Clicked("button2"), listOf(Action.Broadcast("прыжок"))),
                Script("g_right", Event.Clicked("button3"), listOf(Action.Broadcast("вправо"))),
                Script("g_tap", Event.StageTapped("stage1"), listOf(Action.Broadcast("прыжок"))),
                Script(
                    "g_start", Event.ScreenOpened,
                    listOf(
                        Action.SetVariable("score", Expr.Num(0.0)),
                        Action.SetProperty("text1", Props.TEXT, Expr.Text("Очки: 0")),
                    ),
                ),
            ),
        )
        return Project(
            id = id,
            name = "Прыгай!",
            packageName = "com.orvenacreate.app.jumper",
            themeColor = "#2F9E44",
            variables = listOf(Variable("score", "0")),
            messages = listOf("прыжок", "влево", "вправо", "победа"),
            pictures = pictures,
            screens = listOf(screen),
        )
    }
}
