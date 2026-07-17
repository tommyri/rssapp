// Explicit account-operator transfer for a self-hosted deployment.
//
//   dev:  npm run set-owner -- person@example.com
//   prod: docker compose exec app node scripts/set-owner.mjs person@example.com
//
// Multiple historic accounts do not reveal who operates the deployment. This
// command makes that security-sensitive choice explicit, transactionally moves
// ownership, and revokes sessions for the old and new owners.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const match = readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split("\n")
      .find((line) => line.startsWith("DATABASE_URL="));
    if (match) return match.slice("DATABASE_URL=".length).trim();
  } catch {
    // No .env — fall through to the dev default (src/db/config.ts).
  }
  return "postgres://rssapp:rssapp@localhost:5433/rssapp";
}

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) {
    console.error("Pass the account email: npm run set-owner -- <email>");
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl() });
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Keep CLI and in-app ownership changes in one serialized handover lane.
    await client.query("select pg_advisory_xact_lock(795509)");
    const { rows } = await client.query(
      "select id, email, status, email_verified_at from users where email = $1 for update",
      [email],
    );
    const user = rows[0];
    if (!user) throw new Error(`No account with email ${email}.`);
    if (user.status !== "active" || !user.email_verified_at) {
      throw new Error(
        "The new owner must be active and have a verified email.",
      );
    }

    await client.query(
      "update users set role = 'member', session_version = session_version + 1 where role = 'owner'",
    );
    await client.query(
      "update users set role = 'owner', session_version = session_version + 1 where id = $1",
      [user.id],
    );
    await client.query(
      "insert into account_audit_events (actor_user_id, target_user_id, event_type, metadata) values (null, $1, 'ownership_transferred', '{}'::jsonb)",
      [user.id],
    );
    await client.query("commit");
    console.log(`Ownership transferred to ${user.email}.`);
    console.log("All affected sessions were signed out.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Owner transfer failed:", error.message ?? error);
    process.exitCode = 1;
  });
}
