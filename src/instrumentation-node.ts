// Node.js-only server startup: env checks, DB migrations, and the poll
// scheduler. Kept out of instrumentation.ts so its Node APIs (e.g.
// process.exit) are never compiled for the Edge runtime, which doesn't
// support them. Only imported when NEXT_RUNTIME === "nodejs".
export async function registerNode() {
  const isProd = process.env.NODE_ENV === "production";

  // Refuse to serve production traffic with the insecure dev auth secret.
  // Next.js swallows errors thrown here (they surface as unhandled rejections
  // while the server keeps serving), so a hard exit is the only real refusal.
  if (isProd && !process.env.AUTH_SECRET) {
    console.error(
      "[boot] AUTH_SECRET is not set. Generate one with `npx auth secret` and set it in the environment (.env next to compose.yaml). Refusing to start.",
    );
    process.exit(1);
  }

  // Migrate before anything touches the database; fail loudly if we can't.
  const { runMigrations } = await import("@/db/migrate");
  try {
    await runMigrations();
    console.log("[boot] migrations up to date");
  } catch (err) {
    console.error("[boot] migrations failed:", err);
    if (isProd) process.exit(1);
    throw err;
  }

  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
