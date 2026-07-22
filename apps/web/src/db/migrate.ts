import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index";

/**
 * Apply pending migrations from ./drizzle (relative to cwd — apps/web in dev
 * and /app/apps/web in the Docker image). Idempotent; runs at server boot so a
 * deploy is just "start the new image".
 */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle" });
}
