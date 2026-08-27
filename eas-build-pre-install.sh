#!/usr/bin/env bash
set -euo pipefail

# EAS Build lifecycle hook, run automatically before install if this file
# exists and is executable (see PRODUCTION_SETUP.md, "Push notifications").
#
# Copies google-services.json into the native Android project, where the
# Google Services Gradle plugin (android/app/build.gradle) expects to find
# it - it is applied unconditionally there, so a missing file fails the
# build immediately.
#
# This step exists because android/ is committed to this repo (added for
# Stream Video's native calling integration), so Android is now a bare/
# native project as far as EAS Build is concerned: it builds the checked-in
# native project directly and does not run `expo prebuild`. That means the
# managed-workflow `googleServicesFile` setting in app.json/app.config.js -
# which only takes effect during a prebuild step - is not applied for
# Android here, even though it is still correct for how a purely managed
# build would work.
#
# Requires an EAS project environment variable named GOOGLE_SERVICES_JSON
# of type "file", created from the real google-services.json (never commit
# that file - it stays out of git via .gitignore). At build time EAS
# resolves it to a local temp file path and exposes that path in
# $GOOGLE_SERVICES_JSON.
if [ -n "${GOOGLE_SERVICES_JSON:-}" ] && [ -f "$GOOGLE_SERVICES_JSON" ]; then
  echo "Copying google-services.json into android/app/"
  cp "$GOOGLE_SERVICES_JSON" android/app/google-services.json
else
  echo "GOOGLE_SERVICES_JSON is not set, or does not point to a real file." >&2
  echo "Stopping before dependency installation because Android cannot compile without Firebase configuration." >&2
  exit 1
fi
