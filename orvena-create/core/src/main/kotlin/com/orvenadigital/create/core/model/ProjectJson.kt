package com.orvenadigital.create.core.model

import kotlinx.serialization.json.Json

object ProjectJson {
    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        classDiscriminator = "kind"
    }

    fun encode(project: Project): String = json.encodeToString(Project.serializer(), project)

    fun decode(text: String): Project = json.decodeFromString(Project.serializer(), text)
}
