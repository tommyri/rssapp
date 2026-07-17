import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  type AccountAuditEventType,
  type AccountAuditMetadata,
  accountAuditEvents,
  users,
} from "@/db/schema";

export interface AccountAuditEventInput {
  actorUserId?: number | null;
  targetUserId?: number | null;
  eventType: AccountAuditEventType;
  metadata?: AccountAuditMetadata;
}

export function accountAuditEventValues({
  actorUserId = null,
  targetUserId = null,
  eventType,
  metadata = {},
}: AccountAuditEventInput) {
  return { actorUserId, targetUserId, eventType, metadata };
}

export interface AccountAuditEvent {
  id: number;
  actorEmail: string;
  targetEmail: string | null;
  eventType: AccountAuditEventType;
  metadata: AccountAuditMetadata;
  createdAt: Date;
}

/** The owner console intentionally shows only a bounded recent operational history. */
export async function listAccountAuditEvents(
  limit = 50,
): Promise<AccountAuditEvent[]> {
  return db
    .select({
      id: accountAuditEvents.id,
      actorEmail: sql<string>`coalesce((select ${users.email} from ${users} where ${users.id} = ${accountAuditEvents.actorUserId}), 'System')`,
      targetEmail: sql<
        string | null
      >`(select ${users.email} from ${users} where ${users.id} = ${accountAuditEvents.targetUserId})`,
      eventType: accountAuditEvents.eventType,
      metadata: accountAuditEvents.metadata,
      createdAt: accountAuditEvents.createdAt,
    })
    .from(accountAuditEvents)
    .orderBy(desc(accountAuditEvents.createdAt))
    .limit(limit);
}

export function accountAuditEventDescription(event: AccountAuditEvent): string {
  const target = event.targetEmail ?? "an account";
  switch (event.eventType) {
    case "account_suspended":
      return `Suspended ${target}`;
    case "account_restored":
      return `Restored ${target}`;
    case "ownership_transferred":
      return `Transferred ownership to ${target}`;
    case "registration_mode_changed":
      return `Changed registration from ${event.metadata.previousRegistrationMode ?? "open"} to ${event.metadata.registrationMode ?? "open"}`;
    case "invitation_issued":
      return `Invited ${event.metadata.invitationEmail ?? "an email address"}`;
    case "invitation_revoked":
      return `Revoked the invitation for ${event.metadata.invitationEmail ?? "an email address"}`;
    case "invitation_delivery_failed":
      return `Could not deliver the invitation to ${event.metadata.invitationEmail ?? "an email address"}`;
  }
}
