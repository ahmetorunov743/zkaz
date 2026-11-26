package com.orvenadigital.create.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.orvenadigital.create.core.model.Component
import com.orvenadigital.create.core.model.ComponentCatalog
import com.orvenadigital.create.core.model.PropDef
import com.orvenadigital.create.core.model.PropKind
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.picture
import com.orvenadigital.create.runtime.PictureThumb
import com.orvenadigital.create.runtime.parseColorOrNull
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

@Composable
fun PropertyEditor(project: Project, component: Component, onEdit: ((Project) -> Project) -> Unit, onChange: (Component) -> Unit) {
    fun value(def: PropDef) = component.props[def.key] ?: def.default
    fun set(def: PropDef, v: String) = onChange(component.copy(props = component.props + (def.key to v)))

    Column(
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .imePadding()
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(ComponentCatalog.label(component.type), style = MaterialTheme.typography.titleLarge)
        Text(
            "ID для блоков: ${component.id}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ComponentCatalog.props(component.type).forEach { def ->
            when (def.kind) {
                PropKind.TEXT -> OutlinedTextField(
                    value = value(def),
                    onValueChange = { set(def, it) },
                    label = { Text(def.label) },
                    modifier = Modifier.fillMaxWidth(),
                )
                PropKind.NUMBER -> OutlinedTextField(
                    value = value(def),
                    onValueChange = { v -> set(def, v.filter { it.isDigit() || it == '.' || it == '-' }.take(6)) },
                    label = { Text(def.label) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                PropKind.BOOL -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(def.label, modifier = Modifier.weight(1f))
                    Switch(checked = value(def) == "true", onCheckedChange = { set(def, it.toString()) })
                }
                PropKind.COLOR -> ColorPicker(def.label, value(def)) { set(def, it) }
                PropKind.CHOICE -> ChoicePicker(def, value(def)) { set(def, it) }
                PropKind.PICTURE -> PicturePropRow(project, def.label, value(def), onEdit) { set(def, it) }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColorPicker(label: String, value: String, onPick: (String) -> Unit) {
    Column {
        Text(label, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(6.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Swatch(null, selected = value.isEmpty()) { onPick("") }
            ComponentCatalog.PALETTE.forEach { hex ->
                Swatch(parseColorOrNull(hex), selected = value.equals(hex, ignoreCase = true)) { onPick(hex) }
            }
        }
    }
}

@Composable
private fun Swatch(color: Color?, selected: Boolean, onClick: () -> Unit) {
    val ring = if (selected) MaterialTheme.colorScheme.primary else Color(0xFFCED4DA)
    Box(
        Modifier
            .size(36.dp)
            .border(if (selected) 3.dp else 1.dp, ring, CircleShape)
            .padding(4.dp)
            .background(color ?: Color.White, CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (color == null) Text("—", color = Color(0xFF868E96))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChoicePicker(def: PropDef, value: String, onPick: (String) -> Unit) {
    Column {
        Text(def.label, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(6.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            def.choices.forEach { (key, title) ->
                if (key == value) {
                    Button(onClick = { onPick(key) }) { Text(title) }
                } else {
                    OutlinedButton(onClick = { onPick(key) }) { Text(title) }
                }
            }
        }
    }
}

@Composable
private fun PicturePropRow(project: Project, label: String, value: String, onEdit: ((Project) -> Project) -> Unit, onPick: (String) -> Unit) {
    var picking by remember { mutableStateOf(false) }
    val picture = project.picture(value)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        PictureThumb(picture, Modifier.size(56.dp).background(Color(0xFFF1F3F5)))
        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
            Text(label, fontWeight = FontWeight.Medium)
            Text(picture?.name ?: "не выбрана", style = MaterialTheme.typography.bodySmall)
        }
        OutlinedButton(onClick = { picking = true }) { Text("Выбрать") }
    }
    if (picking) {
        PicturePickerSheet(
            title = label,
            project = project,
            onEdit = onEdit,
            onPick = { onPick(it.id) },
            onDismiss = { picking = false },
        )
    }
}
