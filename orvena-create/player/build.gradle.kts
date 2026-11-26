plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// The player is the template of every exported app. The editor patches these placeholders
// in the binary manifest (see exporter/ApkExporter.kt), so keep them in sync with it.
android {
    namespace = "com.orvenadigital.create.player"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.orvenacreate.template"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "__ORVENA_VERSION__"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // no signingConfig: the template stays unsigned, the editor signs every export
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
    }
    lint {
        checkReleaseBuilds = false
    }
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }
}

dependencies {
    implementation(project(":runtime"))
    implementation(libs.kotlinx.coroutines.android)
}
