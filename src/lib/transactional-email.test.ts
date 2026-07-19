import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type EmailDeliveryError,
  isEmailDeliveryAvailable,
  isEmailDeliveryConfigured,
  sendEmailMessage,
} from "@/lib/transactional-email";

describe("transactional email", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the local log only when both provider settings are absent", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(
      sendEmailMessage({
        to: "reader@example.com",
        subject: "Test",
        text: "Body",
      }),
    ).resolves.toEqual({ providerMessageId: null });
    expect(info).toHaveBeenCalledOnce();
    expect(isEmailDeliveryAvailable()).toBe(true);
    expect(isEmailDeliveryConfigured()).toBe(false);
  });

  it("rejects a partial provider configuration instead of silently logging", async () => {
    vi.stubEnv("RESEND_API_KEY", "secret");

    await expect(
      sendEmailMessage({
        to: "reader@example.com",
        subject: "Test",
        text: "Body",
      }),
    ).rejects.toMatchObject<Partial<EmailDeliveryError>>({
      name: "EmailDeliveryError",
      retryable: false,
    });
    expect(isEmailDeliveryAvailable()).toBe(false);
  });

  it("passes HTML, list headers, and the stable idempotency key to Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "secret");
    vi.stubEnv("EMAIL_FROM", "Reader <reader@example.com>");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendEmailMessage({
        to: "person@example.com",
        subject: "Digest",
        text: "Plain",
        html: "<p>HTML</p>",
        headers: { "List-Unsubscribe": "<https://example.com/stop>" },
        idempotencyKey: "digest-42",
      }),
    ).resolves.toEqual({ providerMessageId: "email_123" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
          "Idempotency-Key": "digest-42",
        }),
        body: JSON.stringify({
          from: "Reader <reader@example.com>",
          to: ["person@example.com"],
          subject: "Digest",
          text: "Plain",
          html: "<p>HTML</p>",
          headers: { "List-Unsubscribe": "<https://example.com/stop>" },
        }),
      }),
    );
  });

  it.each([
    [429, true],
    [503, true],
    [422, false],
  ])(
    "classifies a %i provider response as retryable=%s",
    async (status, retryable) => {
      vi.stubEnv("RESEND_API_KEY", "secret");
      vi.stubEnv("EMAIL_FROM", "reader@example.com");
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );

      const result = sendEmailMessage({
        to: "person@example.com",
        subject: "Digest",
        text: "Plain",
      });
      await expect(result).rejects.toMatchObject<Partial<EmailDeliveryError>>({
        retryable,
      });
    },
  );
});
