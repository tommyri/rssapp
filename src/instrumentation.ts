// Next.js runs register() once when a server instance boots.
export async function register() {
  // Only in the Node.js server runtime — not Edge, and not during the build.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
