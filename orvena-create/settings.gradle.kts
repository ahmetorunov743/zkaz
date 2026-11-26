pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "OrvenaCreate"

// core     — project model, blocks and interpreter (pure Kotlin/JVM)
// exporter — on-device APK builder: manifest patcher, repack, signing (pure Kotlin/JVM)
// runtime  — Compose renderer shared by the editor preview and exported apps
// player   — the template APK every exported app is made from
// app      — the Orvena Create editor
include(":core", ":exporter", ":runtime", ":player", ":app")
