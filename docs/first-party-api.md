# Currentfold first-party API

The versioned JSON API at `/api/v1` is the product boundary for Currentfold-owned
clients. It is separate from `/api/greader`: the Google Reader adapter exists for
third-party compatibility, while this API can grow with Currentfold features without
inventing legacy tags for them.

## Initial stable slice

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1` | Discover the product/API version, capabilities, and contract URL. |
| `GET` | `/api/v1/openapi.json` | Download the OpenAPI 3.1 contract. |
| `POST` | `/api/v1/auth/session` | Authenticate an account and create a native device session. |
| `DELETE` | `/api/v1/auth/session` | Revoke the current native device session. |
| `POST` | `/api/v1/auth/session/refresh` | Rotate a native refresh token and access token. |
| `GET` | `/api/v1/auth/providers` | Discover Apple/Google availability for this installation. |
| `POST` | `/api/v1/auth/providers/apple/challenge` | Create a rate-limited, one-time Apple nonce. |
| `POST` | `/api/v1/auth/provider-session` | Verify native Apple/Google proof and create a device session. |
| `POST` | `/api/v1/auth/registration` | Register and send an address-verification link. |
| `POST`, `PATCH` | `/api/v1/auth/verification` | Resend or consume an address-verification token. |
| `POST`, `PATCH` | `/api/v1/auth/recovery` | Request or complete a password reset. |
| `GET` | `/api/v1/me` | Resolve the authenticated account. |
| `GET` | `/api/v1/subscriptions` | List followed sources, folders, unread counts, and paused state. |
| `GET` | `/api/v1/articles` | Read a newest-first, keyset-paginated article stream. |
| `PATCH` | `/api/v1/articles/read-state` | Idempotently mark up to 100 owned articles read or unread. |

Resource IDs are decimal strings on the wire. They are opaque client identifiers, not a
promise that storage will always use an integer. Cursors are also opaque: clients store
and return `nextCursor` unchanged rather than constructing or interpreting it.

The source contract and stable response fixtures live in `packages/api-contract`. Run
`npm run contract:check` after changing it. The route implementation lives in
`apps/web/src/app/api/v1`, with parsing, authentication, response, and reader-query
boundaries in `apps/web/src/lib/api-v1*`.

## Authentication

Currentfold-owned native apps use a first-party device session:

- sign-in returns a 15-minute opaque access token and a rotating refresh token;
- refresh tokens expire after 30 days without use and cannot outlive the device
  session's one-year absolute bound;
- only SHA-256 token hashes are stored in Postgres;
- every rotation consumes the prior access/refresh generation in one transaction;
- a password reset, account suspension, account deletion, web revocation, or native
  sign-out invalidates authorization server-side;
- the iOS client stores the credential pair in this-device-only Keychain storage and
  serializes refreshes so concurrent API calls cannot race a one-time token;
- active Currentfold app sessions appear under **Settings → Account → Signed-in
  sessions**, alongside browser sessions, and can be revoked there.

Apple and Google use the platform/system authorization surfaces. The client sends the
resulting identity token to `/api/v1/auth/provider-session`; the server verifies its
signature and claims and then issues the normal Currentfold device session. Apple's
flow additionally binds the identity token to a short-lived one-time server nonce.
Provider tokens are never accepted as reader API bearer credentials. Provider subjects,
not matching email addresses, select linked accounts; an address collision requires an
explicit account link rather than an automatic merge.

Manually issued compatibility credentials are still useful for third-party clients and
command-line diagnostics:

1. Open **Settings → Account → Native reader apps**.
2. Create a credential and copy it when shown.
3. Send it in the bearer header:

```bash
curl \
  -H "Authorization: Bearer $CURRENTFOLD_API_TOKEN" \
  https://your-currentfold.example/api/v1/me
```

The Currentfold iOS app does not use or display this compatibility credential. Native
email verification and reset endpoints can consume the same one-time account tokens as
the web fallback. HTTPS links open the app when Universal Links are configured through
`APPLE_TEAM_ID`; otherwise the existing web pages remain usable.

## Contract rules

- New response fields may be added within v1; existing fields do not silently change
  meaning or type.
- Breaking resource changes require a new API version.
- Every authenticated query is scoped through the account's subscriptions; global feed
  storage is never exposed directly.
- Mutations validate the complete batch before writing, so a foreign or unavailable
  article cannot produce a partial update.
- API responses containing account data use `Cache-Control: no-store` and return JSON
  errors instead of redirects to the web sign-in page.
- Database and Drizzle schemas are implementation details and do not generate the public
  contract.

## Next slices

Add complete user workflows rather than isolated fields: Read Later and saved pages,
article detail and highlights/notes, reading and audio progress, labels, notifications,
and settings. Provider account-management work before App Store distribution includes
Apple authorization revocation during account deletion and native guidance for linking
an email-colliding provider identity.
