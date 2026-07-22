import { describe, expect, it } from "vitest";
import { parsePushSubscription } from "./push-notifications";

describe("parsePushSubscription", () => {
  it("accepts the browser's encrypted HTTPS subscription shape", () => {
    expect(
      parsePushSubscription({
        endpoint: "https://push.example.com/subscription/abc",
        keys: { p256dh: "public-key", auth: "auth-secret" },
      }),
    ).toEqual({
      endpoint: "https://push.example.com/subscription/abc",
      keys: { p256dh: "public-key", auth: "auth-secret" },
    });
  });

  it("rejects unsafe endpoints and incomplete browser data", () => {
    expect(
      parsePushSubscription({
        endpoint: "http://push.example.com/subscription/abc",
        keys: { p256dh: "public-key", auth: "auth-secret" },
      }),
    ).toBeNull();
    expect(
      parsePushSubscription({
        endpoint: "https://push.example.com/subscription/abc",
        keys: { p256dh: "public-key" },
      }),
    ).toBeNull();
  });
});
