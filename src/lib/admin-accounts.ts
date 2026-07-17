import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  type AccountRole,
  type AccountStatus,
  subscriptions,
  users,
} from "@/db/schema";

export interface ManagedAccount {
  id: number;
  email: string;
  displayName: string | null;
  role: AccountRole;
  status: AccountStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  lastSignedInAt: Date | null;
  subscriptionCount: number;
}

/** Account data the deployment owner needs for routine support, never passwords. */
export async function listManagedAccounts(): Promise<ManagedAccount[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      lastSignedInAt: users.lastSignedInAt,
      subscriptionCount: sql<number>`cast(count(${subscriptions.id}) as int)`,
    })
    .from(users)
    .leftJoin(subscriptions, sql`${subscriptions.userId} = ${users.id}`)
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));
}
