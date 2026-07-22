#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
runtime_id="$(xcrun simctl list runtimes available | awk '/^iOS /{runtime = $NF} END{print runtime}')"

if [[ -z "$runtime_id" ]]; then
  echo "No available iOS simulator runtime was found." >&2
  exit 1
fi

runtime_version="${runtime_id##*.iOS-}"
runtime_version="${runtime_version//-/.}"
device_id="$(
  xcrun simctl list devices available | awk -F '[()]' -v heading="-- iOS $runtime_version --" '
    $0 == heading { matching_runtime = 1; next }
    /^-- / { matching_runtime = 0 }
    matching_runtime && /iPhone/ { print $2; exit }
  '
)"

if [[ -z "$device_id" ]]; then
  echo "No available iPhone simulator was found." >&2
  exit 1
fi

xcrun simctl boot "$device_id" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$device_id" -b
xcrun simctl terminate "$device_id" no.currentfold.reader >/dev/null 2>&1 || true

xcodebuild \
  -project "$project_dir/Currentfold.xcodeproj" \
  -scheme Currentfold \
  -destination "platform=iOS Simulator,id=$device_id" \
  -derivedDataPath "$project_dir/.derived-data" \
  CODE_SIGNING_ALLOWED=NO \
  -quiet \
  test
