plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.orvenadigital.create"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.orvenadigital.create"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.0.2"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    lint {
        checkReleaseBuilds = false
    }
    packaging {
        resources {
            excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/DEPENDENCIES")
        }
    }
}

/** Copies the built player template into the editor's assets as template/player.apk. */
abstract class CopyTemplateApk : DefaultTask() {
    @get:InputFiles
    abstract val playerApkDir: ConfigurableFileCollection

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val apks = playerApkDir.asFileTree.matching { include("*.apk") }.files
        val apk = apks.singleOrNull() ?: throw GradleException("Expected one player APK, found: $apks")
        val target = outputDir.get().asFile.resolve("template")
        target.deleteRecursively()
        target.mkdirs()
        apk.copyTo(target.resolve("player.apk"), overwrite = true)
    }
}

androidComponents {
    onVariants { variant ->
        val taskName = "copy" + variant.name.replaceFirstChar { it.uppercase() } + "TemplateApk"
        val copyTask = tasks.register(taskName, CopyTemplateApk::class.java) {
            playerApkDir.from(project(":player").layout.buildDirectory.dir("outputs/apk/release"))
            dependsOn(":player:assembleRelease")
        }
        variant.sources.assets?.addGeneratedSourceDirectory(copyTask, CopyTemplateApk::outputDir)
    }
}

dependencies {
    implementation(project(":runtime"))
    implementation(project(":exporter"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.compose.icons.core)
    implementation(libs.kotlinx.coroutines.android)
}
