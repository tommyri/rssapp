import { describe, expect, it } from "vitest";
import {
  accountAuditEventDescription,
  accountAuditEventValues,
} from "./account-audit";

describe("account audit events", () => {
  it("preserves the actor and target separately from readable event metadata", () => {
    expect(
      accountAuditEventValues({
        actorUserId: 4,
        targetUserId: 8,
        eventType: "account_suspended",
      }),
    ).toEqual({
      actorUserId: 4,
      targetUserId: 8,
      eventType: "account_suspended",
      metadata: {},
    });
  });

  it("renders a clear, bounded audit summary", () => {
    expect(
      accountAuditEventDescription({
        id: 1,
        actorEmail: "owner@example.com",
        targetEmail: null,
        eventType: "registration_mode_changed",
        metadata: {
          previousRegistrationMode: "open",
          registrationMode: "invite_only",
        },
        createdAt: new Date(),
      }),
    ).toBe("Changed registration from open to invite_only");
  });

  it("uses a generic description after the deleted account's data is removed", () => {
    expect(
      accountAuditEventDescription({
        id: 2,
        actorEmail: null,
        targetEmail: null,
        eventType: "account_deleted",
        metadata: {},
        createdAt: new Date(),
      }),
    ).toBe("Deleted an account");
  });
});
