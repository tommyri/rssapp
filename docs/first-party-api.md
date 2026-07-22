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

## Development authentication

The initial iOS tracer bullet can use an existing revocable app credential so API and UI
work can be exercised before the authorization-code flow is ready:

1. Open **Settings → Account → Native reader apps**.
2. Create a credential and copy it when shown.
3. Send it in the bearer header:

```bash
curl \
  -H "Authorization: Bearer $CURRENTFOLD_API_TOKEN" \
  https://your-currentfold.example/api/v1/me
```

This is a development bridge, not the final iOS sign-in UX. The production native app
will open Currentfold in an authenticated browser session, use an authorization code
with PKCE, store the resulting revocable token in Keychain, and never collect the web
password or embed a client secret. Google Reader app passwords remain supported for
third-party clients independently of that flow.

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
and settings. OAuth authorization-code + PKCE must land before external iOS testing.
