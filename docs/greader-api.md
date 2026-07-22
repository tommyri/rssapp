# Native reader sync API

Currentfold exposes a Google Reader-compatible sync adapter for native RSS readers.
It is an interoperability layer over the same subscriptions, folders, article
states, and labels used by the web reader; it does not create a separate copy
of a person's library.

## Connect an app

1. Open **Settings → Account → Native reader apps**.
2. Create an app password and copy it immediately. It is intentionally shown
   only once.
3. In a Google Reader-compatible client, use:
   - **Server address:** `https://your-rssapp.example/api/greader`
   - **Username:** the account email address
   - **Password:** the generated app password

The app authenticates with the legacy `accounts/ClientLogin` exchange, then
sends its app password using `Authorization: GoogleLogin auth=…`. Direct
integrations may instead send `Authorization: Bearer …`.

An app password is scoped to reader sync: it cannot open the web app, change an
email or password, administer accounts, or access another person's reader. It
can be revoked instantly from Settings, and the account page shows when it was
last used.

## Compatible data model

- Subscriptions and their one folder assignment are exposed as Google Reader
  subscriptions and categories.
- Folders and article labels share the legacy label namespace. If a folder and
  an article label have the same name, their stream is the union of both.
- Article IDs are stable, opaque Google Reader-style hexadecimal IDs.
- Read, starred, and article-label changes sync in both directions.
- Muting, offline copies, highlights, notes, reading progress, audio progress,
  rules, and account settings remain Currentfold-specific features. They are not
  translated into the legacy protocol.

## Endpoint coverage

The adapter implements the sync discovery flow (`user-info`, `subscription/list`,
`tag/list`, `unread-count`, preferences, and token), item streams and cursors,
item-content lookup, OPML export, feed add/edit/remove, mark-all-read, and
read/star/label mutations (`edit-tag`). Responses are deliberately `no-store`:
clients should own their local sync cache and revalidate it normally.

This is a compatibility boundary. Currentfold-owned clients use the versioned
first-party API rather than depend on the Google Reader wire format.
