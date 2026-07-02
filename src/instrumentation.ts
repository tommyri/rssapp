// Next.js runs register() once when a server instance boots.
export async function register() {
  // Only in the Node.js server runtime — not Edge, and not during the build.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

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
