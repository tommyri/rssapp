import { describe, expect, it } from "vitest";
import { offlineMutationPayloadSchema } from "./offline-mutation-payload";

describe("offlineMutationPayloadSchema", () => {
  it("accepts the bounded reader changes the offline worker may replay", () => {
    expect(
      offlineMutationPayloadSchema.parse({
        mutations: [
          {
            key: "7:item:42:starred",
            token: "a-token",
            userId: 7,
            kind: "item",
            itemId: 42,
            field: "starred",
            value: true,
          },
          {
            key: "7:page:3:read",
            token: "b-token",
            userId: 7,
            kind: "page",
            itemId: 3,
            field: "read",
            value: true,
          },
        ],
      }),
    ).toMatchObject({ mutations: [{ kind: "item" }, { kind: "page" }] });
  });

  it("rejects unsupported saved-page mutations", () => {
    expect(
      offlineMutationPayloadSchema.safeParse({
        mutations: [
          {
            key: "7:page:3:starred",
            token: "a-token",
            userId: 7,
            kind: "page",
            itemId: 3,
            field: "starred",
            value: true,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
