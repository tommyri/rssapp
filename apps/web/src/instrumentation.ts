// Next.js runs register() once when a server instance boots, in every runtime.
export async function register() {
  // Only in the Node.js server runtime — not Edge, and not during the build.
  // The actual startup work lives in a separate module so its Node-only APIs
  // are never compiled for the Edge runtime (see instrumentation-node.ts).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { registerNode } = await import("./instrumentation-node");
  await registerNode();
}
