package com.orvenadigital.create.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.isValidPackageName
import com.orvenadigital.create.export.ExportManager
import com.orvenadigital.create.exporter.ApkExporter
import kotlinx.coroutines.launch
import java.io.File

private sealed interface ExportState {
    data object Idle : ExportState
    data object Building : ExportState
    data class Done(val file: File) : ExportState
    data class Failed(val message: String) : ExportState
}

@Composable
fun ExportDialog(project: Project, onEdit: ((Project) -> Project) -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val manager = remember { ExportManager(context.applicationContext) }
    val scope = rememberCoroutineScope()

    var name by remember { mutableStateOf(project.name) }
    var packageName by remember { mutableStateOf(project.packageName) }
    var versionName by remember { mutableStateOf(project.versionName) }
    var versionCode by remember { mutableStateOf(project.versionCode.toString()) }
    var state by remember { mutableStateOf<ExportState>(ExportState.Idle) }

    val packageError = when {
        !isValidPackageName(packageName) -> "Только a–z, 0–9, _ и точки, минимум две части: com.myname.app"
        packageName == context.packageName || packageName == ApkExporter.TEMPLATE_PACKAGE -> "Это имя занято самим Orvena Create"
        else -> null
    }
    val code = versionCode.toIntOrNull()
    val codeError = if (code == null || code < 1 || code > 2_100_000_000) "Целое число от 1" else null
    val valid = name.isNotBlank() && versionName.isNotBlank() && packageError == null && codeError == null
    val busy = state is ExportState.Building

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("Собрать APK") },
        text = {
            Column(
                Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    value = name, onValueChange = { name = it.take(50) }, enabled = !busy,
                    label = { Text("Название приложения") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = packageName, onValueChange = { packageName = it.trim().take(150) }, enabled = !busy,
                    label = { Text("Имя пакета") }, singleLine = true, isError = packageError != null,
                    supportingText = { Text(packageError ?: "У каждого приложения своё, иначе они заменят друг друга") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = versionName, onValueChange = { versionName = it.take(20) }, enabled = !busy,
                        label = { Text("Версия") }, singleLine = true, modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = versionCode, onValueChange = { v -> versionCode = v.filter { it.isDigit() }.take(10) }, enabled = !busy,
                        label = { Text("Код версии") }, singleLine = true, isError = codeError != null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f),
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = true, onCheckedChange = null, enabled = false)
                    Text(
                        "Заставка «Made with Orvena Create». Убрать её можно будет в Pro.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }

                when (val s = state) {
                    ExportState.Idle -> Text(
                        "Для обновления уже установленного приложения увеличь код версии.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    ExportState.Building -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        CircularProgressIndicator(Modifier.size(24.dp))
                        Text("Собираю и подписываю…")
                    }
                    is ExportState.Done -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Готово! ${s.file.name} · ${s.file.length() / 1024} КБ", fontWeight = FontWeight.SemiBold)
                        Button(onClick = {
                            if (!manager.install(s.file)) {
                                Toast.makeText(context, "Разреши Orvena Create устанавливать приложения и нажми ещё раз", Toast.LENGTH_LONG).show()
                            }
                        }, modifier = Modifier.fillMaxWidth()) { Text("Установить") }
                        OutlinedButton(onClick = { manager.share(s.file) }, modifier = Modifier.fillMaxWidth()) { Text("Поделиться APK") }
                    }
                    is ExportState.Failed -> Text("Не получилось: ${s.message}", color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = valid && !busy,
                onClick = {
                    val updatedName = name.trim()
                    val updatedPackage = packageName
                    val updatedVersion = versionName.trim()
                    val updatedCode = code ?: 1
                    val updated = project.copy(
                        name = updatedName, packageName = updatedPackage,
                        versionName = updatedVersion, versionCode = updatedCode,
                    )
                    onEdit { it.copy(name = updatedName, packageName = updatedPackage, versionName = updatedVersion, versionCode = updatedCode) }
                    state = ExportState.Building
                    scope.launch {
                        state = try {
                            ExportState.Done(manager.export(updated))
                        } catch (e: Exception) {
                            ExportState.Failed(e.message ?: e.javaClass.simpleName)
                        }
                    }
                },
            ) { Text(if (state is ExportState.Done) "Собрать ещё раз" else "Собрать") }
        },
        dismissButton = {
            TextButton(enabled = !busy, onClick = onDismiss) { Text("Закрыть") }
        },
    )
}
