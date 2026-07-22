// Admin password reset: an operational escape hatch alongside the normal
// email recovery flow.
//
//   dev:  npm run reset-password [-- email]
//   prod: docker compose exec app node scripts/reset-password.mjs [email]
//
// Plain Node on purpose — no TypeScript tooling — so the same file runs from a
// dev checkout and inside the standalone production image (Dockerfile copies
// scripts/; `pg` ships in the pruned runtime node_modules). The email argument
// is optional only when exactly one account exists. Prints a freshly generated
// password; change it in Settings after logging in.

import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

/**
 * Must stay compatible with hashPassword/verifyPassword in src/lib/password.ts
 * (scrypt, stored as saltHex:hashHex). src/lib/password.test.ts imports this
 * and cross-verifies, so drift fails the test suite.
 */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** DATABASE_URL from the environment, .env (dev), or the compose dev default. */
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
  const emailArg = process.argv[2]?.toLowerCase().trim();
  const pool = new pg.Pool({ connectionString: databaseUrl() });
  try {
    const { rows: users } = await pool.query("select id, email from users");

    let user;
    if (emailArg) {
      user = users.find((u) => u.email === emailArg);
      if (!user) {
        console.error(`No account with email ${emailArg}.`);
        process.exitCode = 1;
        return;
      }
    } else if (users.length === 1) {
      user = users[0];
    } else if (users.length === 0) {
      console.error("No accounts exist yet — visit the app to create one.");
      process.exitCode = 1;
      return;
    } else {
      console.error("Multiple accounts — pass an email:");
      for (const u of users) console.error(`  ${u.email}`);
      console.error("\n  npm run reset-password -- <email>");
      process.exitCode = 1;
      return;
    }

    const password = randomBytes(9).toString("base64url");
    await pool.query(
      "update users set password_hash = $1, session_version = session_version + 1 where id = $2",
      [hashPassword(password), user.id],
    );

    console.log(`Password reset for ${user.email}.`);
    console.log(`\n  New password: ${password}\n`);
    console.log("Log in with it, then change it in Settings.");
  } finally {
    await pool.end();
  }
}

// Import-safe: the compat test imports hashPassword without running a reset.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Reset failed:", err.message ?? err);
    process.exitCode = 1;
  });
}
