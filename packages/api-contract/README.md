# @currentfold/api-contract

The versioned, platform-neutral contract for Currentfold's first-party API.

- `openapi.json` is the source of truth for public resources and errors.
- `fixtures/` contains stable examples that native clients can use in previews and tests.
- `npm run contract:check` validates the document and its required tracer-bullet routes.

The contract deliberately does not expose Drizzle records or reuse the Google Reader
wire format. Storage and compatibility adapters may change without changing `/api/v1`.
