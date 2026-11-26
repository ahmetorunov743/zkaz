package com.orvenadigital.create.data

import android.content.Context
import com.orvenadigital.create.core.model.Ids
import com.orvenadigital.create.core.model.Project
import com.orvenadigital.create.core.model.ProjectJson
import com.orvenadigital.create.core.model.Samples
import java.io.File

/** Projects live as JSON files in app storage: files/projects/<id>.json. */
class ProjectRepository(context: Context) {
    private val dir = File(context.filesDir, "projects").apply { mkdirs() }
    private val seededFlag = File(dir, ".seeded")

    @Synchronized
    fun list(): List<Project> =
        (dir.listFiles { f -> f.extension == "json" } ?: emptyArray())
            .sortedByDescending { it.lastModified() }
            .mapNotNull { runCatching { ProjectJson.decode(it.readText()) }.getOrNull() }

    @Synchronized
    fun load(id: String): Project? {
        val file = file(id)
        if (!file.exists()) return null
        return runCatching { ProjectJson.decode(file.readText()) }.getOrNull()
    }

    @Synchronized
    fun save(project: Project) {
        val tmp = File(dir, "${project.id}.tmp")
        tmp.writeText(ProjectJson.encode(project))
        if (!tmp.renameTo(file(project.id))) {
            file(project.id).writeText(tmp.readText())
            tmp.delete()
        }
    }

    @Synchronized
    fun delete(id: String) {
        file(id).delete()
    }

    /** On the very first launch put the sample project in, so the editor isn't empty. */
    @Synchronized
    fun seedIfFirstLaunch() {
        if (seededFlag.exists()) return
        save(Samples.counter(id = Ids.random("p")))
        seededFlag.createNewFile()
    }

    private fun file(id: String) = File(dir, "$id.json")
}
