# Currentfold for iOS

The native SwiftUI application targets iOS 17 and later. It uses platform-native
navigation and controls, consumes the local `CurrentfoldBrand` Swift package, and talks
only to the versioned `/api/v1` contract.

## Generate and build

The checked-in Xcode project is generated from `project.yml` with XcodeGen 2.46 or later:

```bash
xcodegen generate --spec apps/ios/project.yml
xcodebuild \
  -project apps/ios/Currentfold.xcodeproj \
  -scheme Currentfold \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Run `apps/ios/scripts/test.sh` to choose an available iPhone simulator and execute unit
tests. The tests decode the response fixture directly from `packages/api-contract`, so a
contract/client mismatch is caught without a live server.

## Current authentication boundary

The first internal build accepts a server address and a revocable app credential from
the web settings page. The token is stored in Keychain with this-device-only protection;
the server address is stored in UserDefaults. This exists only to exercise the first API
vertical slice. External testing requires the browser authorization-code + PKCE flow
documented in `docs/first-party-api.md` and ADR 0001.

## Project boundaries

- `App/` owns root composition, tabs, theme injection, and product identity.
- `Core/API/` owns contract models and the closure-based HTTP client.
- `Core/Security/` owns Keychain access.
- `Features/` owns connection, reader, source, and settings UI.
- `Preview/` owns deterministic offline preview fixtures.

The app does not share React components or database types. Article HTML is the one web
format it renders, inside a script-disabled `WKWebView`; navigation, lists, settings,
state, and accessibility remain native SwiftUI.
