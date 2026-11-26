# Orvena Create

**Orvena Create** by **Orvena Digital** is a phone app for building Android apps out of bricks:
put the UI together from parts (screens, buttons, text, inputs, cards…), snap logic blocks onto
it, and export a **real, installable APK right on the phone**, offline, with no computer.

Version **0.0.2** — demo with 2D games.

## What it can do

- **Designer.** A live preview of the screen and a brick tree: column, row, card, text, button,
  text input, checkbox, picture, **game stage**, divider, spacer. Bricks nest inside containers.
- **Game stage.** Sprites with costumes, layers and clones; **physics** (gravity, falling bodies,
  static supports, bounce, friction, collisions, solid edges); taps, touching, speech bubbles.
- **Pictures.** Draw your own in the paint editor, pick ready-made emoji or shapes, or import a photo.
- **Blocks in compartments**, with a search line: Events, Control, Motion, Looks, Physics, Sound,
  Interface, Sensing, Operators, Variables (and lists). Every sprite and every screen has its own scripts.
- **Scripts run in parallel**, like in Scratch: wait, forever, repeat until, wait until, stop.
  «Отправить всем» starts every «когда я получу» script — in the screen and in every sprite —
  and «отправить всем и ждать» waits until they finish.
- **Text input**: «спросить … и ждать» shows a field, the answer goes to «ответ». Sensors: finger, phone
  tilt, timer, date and time. Notes and vibration.
- **Several screens**, instant **run** in the editor, **APK export** on the device.
- Samples: «Счётчик» (an app) and «Прыгай!» (a platformer).

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
| `core`     | Project model, blocks, parallel engine, physics. Pure Kotlin, tested. |
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
The APKs are attached to each run as the `orvena-create-0.0.2` artifact.

## Known limits of the demo

- Signing key lives in the editor's storage: reinstalling Orvena Create creates a new key, and
  apps exported before can then only be reinstalled, not updated.
- CI debug builds are signed with a fresh debug key each run: uninstall the old editor first.
- Exported apps share the player's icon; no storage or network bricks yet; sounds are simple tones.
- The free tier splash «Made with Orvena Create» is always on; Pro is not built yet.
