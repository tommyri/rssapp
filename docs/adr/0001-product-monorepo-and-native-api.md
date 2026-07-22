# ADR 0001: Product monorepo and first-party native API

- **Status:** accepted
- **Date:** 2026-07-22
- **Owners:** Currentfold product and engineering

## Context

Currentfold is becoming a multi-surface product. The existing repository contains one
Next.js deployable that serves the browser reader, route handlers, authentication,
scheduled feed/content work, and the Google Reader-compatible API. A native iOS reader
is planned. The approved identity also needs one durable source for logo geometry,
semantic design tokens, typography records, and platform exports.

Separate repositories would force coordinated brand and API changes through releases
before there are separate teams or access boundaries. Conversely, trying to share React
components or database types with Swift would couple two platforms at the wrong level.

The Google Reader adapter proves the core stream and state operations and remains useful
for third-party clients. It does not model the complete Currentfold product: saved-page
extraction, highlights and notes, labels, rules and notifications, reading and audio
progress, offline mutations, or account settings.

## Decision

Use one Git repository with independently built applications and platform-neutral shared
packages:

```text
currentfold/
├── apps/
│   ├── web/                 Next.js UI, HTTP API, scheduler, and database access
│   └── ios/                 Native SwiftUI application
├── packages/
│   ├── brand/               Identity masters, tokens, and platform exports
│   └── api-contract/        First-party OpenAPI contract and shared fixtures
├── infra/                   Container, Compose, VPS, and edge configuration
├── docs/                    Product, design, architecture, and operations
└── .github/workflows/       Path-scoped web, iOS, and release workflows
```

The applications are separate deployables, not separate repositories. The web/server
application remains one Next.js service until independent API or worker scaling creates a
measurable reason to split it.

### Shared brand foundations

`packages/brand` owns:

- source SVG marks, wordmarks, and application icons;
- a platform-neutral semantic token file following the Design Tokens Community Group
  structure;
- typography and licence records;
- generated web CSS/assets; and
- an iOS-local Swift package with Swift tokens and bundled asset-catalog resources.

Generated outputs must be reproducible and checked for drift in CI. Web React components
and native SwiftUI components remain platform-owned. They share semantic roles and UX
principles, not component source or arbitrary pixel values.

### API boundary

Add a versioned first-party JSON API under `/api/v1`. Its OpenAPI document is the contract
for generated Swift request/response types, API examples, and conformance tests.

The API calls the same reader-domain operations as the web actions and compatibility
adapter:

```text
browser UI ───────────────┐
first-party /api/v1 ─────┼──> reader domain operations ──> PostgreSQL
Google Reader adapter ───┘
```

Do not generate the public contract from the Drizzle schema or expose database records
directly. API resources need stable opaque semantics, explicit cursors, idempotent
mutations, and additive versioning independent of storage refactors.

The initial vertical slice covers service metadata, the authenticated account,
subscriptions, an article stream with a continuation cursor, and batched read-state
updates. Later slices add Read Later, highlights/notes, progress, labels, notifications,
and settings as complete workflows.

### Native authentication

The production iOS client will use browser-based authorization with an authorization
code and PKCE, returning to the application through an associated callback. Tokens are
revocable, scoped to the first-party API, short-lived where practical, and stored in the
Keychain. The application never embeds a client secret and does not collect the website
password inside a native imitation of the sign-in form.

Google Reader app passwords remain for compatibility clients. They are not the permanent
first-party iOS authentication mechanism.

### Builds and releases

- Web and iOS workflows use path filters and independent caches.
- A shared-package change runs every consuming application's verification.
- Main-branch web images remain immutable SHA-addressed artifacts.
- Product calendar versions can describe a coordinated release without forcing web and
  App Store delivery to happen in the same job.
- iOS keeps its required monotonically increasing build number independently of the
  product version.

No Nx, Turborepo, or other orchestration layer is introduced initially. npm workspaces,
Xcode/Swift Package Manager, root scripts, and path-scoped GitHub Actions are sufficient.

## Consequences

### Benefits

- Brand and API changes can update both clients atomically.
- A single roadmap, review history, and issue tracker describes the product.
- Each platform retains native UI, accessibility, navigation, and offline behaviour.
- The existing server architecture and deployment model remain understandable.
- Shared contracts are explicit rather than inferred from TypeScript internals.

### Costs

- Docker and Next.js output tracing must account for the monorepo root.
- CI must avoid running expensive Xcode work for unrelated web-only changes.
- Generated token/client output needs drift checks.
- Repository-level releases need to state which product surfaces changed.

## Rejected alternatives

### One repository per application and shared package

Rejected for now. It creates cross-repository version coordination and duplicated release
administration before independent teams or permissions justify the cost.

### One cross-platform component library

Rejected. React and SwiftUI need native component implementations. Sharing foundations
and behaviour contracts produces coherence without flattening platform conventions.

### Use the Google Reader protocol as the first-party API

Rejected as the permanent architecture. It remains a supported compatibility adapter and
may help with prototypes, but extending legacy tags to represent every Currentfold
workflow would make both the protocol and product harder to evolve.

### Split the backend into a separate service now

Rejected. The existing Next.js service, scheduler, and PostgreSQL deployment are one
coherent operational unit. A split becomes appropriate only when scaling, availability,
or team ownership requires independent deployment.

## Implementation order

1. Preserve the approved identity in a standalone commit.
2. Move the existing application to `apps/web` with no behaviour change and validate its
   standalone Docker output.
3. Move brand masters to `packages/brand`; generate web output and establish the local
   iOS resource package.
4. Add `packages/api-contract` and the first `/api/v1` tracer-bullet implementation.
5. Create the SwiftUI shell and consume the local brand package and generated API client.
6. Grow the API and native client one end-to-end reader workflow at a time.
