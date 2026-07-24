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

## Native authentication

The app uses the configured Currentfold service and presents native email/password,
Sign in with Apple, and Google sign-in alongside registration, verification, recovery,
password reset, and sign-out. Provider credentials are verified by the Currentfold
server and immediately exchanged for the same Currentfold-owned device session as a
password login. A 15-minute access token and rotating refresh token are stored together
in Keychain with this-device-only protection. The transport refreshes once after an
authorization challenge, serializes concurrent rotations, and returns to sign-in when a
device session is expired or revoked. It never asks for a manually created app
credential.

The iOS client and web service must be deployed from a compatible product version.
Before testing account access, verify that the deployed `GET /api/v1` response includes
the `nativeAuthentication` capability. An older deployment redirects the native routes
to the web login page; the app reports that state as a required Currentfold update
instead of presenting it as malformed account data.

`CURRENTFOLD_SERVER_URL` and `CURRENTFOLD_ASSOCIATED_DOMAIN` are build settings in
`project.yml`; change them together for another environment and regenerate the Xcode
project. They are release/deployment configuration, not user settings: a Currentfold
build connects to its assigned environment and never asks the reader to choose or enter
a service URL. Production email links become native Universal Links when the server has its
10-character `APPLE_TEAM_ID` configured and the signed app includes the Associated
Domains entitlement. The same HTTPS pages remain the fallback when the app is absent.

### Apple provider setup

Production activation is deliberately deferred until a paid Apple Developer Program
membership and the permanent Currentfold domain are ready. Do not enable the provider
only by setting its environment variables: authorization-code exchange, deletion-time
Apple token revocation, Private Email Relay, signed-device testing, and distribution
setup must also be completed. The source-of-truth checklist is
[`docs/sign-in-with-apple.md`](../../docs/sign-in-with-apple.md).

1. Enable **Sign in with Apple** and **Associated Domains** for the
   `no.currentfold.reader` App ID in the Apple Developer portal.
2. Set `APPLE_NATIVE_CLIENT_ID=no.currentfold.reader` and `APPLE_TEAM_ID=<10-character
   team ID>` in the server environment, then redeploy it.
3. Sign the iOS target with that App ID. The checked-in entitlement requests Sign in
   with Apple and the associated domain from `CURRENTFOLD_ASSOCIATED_DOMAIN`.

The app obtains a short-lived, one-time nonce from Currentfold before opening Apple's
system sheet. The server validates the identity-token signature, issuer, audience,
expiry, verified email, and hashed nonce before resolving the stable Apple subject.

### Google provider setup

Google uses two public OAuth client IDs; no client secret belongs in the iOS app:

1. Keep the existing Google **Web application** client ID in server
   `AUTH_GOOGLE_ID`. This is the server audience for the iOS identity token.
2. Create a Google **iOS** OAuth client for bundle ID `no.currentfold.reader`.
3. Put its client ID and reversed client ID, plus the Web client ID, into the public
   Xcode build settings in `project.yml` (or supply them as build overrides):

   ```yaml
   CURRENTFOLD_GOOGLE_CLIENT_ID: <iOS client ID>
   CURRENTFOLD_GOOGLE_REVERSED_CLIENT_ID: <reversed iOS client ID>
   CURRENTFOLD_GOOGLE_SERVER_CLIENT_ID: <same value as AUTH_GOOGLE_ID>
   ```

4. Run `npm run ios:generate`. Google remains absent from the native welcome screen
   unless the server advertises it and all three build settings are present.

Provider identity is keyed by Apple's or Google's stable subject, never just by email.
If a provider returns the address of an existing account that is not already linked,
Currentfold refuses to merge it; sign in with the existing method first and link the
provider from account settings.

## Project boundaries

- `App/` owns root composition, tabs, theme injection, and product identity.
- `Core/API/` owns contract models and the closure-based HTTP client.
- `Core/Security/` owns Keychain access.
- `Features/` owns authentication, reader, source, and settings UI.
- `Preview/` owns deterministic offline preview fixtures.

The app does not share React components or database types. Article HTML is the one web
format it renders, inside a script-disabled `WKWebView`; navigation, lists, settings,
state, and accessibility remain native SwiftUI.
