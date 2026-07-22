import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getBuildIdentity } from "@/lib/build-identity";

// A readiness probe must exercise Postgres as well as the HTTP server. It is
// intentionally public: reverse proxies and Docker call it before serving the
// app, and it returns no account or operational detail.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export async function GET() {
  const identity = getBuildIdentity();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", ...identity }, { headers });
  } catch {
    return Response.json(
      { status: "unavailable", ...identity },
      { headers, status: 503 },
    );
  }
}
