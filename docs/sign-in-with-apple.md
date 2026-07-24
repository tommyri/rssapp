# Sign in with Apple production readiness

**Status:** deferred and disabled. Resume after the Apple Developer Program membership,
membership identity, and final Currentfold domain decisions are complete.

Currentfold must not advertise Sign in with Apple in production yet. Keep
`APPLE_NATIVE_CLIENT_ID` and `APPLE_TEAM_ID` absent or empty until this checklist is
complete; the capability-driven iOS UI then keeps the Apple button hidden.

## Decisions already made

- The first implementation is native iOS authentication, not Sign in with Apple on the
  web.
- The explicit app identifier is `no.currentfold.reader`.
- Apple proves identity, while Currentfold remains the account authority and issues its
  own rotating device session.
- Provider identities are keyed by Apple's stable subject. A matching email address
  never silently links two accounts.
- The final associated domain should be the permanent Currentfold origin rather than a
  temporary hostname if the domain cutover is close enough to avoid duplicate work.

## What already exists

- The native Apple authorization sheet and checked-in Sign in with Apple entitlement.
- A short-lived, single-use server nonce bound to Apple's identity token.
- Server verification of Apple's signature, issuer, audience, expiry, verified-email
  claim, subject, and nonce.
- Exchange of a verified Apple identity for the normal Currentfold device session.
- Capability discovery that hides Apple when the server is not configured.
- An Associated Domains entitlement and a dynamic Apple App Site Association endpoint
  for verification, recovery, and invitation links.
- Compose forwarding for `APPLE_NATIVE_CLIENT_ID` and `APPLE_TEAM_ID`, protected by a
  rendered-configuration CI check.

This is a sound authentication foundation, but it is not the complete Apple credential
lifecycle required for production distribution.

## External prerequisites

- [ ] Purchase an active [Apple Developer Program
  membership](https://developer.apple.com/programs/enroll/). Apple currently lists the
  membership at 99 USD per year or the local-currency equivalent.
- [ ] Decide whether to enroll as an individual or an organization **before** registering
  the production App ID. An individual account displays the owner's legal name as the
  App Store seller. An organization displays its verified legal-entity name and requires
  a D-U-N-S number, company-domain email, and public website.
- [ ] Settle the permanent Currentfold web domain and transactional-email sending
  domain, or explicitly accept configuring the temporary domain and changing it later.

## Apple account and signing

- [ ] Register the explicit App ID `no.currentfold.reader` in Certificates, Identifiers
  & Profiles.
- [ ] Enable **Sign in with Apple** and configure the App ID as the primary App ID.
- [ ] Enable **Associated Domains** for the same App ID.
- [ ] Select the paid development team for the Currentfold Xcode target and use automatic
  signing or regenerate the required development and distribution profiles.
- [ ] Confirm the signed app contains `com.apple.developer.applesignin` and the expected
  `applinks:<currentfold-domain>` entitlement.
- [ ] Create the server-side Sign in with Apple key needed for token exchange and
  revocation. Store its private key only in protected production secret storage, never
  in the iOS app, repository, image, or ordinary environment example.

## Server and account lifecycle work

- [ ] Send Apple's authorization code from the iOS credential to Currentfold in addition
  to the identity token.
- [ ] Exchange the one-time authorization code with Apple, validate the response, and
  securely retain the refresh credential required for later revocation.
- [ ] Add narrowly scoped server configuration for the Apple Team ID, key ID, client ID,
  and private signing key, with key rotation and incident-revocation instructions.
- [ ] Revoke the Apple token through Apple's REST API when a person deletes their
  Currentfold account, then remove the retained Apple credential with the rest of the
  account data. Apple explicitly requires token revocation for apps using Sign in with
  Apple; see [Apple's account-deletion
  guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
  and [TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple).
- [ ] Add the native account-deletion entry point and handle Apple credential-revoked or
  not-found state by returning the app to signed-out state.
- [ ] Decide whether to implement Apple's optional server-to-server account-change
  notification endpoint before external testing.

## Email relay and deployment

- [ ] Register every Currentfold/Resend outbound sender domain or address with Apple's
  [Private Email Relay](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service),
  and verify its SPF/DKIM alignment so verification, recovery, invitation, and digest
  email reaches people who choose **Hide My Email**.
- [ ] Set the signed build's `CURRENTFOLD_ASSOCIATED_DOMAIN` to the canonical hostname,
  regenerate the Xcode project, and keep it aligned with the server's `APP_URL`.
- [ ] Add `APPLE_NATIVE_CLIENT_ID=no.currentfold.reader` and the 10-character
  `APPLE_TEAM_ID` to the protected production environment, then redeploy.
- [ ] Verify `/.well-known/apple-app-site-association` returns the correct Team ID and
  bundle ID without a redirect.
- [ ] Verify `/api/v1/auth/providers` reports Apple only after every production
  prerequisite is active.

## Release validation

- [ ] Exercise first-time registration and returning sign-in on a signed physical-device
  build.
- [ ] Test both shared-email and **Hide My Email** accounts, including delivery of every
  transactional email type.
- [ ] Test cancellation, invalid/replayed nonce rejection, invitation-only and closed
  registration policies, suspended accounts, and email collisions with an existing
  Currentfold account.
- [ ] Test Universal Links with the app installed and the HTTPS fallback with it absent.
- [ ] Test Currentfold account deletion end to end and confirm Apple's credential is
  revoked.
- [ ] Test a credential revoked from Apple Account settings and confirm Currentfold
  returns to an unauthenticated state cleanly.
- [ ] Distribute a signed TestFlight build and complete device, accessibility, privacy,
  and App Review readiness checks before calling the provider production-ready.

## Completion condition

Sign in with Apple is ready to enable only when the paid membership and App ID are
active, the permanent domain and email relay are configured, the authorization-code and
revocation lifecycle is implemented, the signed app and server agree on identifiers,
and the release-validation checklist passes. Merely setting the two existing environment
variables is not sufficient.
