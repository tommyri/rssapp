# @currentfold/brand

Currentfold's platform-neutral identity source package.

- `assets/` contains the approved editable SVG masters.
- `tokens.json` contains the portable brand foundations in the Design Tokens Community
  Group 2025.10 format.
- `dist/currentfold.css` is the generated web token output.
- `ios/` is a local Swift package with generated Swift tokens and bundled vector assets,
  plus the generated app-target icon catalog.

Web, iOS, email, and marketing surfaces should generate their platform-specific assets
from this package. Do not maintain independent logo geometry or hard-coded brand colours
inside an application.

Run `npm run brand:generate` after changing tokens or source art. CI runs
`npm run brand:check` to prevent generated platform output from drifting.

Product usage rules, voice, accessibility requirements, and asset guidance live in
[`docs/brand-identity.md`](../../docs/brand-identity.md).
