# ADR 0002: Native account authentication and rotating device sessions

- **Status:** Accepted
- **Date:** 2026-07-22
- **Owners:** Currentfold product and engineering
- **Supersedes:** The browser authorization-code + PKCE choice in ADR 0001

## Context

Currentfold for iOS initially used a manually issued compatibility credential to prove
the first API and reader slice. That is acceptable for internal diagnostics, not a
product sign-in. A browser handoff with PKCE would protect the website password, but it
would also make a person leave a native welcome flow merely to sign into the same
Currentfold product. The product decision is that account access—including signup and
recovery—must feel native on iOS.

The web app already owns password hashing, verified-address enforcement, invitations,
registration policy, suspension, account deletion, rate limiting, recovery tokens, and
the `sessionVersion` emergency-revocation generation. Duplicating those policies in an
iOS-specific identity service would create two account systems.

## Decision

The Next.js service remains the account authority and exposes explicit, versioned
native-auth routes under `/api/v1/auth`. The iOS app submits the account password over
HTTPS only to the session-creation route. It never stores the password. Successful
authentication creates a named native device session and returns:

- an opaque access token valid for 15 minutes;
- a one-time rotating refresh token with a 30-day idle expiry;
- an absolute device-session expiry of one year.

Postgres stores SHA-256 hashes, never raw bearer secrets. Rotation consumes the previous
credential generation and issues exactly one replacement pair transactionally. API
authorization joins the token to an unrevoked device session and an active account with
the same `sessionVersion`. Password reset and administrative lifecycle changes therefore
invalidate native sessions through the same mechanism as browser sessions.

The iOS transport keeps the pair in this-device-only Keychain storage, performs a single
serialized refresh after a 401, retries the original request once, and clears local state
when refresh is rejected. Sign-out revokes the server-side session before clearing the
Keychain. Web account settings list and revoke native device sessions.

Registration, verification resend/consumption, recovery request/completion, and sign-out
use native JSON routes while preserving the existing anti-enumeration responses,
rate-limit buckets, email-token rules, and web fallbacks. Universal Links cover
verification and recovery when the Apple team/domain association is configured.

Apple and Google sign-in use their native/system authorization surfaces. The backend
verifies the provider identity token, resolves only a previously linked stable provider
subject (or creates a policy-permitted new account), and issues this same Currentfold
device session. Provider tokens never become API bearer credentials, and Currentfold
does not embed a provider client secret in the app. A matching email never silently
links identities. Apple proof is bound to a short-lived, one-time server challenge;
challenge creation and rejected provider proof are network-rate-limited.

## Consequences

- The login experience is fully Currentfold-native and does not depend on a pre-existing
  browser session.
- Password and provider policy remain centralized in one account lifecycle.
- Access tokens are short-lived without forcing frequent interactive login.
- Self-hosted operators must apply the native-session migration before using the app.
- Universal Links require the final domain, an Associated Domains entitlement, and the
  deployment's Apple Team ID; HTTPS pages remain the fallback.
- Native provider buttons are capability-driven and appear only when both the server and
  signed app build are configured for that provider.
- Apple account-deletion revocation remains an App Store productization requirement; it
  needs Apple's server credential and authorization-code exchange before distribution.
