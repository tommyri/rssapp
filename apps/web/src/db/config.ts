// Local-dev fallback matches compose.yaml; set DATABASE_URL to override.
export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://currentfold:currentfold@localhost:5433/currentfold";
