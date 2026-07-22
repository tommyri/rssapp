import { describe, expect, it } from "vitest";
import { accountDeletionConfirmationError } from "./account-deletion";

describe("account deletion confirmation", () => {
  const member = {
    role: "member" as const,
    accountEmail: "reader@example.com",
  };

  it("requires the exact account email and DELETE confirmation", () => {
    expect(
      accountDeletionConfirmationError({
        ...member,
        typedEmail: "other@example.com",
        confirmation: "DELETE",
      }),
    ).toContain("email");
    expect(
      accountDeletionConfirmationError({
        ...member,
        typedEmail: "Reader@Example.com ",
        confirmation: "delete",
      }),
    ).toContain("DELETE");
    expect(
      accountDeletionConfirmationError({
        ...member,
        typedEmail: "Reader@Example.com ",
        confirmation: "DELETE",
      }),
    ).toBeNull();
  });

  it("never allows the deployment owner to delete themself", () => {
    expect(
      accountDeletionConfirmationError({
        role: "owner",
        accountEmail: "owner@example.com",
        typedEmail: "owner@example.com",
        confirmation: "DELETE",
      }),
    ).toContain("Transfer ownership");
  });
});
