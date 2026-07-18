import { sql } from "drizzle-orm";
import { db } from "@/db";

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
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      { status: "ok", version: process.env.RSSAPP_VERSION ?? "development" },
      { headers },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { headers, status: 503 });
  }
}
