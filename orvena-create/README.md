# Orvena Create

**Orvena Create** by **Orvena Digital** is a phone app for building Android apps out of bricks:
put the UI together from parts (screens, buttons, text, inputs, cards…), snap logic blocks onto
it, and export a **real, installable APK right on the phone**, offline, with no computer.

Version **0.0.1** — first demo.

## What is in 0.0.1

- **Designer.** A live preview of the screen and a brick tree: column, row, card, text, button,
  text input, checkbox, divider, spacer. Bricks nest inside containers. Each brick has properties
  (text, size, color, background, padding, alignment, width, visibility…).
- **Blocks.** Events (screen opened, button pressed, text changed, checkbox toggled) with actions:
  set a property, variables, message, open a screen / go back, if/else, repeat. Values snap
  together like bricks: text, numbers, yes/no, variables, brick properties, join, math,
  comparison, and/or, not, random.
- **Several screens** in one app.
- **Run** a project instantly inside the editor.
- **Export APK** on the device: your name, package name, version, signed with your own key,
  then install or share it.
- A sample project, «Счётчик», is created on first launch.

## How the APK export works

The editor carries a prebuilt **player** app (`player/`) in its assets. On export it:

1. copies the player template and drops its old signature;
2. patches the binary `AndroidManifest.xml` (package name, app name, versionName, versionCode)
   with its own string-pool rewriter (`exporter/AxmlPatcher.kt`), so no `aapt` on the phone;
3. adds the project as `assets/project.json`;
4. signs the APK (v2 + v3) with Google's `apksig` and a key created on the device.

The exported app runs the same Compose runtime (`runtime/`) as the editor's preview, so what you
see in the editor is what you get in the APK.

## Modules

| Module     | What                                                                 |
|------------|----------------------------------------------------------------------|
| `core`     | Project model, blocks, interpreter. Pure Kotlin, unit-tested.        |
| `exporter` | Manifest patcher, APK repack, self-signed key, apksig signing.       |
| `runtime`  | Compose renderer of a project, shared by the editor and exported apps |
| `player`   | Template APK every exported app is made from.                        |
| `app`      | The Orvena Create editor.                                            |

## Build

Needs JDK 17 and the Android SDK (compileSdk 35).

```bash
./gradlew :app:assembleDebug        # editor; builds the player template first
./gradlew :core:test :exporter:test # unit tests
```

CI (`.github/workflows/orvena-create.yml`) builds everything, exports the sample with the real
template, checks it with `apksigner`, `zipalign` and `aapt2`, then on an Android 14 emulator
installs the editor, makes it **export an APK on the device**, installs that APK and launches it.
The APKs are attached to each run as the `orvena-create-0.0.1` artifact.

## Known limits of the demo

- Signing key lives in the editor's storage: reinstalling Orvena Create creates a new key, and
  apps exported before can then only be reinstalled, not updated.
- CI debug builds are signed with a fresh debug key each run: uninstall the old editor first.
- Exported apps share the player's icon; no images, sounds, storage or network bricks yet.
- The free tier splash «Made with Orvena Create» is always on; Pro is not built yet.
