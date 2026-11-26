plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.apksig)
    testImplementation(libs.junit)
    testImplementation(project(":core"))
}

tasks.test {
    // SmokeExportTest runs only when the player template is passed: -PtemplateApk=/path/to/player.apk
    systemProperty("orvena.templateApk", providers.gradleProperty("templateApk").getOrElse(""))
    systemProperty("orvena.smokeOut", layout.buildDirectory.dir("smoke").get().asFile.absolutePath)
    outputs.upToDateWhen { false }
    testLogging {
        events("passed", "skipped", "failed")
        showStandardStreams = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}
