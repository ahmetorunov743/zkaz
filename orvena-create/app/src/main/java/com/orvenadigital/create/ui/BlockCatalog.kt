package com.orvenadigital.create.ui

import androidx.compose.ui.graphics.Color
import com.orvenadigital.create.core.model.Action
import com.orvenadigital.create.core.model.ArithOp
import com.orvenadigital.create.core.model.CompareOp
import com.orvenadigital.create.core.model.ComponentCatalog
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Expr
import com.orvenadigital.create.core.model.LogicOp
import com.orvenadigital.create.core.model.MathFn
import com.orvenadigital.create.core.model.PhysicsType
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.core.model.RotationStyle
import com.orvenadigital.create.core.model.SensorKind
import com.orvenadigital.create.core.model.SpriteAttrKind
import com.orvenadigital.create.core.model.StopMode
import com.orvenadigital.create.core.model.Targets

/** The block "compartments" of the palette. */
enum class BlockCategory(val title: String, val color: Color) {
    EVENTS("События", Color(0xFFF59F00)),
    CONTROL("Управление", Color(0xFFE8590C)),
    MOTION("Движение", Color(0xFF1C7ED6)),
    LOOKS("Внешность", Color(0xFFAE3EC9)),
    PHYSICS("Физика", Color(0xFF0CA678)),
    SOUND("Звук", Color(0xFFE64980)),
    UI("Интерфейс", Color(0xFF5B3DF5)),
    SENSING("Сенсоры", Color(0xFF1098AD)),
    OPERATORS("Операторы", Color(0xFF37B24D)),
    VARIABLES("Переменные", Color(0xFFD9480F)),
}

/** Who the block works for: everyone, only sprites (motion, looks…), or only the screen. */
enum class BlockScope { ANY, SPRITE }

sealed class PaletteItem(
    val category: BlockCategory,
    val label: String,
    val keywords: String,
    val scope: BlockScope,
) {
    fun matches(query: String): Boolean {
        val q = query.trim().lowercase()
        return q.isEmpty() || "$label $keywords ${category.title}".lowercase().contains(q)
    }
}

class ActionItem(
    category: BlockCategory,
    label: String,
    keywords: String = "",
    scope: BlockScope = BlockScope.ANY,
    val make: (BlockContext) -> Action,
) : PaletteItem(category, label, keywords, scope)

class EventItem(
    category: BlockCategory,
    label: String,
    keywords: String = "",
    scope: BlockScope = BlockScope.ANY,
    val make: (BlockContext) -> Event,
) : PaletteItem(category, label, keywords, scope)

class ExprItem(
    category: BlockCategory,
    label: String,
    keywords: String = "",
    scope: BlockScope = BlockScope.ANY,
    val make: (BlockContext, current: Expr) -> Expr,
) : PaletteItem(category, label, keywords, scope)

fun categoryOf(action: Action): BlockCategory = when (action) {
    is Action.Broadcast -> BlockCategory.EVENTS
    is Action.If, is Action.Repeat, is Action.Forever, is Action.RepeatUntil, is Action.Wait, is Action.WaitUntil,
    is Action.Stop, is Action.CreateClone, Action.DeleteClone -> BlockCategory.CONTROL
    is Action.Move, is Action.Turn, is Action.PointInDirection, is Action.PointTowards, is Action.GoTo,
    is Action.GoToTarget, is Action.Glide, is Action.ChangeX, is Action.SetX, is Action.ChangeY, is Action.SetY,
    Action.BounceOnEdge, is Action.SetRotationStyle -> BlockCategory.MOTION
    is Action.SetCostume, Action.NextCostume, is Action.SetSize, is Action.ChangeSize, Action.Show, Action.Hide,
    is Action.Say, is Action.SayFor, is Action.SetGhost, Action.GoToFront -> BlockCategory.LOOKS
    is Action.SetPhysics, is Action.SetVelocity, is Action.Push, is Action.SetGravity, is Action.SetBounce,
    is Action.SetFriction -> BlockCategory.PHYSICS
    is Action.PlayNote, is Action.Vibrate -> BlockCategory.SOUND
    is Action.SetProperty, is Action.ShowMessage, is Action.OpenScreen, Action.GoBack, is Action.Ask -> BlockCategory.UI
    Action.ResetTimer -> BlockCategory.SENSING
    is Action.SetVariable, is Action.ChangeVariable, is Action.ListAdd, is Action.ListDelete, is Action.ListClear,
    is Action.ListReplace -> BlockCategory.VARIABLES
}

private fun n(v: Double) = Expr.Num(v)
private fun t(v: String) = Expr.Text(v)

object BlockCatalog {

    val events: List<EventItem> = listOf(
        EventItem(BlockCategory.EVENTS, "Когда экран открыт / игра началась", "старт начало запуск флаг") { Event.ScreenOpened },
        EventItem(BlockCategory.EVENTS, "Когда нажата кнопка…", "клик тап кнопка") { ctx ->
            Event.Clicked(ctx.firstComponent(ComponentType.BUTTON))
        },
        EventItem(BlockCategory.EVENTS, "Когда меня нажали", "тап клик спрайт палец", BlockScope.SPRITE) { ctx ->
            Event.SpriteTapped(ctx.owner?.id ?: "")
        },
        EventItem(BlockCategory.EVENTS, "Когда нажат спрайт…", "тап клик") { ctx -> Event.SpriteTapped(ctx.sprites.firstOrNull()?.id ?: "") },
        EventItem(BlockCategory.EVENTS, "Когда нажали на сцену", "тап клик фон") { ctx ->
            Event.StageTapped(ctx.firstComponent(ComponentType.STAGE))
        },
        EventItem(BlockCategory.EVENTS, "Когда я получу сообщение…", "вести получить сигнал broadcast") { ctx ->
            Event.Receive(ctx.defaultMessage())
        },
        EventItem(BlockCategory.EVENTS, "Когда я касаюсь…", "столкновение коснуться удар", BlockScope.SPRITE) { ctx ->
            Event.Touched(ctx.owner?.id ?: "", Targets.ANY)
        },
        EventItem(BlockCategory.EVENTS, "Когда спрайт касается…", "столкновение") { ctx ->
            Event.Touched(ctx.sprites.firstOrNull()?.id ?: "", Targets.ANY)
        },
        EventItem(BlockCategory.EVENTS, "Когда меняется текст в поле…", "ввод текст поле") { ctx ->
            Event.TextChanged(ctx.firstComponent(ComponentType.INPUT))
        },
        EventItem(BlockCategory.EVENTS, "Когда переключён флажок…", "галочка") { ctx ->
            Event.CheckedChanged(ctx.firstComponent(ComponentType.CHECKBOX))
        },
        EventItem(BlockCategory.CONTROL, "Когда я появлюсь как клон", "клон копия", BlockScope.SPRITE) { Event.CloneStarted },
    )

    val actions: List<ActionItem> = listOf(
        // events
        ActionItem(BlockCategory.EVENTS, "отправить всем сообщение", "вещать вести сигнал broadcast") { ctx -> Action.Broadcast(ctx.defaultMessage()) },
        ActionItem(BlockCategory.EVENTS, "отправить всем и ждать", "вещать вести сигнал broadcast") { ctx -> Action.Broadcast(ctx.defaultMessage(), andWait = true) },
        // control
        ActionItem(BlockCategory.CONTROL, "ждать 1 секунду", "пауза задержка") { Action.Wait(n(1.0)) },
        ActionItem(BlockCategory.CONTROL, "повторить 10 раз", "цикл") { Action.Repeat(n(10.0)) },
        ActionItem(BlockCategory.CONTROL, "всегда", "бесконечно цикл forever") { Action.Forever() },
        ActionItem(BlockCategory.CONTROL, "если … то … иначе", "условие") { Action.If(Expr.Compare(CompareOp.EQ, n(1.0), n(1.0))) },
        ActionItem(BlockCategory.CONTROL, "повторять пока не …", "цикл условие до") { Action.RepeatUntil(Expr.Bool(false)) },
        ActionItem(BlockCategory.CONTROL, "ждать пока не …", "условие") { Action.WaitUntil(Expr.Bool(true)) },
        ActionItem(BlockCategory.CONTROL, "стоп", "остановить конец") { Action.Stop(StopMode.THIS_SCRIPT) },
        ActionItem(BlockCategory.CONTROL, "создать клон", "копия") { Action.CreateClone(Targets.SELF) },
        ActionItem(BlockCategory.CONTROL, "удалить этот клон", "копия", BlockScope.SPRITE) { Action.DeleteClone },
        // motion
        ActionItem(BlockCategory.MOTION, "идти 10 шагов", "двигаться вперёд", BlockScope.SPRITE) { Action.Move(n(10.0)) },
        ActionItem(BlockCategory.MOTION, "повернуть на 15°", "поворот вращать", BlockScope.SPRITE) { Action.Turn(n(15.0)) },
        ActionItem(BlockCategory.MOTION, "смотреть в направлении 90", "направление", BlockScope.SPRITE) { Action.PointInDirection(n(90.0)) },
        ActionItem(BlockCategory.MOTION, "смотреть на …", "палец спрайт", BlockScope.SPRITE) { Action.PointTowards(Targets.FINGER) },
        ActionItem(BlockCategory.MOTION, "перейти в x: 0 y: 0", "позиция координаты", BlockScope.SPRITE) { Action.GoTo(n(0.0), n(0.0)) },
        ActionItem(BlockCategory.MOTION, "перейти к …", "случайное место палец", BlockScope.SPRITE) { Action.GoToTarget(Targets.RANDOM) },
        ActionItem(BlockCategory.MOTION, "плыть 1 сек к x: 0 y: 0", "анимация скользить", BlockScope.SPRITE) { Action.Glide(n(1.0), n(0.0), n(0.0)) },
        ActionItem(BlockCategory.MOTION, "изменить x на 10", "вправо влево", BlockScope.SPRITE) { Action.ChangeX(n(10.0)) },
        ActionItem(BlockCategory.MOTION, "установить x в 0", "позиция", BlockScope.SPRITE) { Action.SetX(n(0.0)) },
        ActionItem(BlockCategory.MOTION, "изменить y на 10", "вверх вниз", BlockScope.SPRITE) { Action.ChangeY(n(10.0)) },
        ActionItem(BlockCategory.MOTION, "установить y в 0", "позиция", BlockScope.SPRITE) { Action.SetY(n(0.0)) },
        ActionItem(BlockCategory.MOTION, "если на краю, оттолкнуться", "отскок край", BlockScope.SPRITE) { Action.BounceOnEdge },
        ActionItem(BlockCategory.MOTION, "стиль вращения", "поворот", BlockScope.SPRITE) { Action.SetRotationStyle(RotationStyle.LEFT_RIGHT) },
        // looks
        ActionItem(BlockCategory.LOOKS, "сменить костюм на …", "картинка образ", BlockScope.SPRITE) { ctx ->
            Action.SetCostume(t(ctx.ownerCostumeNames().firstOrNull() ?: "1"))
        },
        ActionItem(BlockCategory.LOOKS, "следующий костюм", "анимация картинка", BlockScope.SPRITE) { Action.NextCostume },
        ActionItem(BlockCategory.LOOKS, "сказать … 2 сек", "говорить облачко реплика", BlockScope.SPRITE) { Action.SayFor(t("Привет!"), n(2.0)) },
        ActionItem(BlockCategory.LOOKS, "сказать …", "говорить облачко", BlockScope.SPRITE) { Action.Say(t("Привет!")) },
        ActionItem(BlockCategory.LOOKS, "установить размер 100 %", "масштаб величина", BlockScope.SPRITE) { Action.SetSize(n(100.0)) },
        ActionItem(BlockCategory.LOOKS, "изменить размер на 10", "масштаб", BlockScope.SPRITE) { Action.ChangeSize(n(10.0)) },
        ActionItem(BlockCategory.LOOKS, "показаться", "видимый", BlockScope.SPRITE) { Action.Show },
        ActionItem(BlockCategory.LOOKS, "спрятаться", "скрыть невидимый", BlockScope.SPRITE) { Action.Hide },
        ActionItem(BlockCategory.LOOKS, "прозрачность 50 %", "призрак эффект", BlockScope.SPRITE) { Action.SetGhost(n(50.0)) },
        ActionItem(BlockCategory.LOOKS, "на передний план", "слой выше", BlockScope.SPRITE) { Action.GoToFront },
        // physics
        ActionItem(BlockCategory.PHYSICS, "тип физики …", "падать гравитация опора тело", BlockScope.SPRITE) { Action.SetPhysics(PhysicsType.DYNAMIC) },
        ActionItem(BlockCategory.PHYSICS, "толкнуть x: 0 y: 400", "прыжок импульс сила", BlockScope.SPRITE) { Action.Push(n(0.0), n(400.0)) },
        ActionItem(BlockCategory.PHYSICS, "скорость x: 0 y: 0", "движение", BlockScope.SPRITE) { Action.SetVelocity(n(0.0), n(0.0)) },
        ActionItem(BlockCategory.PHYSICS, "гравитация 800", "притяжение вес", BlockScope.SPRITE) { Action.SetGravity(n(800.0)) },
        ActionItem(BlockCategory.PHYSICS, "упругость 50 %", "отскок прыгучесть", BlockScope.SPRITE) { Action.SetBounce(n(50.0)) },
        ActionItem(BlockCategory.PHYSICS, "трение 50 %", "скольжение", BlockScope.SPRITE) { Action.SetFriction(n(50.0)) },
        // sound
        ActionItem(BlockCategory.SOUND, "сыграть ноту 60 0.25 сек", "звук музыка тон") { Action.PlayNote(n(60.0), n(0.25)) },
        ActionItem(BlockCategory.SOUND, "вибрация 200 мс", "вибро телефон") { Action.Vibrate(n(200.0)) },
        // ui
        ActionItem(BlockCategory.UI, "установить свойство детальки", "текст цвет видимый изменить") { ctx ->
            val target = ctx.components.firstOrNull { it.type == ComponentType.TEXT }
                ?: ctx.components.firstOrNull { it.id != ctx.screen.root.id }
            Action.SetProperty(target?.id ?: "", target?.let { ComponentCatalog.mainProp(it.type) } ?: Props.TEXT, t("Привет"))
        },
        ActionItem(BlockCategory.UI, "спросить … и ждать", "ввод текста вопрос ответ клавиатура") { Action.Ask(t("Как тебя зовут?")) },
        ActionItem(BlockCategory.UI, "показать сообщение", "тост уведомление") { Action.ShowMessage(t("Привет!")) },
        ActionItem(BlockCategory.UI, "открыть экран", "перейти страница") { ctx ->
            Action.OpenScreen(ctx.project.screens.firstOrNull { it.id != ctx.screen.id }?.id ?: ctx.screen.id)
        },
        ActionItem(BlockCategory.UI, "вернуться назад", "экран") { Action.GoBack },
        // sensing
        ActionItem(BlockCategory.SENSING, "сбросить таймер", "время секундомер") { Action.ResetTimer },
        // variables
        ActionItem(BlockCategory.VARIABLES, "задать переменную", "установить значение") { ctx -> Action.SetVariable(ctx.defaultVariable(), n(0.0)) },
        ActionItem(BlockCategory.VARIABLES, "изменить переменную на 1", "прибавить счёт") { ctx -> Action.ChangeVariable(ctx.defaultVariable(), n(1.0)) },
        ActionItem(BlockCategory.VARIABLES, "добавить в список", "массив") { ctx -> Action.ListAdd(ctx.defaultList(), t("вещь")) },
        ActionItem(BlockCategory.VARIABLES, "удалить элемент списка", "массив") { ctx -> Action.ListDelete(ctx.defaultList(), n(1.0)) },
        ActionItem(BlockCategory.VARIABLES, "заменить элемент списка", "массив") { ctx -> Action.ListReplace(ctx.defaultList(), n(1.0), t("вещь")) },
        ActionItem(BlockCategory.VARIABLES, "очистить список", "массив удалить всё") { ctx -> Action.ListClear(ctx.defaultList()) },
    )

    val exprs: List<ExprItem> = listOf(
        ExprItem(BlockCategory.OPERATORS, "Текст", "строка слово") { _, _ -> t("") },
        ExprItem(BlockCategory.OPERATORS, "Число", "цифра") { _, _ -> n(0.0) },
        ExprItem(BlockCategory.OPERATORS, "Да / нет", "истина ложь") { _, _ -> Expr.Bool(true) },
        ExprItem(BlockCategory.OPERATORS, "Соединить текст", "склеить объединить") { _, cur -> Expr.Join(cur, t("")) },
        ExprItem(BlockCategory.OPERATORS, "Посчитать (+ − × ÷)", "плюс минус умножить делить математика") { _, cur -> Expr.Arithmetic(ArithOp.ADD, cur, n(1.0)) },
        ExprItem(BlockCategory.OPERATORS, "Сравнить (= ≠ < >)", "больше меньше равно") { _, cur -> Expr.Compare(CompareOp.EQ, cur, n(0.0)) },
        ExprItem(BlockCategory.OPERATORS, "Условие и / или", "логика") { _, cur -> Expr.Logic(LogicOp.AND, cur, Expr.Bool(true)) },
        ExprItem(BlockCategory.OPERATORS, "Не (наоборот)", "логика") { _, cur -> Expr.Not(cur) },
        ExprItem(BlockCategory.OPERATORS, "Случайное число", "рандом") { _, _ -> Expr.RandomInt(n(1.0), n(10.0)) },
        ExprItem(BlockCategory.OPERATORS, "Функция (корень, округлить, sin…)", "математика модуль") { _, cur -> Expr.MathFunc(MathFn.ROUND, cur) },
        ExprItem(BlockCategory.OPERATORS, "Длина текста", "символы") { _, cur -> Expr.TextLength(cur) },
        ExprItem(BlockCategory.OPERATORS, "Буква номер …", "символ") { _, cur -> Expr.LetterOf(n(1.0), cur) },
        ExprItem(BlockCategory.OPERATORS, "Текст содержит …", "найти поиск") { _, cur -> Expr.Contains(cur, t("а")) },
        ExprItem(BlockCategory.VARIABLES, "Переменная", "значение") { ctx, _ -> Expr.GetVariable(ctx.project.variables.firstOrNull()?.name ?: "") },
        ExprItem(BlockCategory.VARIABLES, "Элемент списка", "массив") { ctx, _ -> Expr.ListItem(ctx.defaultList(), n(1.0)) },
        ExprItem(BlockCategory.VARIABLES, "Длина списка", "массив количество") { ctx, _ -> Expr.ListLength(ctx.defaultList()) },
        ExprItem(BlockCategory.VARIABLES, "Список содержит …", "массив найти") { ctx, cur -> Expr.ListContains(ctx.defaultList(), cur) },
        ExprItem(BlockCategory.SENSING, "Свойство детальки", "текст поле ввод") { ctx, _ ->
            Expr.GetProperty(ctx.components.firstOrNull { it.id != ctx.screen.root.id && ComponentCatalog.mainProp(it.type) == Props.TEXT }?.id ?: "", Props.TEXT)
        },
        ExprItem(BlockCategory.SENSING, "Касаюсь …?", "столкновение край палец", BlockScope.SPRITE) { _, _ -> Expr.Touching(Targets.EDGE) },
        ExprItem(BlockCategory.SENSING, "Ответ (после «спросить»)", "ввод текст") { _, _ -> Expr.Sensor(SensorKind.ANSWER) },
        ExprItem(BlockCategory.SENSING, "Палец x", "касание тач") { _, _ -> Expr.Sensor(SensorKind.FINGER_X) },
        ExprItem(BlockCategory.SENSING, "Палец y", "касание тач") { _, _ -> Expr.Sensor(SensorKind.FINGER_Y) },
        ExprItem(BlockCategory.SENSING, "Палец нажат?", "касание тач") { _, _ -> Expr.Sensor(SensorKind.FINGER_DOWN) },
        ExprItem(BlockCategory.SENSING, "Таймер", "время секунды") { _, _ -> Expr.Sensor(SensorKind.TIMER) },
        ExprItem(BlockCategory.SENSING, "Наклон телефона", "акселерометр гироскоп") { _, _ -> Expr.Sensor(SensorKind.TILT_X) },
        ExprItem(BlockCategory.SENSING, "Дата и время", "час минута год") { _, _ -> Expr.Sensor(SensorKind.HOUR) },
        ExprItem(BlockCategory.SENSING, "Датчик …", "сцена ширина высота") { _, _ -> Expr.Sensor(SensorKind.STAGE_WIDTH) },
        ExprItem(BlockCategory.SENSING, "Расстояние до …", "дистанция", BlockScope.SPRITE) { _, _ -> Expr.DistanceTo(Targets.FINGER) },
        ExprItem(BlockCategory.MOTION, "Моя позиция x", "координаты", BlockScope.SPRITE) { _, _ -> Expr.SpriteAttr(Targets.SELF, SpriteAttrKind.X) },
        ExprItem(BlockCategory.MOTION, "Моя позиция y", "координаты", BlockScope.SPRITE) { _, _ -> Expr.SpriteAttr(Targets.SELF, SpriteAttrKind.Y) },
        ExprItem(BlockCategory.MOTION, "Моё направление", "угол", BlockScope.SPRITE) { _, _ -> Expr.SpriteAttr(Targets.SELF, SpriteAttrKind.DIRECTION) },
        ExprItem(BlockCategory.LOOKS, "Мой размер", "масштаб", BlockScope.SPRITE) { _, _ -> Expr.SpriteAttr(Targets.SELF, SpriteAttrKind.SIZE) },
        ExprItem(BlockCategory.LOOKS, "Номер костюма", "картинка", BlockScope.SPRITE) { _, _ -> Expr.SpriteAttr(Targets.SELF, SpriteAttrKind.COSTUME_NUMBER) },
        ExprItem(BlockCategory.PHYSICS, "Моя скорость y", "падение прыжок", BlockScope.SPRITE) { _, _ -> Expr.SpriteAttr(Targets.SELF, SpriteAttrKind.VELOCITY_Y) },
        ExprItem(BlockCategory.SENSING, "Свойство спрайта (x, y, размер…)", "координаты другой") { ctx, _ ->
            Expr.SpriteAttr(ctx.sprites.firstOrNull()?.id ?: Targets.SELF, SpriteAttrKind.X)
        },
    )

    fun visible(items: List<PaletteItem>, ctx: BlockContext): List<PaletteItem> =
        items.filter { it.scope == BlockScope.ANY || ctx.owner != null }
}
