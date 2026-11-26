package com.orvenadigital.create.runtime

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.ComponentType
import com.orvenadigital.create.core.model.Event
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.Props
import com.orvenadigital.create.core.model.Screen

val OrvenaViolet = Color(0xFF5B3DF5)

fun parseColorOrNull(value: String?): Color? {
    if (value.isNullOrBlank()) return null
    return try {
        Color(android.graphics.Color.parseColor(value.trim()))
    } catch (e: IllegalArgumentException) {
        null
    }
}

private fun String.isTrue(default: Boolean): Boolean = when (trim().lowercase()) {
    "true", "1", "да", "yes" -> true
    "false", "0", "нет", "no" -> false
    else -> default
}

private fun String.dpValue(default: Float): Float = trim().replace(',', '.').toFloatOrNull()?.coerceIn(0f, 400f) ?: default

/** Material theme built from the project's main color. */
@Composable
fun RuntimeTheme(project: Project, content: @Composable () -> Unit) {
    val primary = parseColorOrNull(project.themeColor) ?: OrvenaViolet
    MaterialTheme(colorScheme = lightColorScheme(primary = primary)) {
        Surface(color = MaterialTheme.colorScheme.background, content = content)
    }
}

/** Shows the screen on top of the back stack and runs its blocks. */
@Composable
fun ProjectView(runtime: ProjectRuntime, modifier: Modifier = Modifier, handleBack: Boolean = true) {
    if (handleBack) {
        BackHandler(enabled = runtime.backStack.size > 1) { runtime.goBack() }
    }
    val entry = runtime.backStack.lastOrNull()
    val screen = entry?.let { runtime.screen(it.screenId) }
    if (entry == null || screen == null) {
        Box(modifier)
        return
    }
    LaunchedEffect(entry.token) { runtime.onEntryShown(entry) }
    key(entry.token) {
        Column(modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            RenderComponent(runtime, screen, screen.root, Modifier)
        }
    }
}

@Composable
private fun RenderComponent(rt: ProjectRuntime, screen: Screen, c: Component, outer: Modifier) {
    if (!rt.prop(c, Props.VISIBLE).isTrue(true)) return

    val background = parseColorOrNull(rt.prop(c, Props.BACKGROUND))
    val padding = rt.prop(c, Props.PADDING).dpValue(0f)
    var mod = outer
    if (rt.prop(c, Props.FILL_WIDTH).isTrue(false)) mod = mod.fillMaxWidth()
    val paintsOwnBackground = c.type == ComponentType.BUTTON || c.type == ComponentType.CARD
    if (background != null && !paintsOwnBackground) mod = mod.background(background, RoundedCornerShape(8.dp))
    if (padding > 0f && c.type != ComponentType.CARD) mod = mod.padding(padding.dp)

    val spacing = rt.prop(c, Props.SPACING).dpValue(8f).dp
    val align = rt.prop(c, Props.ALIGN)

    when (c.type) {
        ComponentType.COLUMN -> Column(
            modifier = mod,
            verticalArrangement = Arrangement.spacedBy(spacing),
            horizontalAlignment = horizontal(align),
        ) {
            c.children.forEach { RenderComponent(rt, screen, it, Modifier) }
        }

        ComponentType.ROW -> Row(
            modifier = mod,
            horizontalArrangement = Arrangement.spacedBy(spacing),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            c.children.forEach { child ->
                val weight = rt.prop(child, Props.WEIGHT).dpValue(0f)
                RenderComponent(rt, screen, child, if (weight > 0f) Modifier.weight(weight) else Modifier)
            }
        }

        ComponentType.CARD -> Card(
            modifier = mod,
            colors = if (background != null) CardDefaults.cardColors(containerColor = background) else CardDefaults.cardColors(),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(if (padding > 0f) padding.dp else 12.dp),
                verticalArrangement = Arrangement.spacedBy(spacing),
                horizontalAlignment = horizontal(align),
            ) {
                c.children.forEach { RenderComponent(rt, screen, it, Modifier) }
            }
        }

        ComponentType.TEXT -> Text(
            text = rt.prop(c, Props.TEXT),
            modifier = mod,
            fontSize = rt.prop(c, Props.TEXT_SIZE).dpValue(16f).coerceAtLeast(6f).sp,
            fontWeight = if (rt.prop(c, Props.BOLD).isTrue(false)) FontWeight.Bold else FontWeight.Normal,
            color = parseColorOrNull(rt.prop(c, Props.TEXT_COLOR)) ?: Color.Unspecified,
            textAlign = when (align) {
                "center" -> TextAlign.Center
                "end" -> TextAlign.End
                else -> TextAlign.Start
            },
        )

        ComponentType.BUTTON -> Button(
            onClick = { rt.dispatch(screen, Event.Clicked(c.id)) },
            modifier = mod,
            enabled = rt.prop(c, Props.ENABLED).isTrue(true),
            colors = if (background != null) ButtonDefaults.buttonColors(containerColor = background) else ButtonDefaults.buttonColors(),
        ) {
            Text(rt.prop(c, Props.TEXT))
        }

        ComponentType.INPUT -> {
            val hint = rt.prop(c, Props.HINT)
            OutlinedTextField(
                value = rt.prop(c, Props.TEXT),
                onValueChange = {
                    rt.setProperty(c.id, Props.TEXT, it)
                    rt.dispatch(screen, Event.TextChanged(c.id))
                },
                modifier = mod,
                label = if (hint.isNotEmpty()) {
                    { Text(hint) }
                } else {
                    null
                },
                singleLine = true,
            )
        }

        ComponentType.CHECKBOX -> Row(modifier = mod, verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = rt.prop(c, Props.CHECKED).isTrue(false),
                onCheckedChange = {
                    rt.setProperty(c.id, Props.CHECKED, it.toString())
                    rt.dispatch(screen, Event.CheckedChanged(c.id))
                },
            )
            Text(rt.prop(c, Props.TEXT))
        }

        ComponentType.DIVIDER -> HorizontalDivider(modifier = mod)

        ComponentType.SPACER -> Spacer(modifier = mod.height(rt.prop(c, Props.HEIGHT).dpValue(16f).dp))
    }
}

private fun horizontal(align: String): Alignment.Horizontal = when (align) {
    "center" -> Alignment.CenterHorizontally
    "end" -> Alignment.End
    else -> Alignment.Start
}

/** "Made with Orvena Create" splash of the free tier. */
@Composable
fun BrandingSplash(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().background(Color.White), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Made with", color = Color(0xFF868E96), fontSize = 14.sp)
            Text("Orvena Create", color = OrvenaViolet, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Text("by Orvena Digital", color = Color(0xFF868E96), fontSize = 12.sp)
        }
    }
}
