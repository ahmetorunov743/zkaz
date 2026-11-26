#!/usr/bin/env bash
# Smoke test on an emulator:
#   1. install the editor and the CI-exported sample, launch both
#   2. ask the editor to export an APK ON THE DEVICE (debug self-test), pull it, install it, launch it
# Fails on any crash. Screenshots go to ./shots.
set -euo pipefail
APKS="${1:-apks}"
EDITOR=com.orvenadigital.create
mkdir -p shots

shot() { adb exec-out screencap -p > "shots/$1.png" || true; }

alive() {
  local pkg="$1"
  if adb shell pidof "$pkg" > /dev/null; then
    echo "OK: $pkg is running"
  else
    echo "FAIL: $pkg is not running"
    adb logcat -d -b crash || true
    exit 1
  fi
}

adb logcat -c || true
adb install -r "$APKS/OrvenaCreate-0.0.1-demo.apk"
adb install -r "$APKS/exported-counter.apk"

echo "--- exported sample (built on CI) ---"
adb shell am start -W -n com.orvenacreate.smoke.counter/com.orvenadigital.create.player.PlayerActivity
sleep 2; shot exported-splash
sleep 4; shot exported-counter
alive com.orvenacreate.smoke.counter

echo "--- editor ---"
adb shell am start -W -n "$EDITOR/.MainActivity"
sleep 6; shot editor-projects
alive "$EDITOR"

echo "--- on-device export self-test ---"
adb shell am force-stop "$EDITOR"
adb logcat -c || true
adb shell am start -W -n "$EDITOR/.MainActivity" --ez orvena.selftest true
for i in $(seq 1 60); do
  if adb logcat -d -s OrvenaSelfTest | grep "ORVENA_SELFTEST_" > /dev/null; then break; fi
  sleep 2
done
adb logcat -d -s OrvenaSelfTest
adb logcat -d -s OrvenaSelfTest | grep ORVENA_SELFTEST_OK > /dev/null
adb exec-out run-as "$EDITOR" cat files/selftest.apk > selftest.apk
ls -la selftest.apk
adb install -r selftest.apk
adb shell am start -W -n com.orvenacreate.selftest/com.orvenadigital.create.player.PlayerActivity
sleep 6; shot selftest-app
alive com.orvenacreate.selftest

if adb logcat -d -b crash | grep "FATAL EXCEPTION" > /dev/null; then
  echo "FAIL: crash found"
  adb logcat -d -b crash
  exit 1
fi
echo "ALL SMOKE TESTS PASSED"
