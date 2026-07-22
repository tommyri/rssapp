import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyGoogleToken: vi.fn(),
  verifyAppleToken: vi.fn(),
  consumeChallenge: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = mocks.verifyGoogleToken;
  },
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: () => "apple-key-set",
  jwtVerify: mocks.verifyAppleToken,
}));

vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => ({ returning: mocks.consumeChallenge }),
      }),
    }),
  },
}));

import {
  nativeProviderAvailability,
  verifyNativeAppleProof,
  verifyNativeGoogleProof,
} from "@/lib/native-provider-proof";

describe("native provider proof", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APPLE_NATIVE_CLIENT_ID", "no.currentfold.reader");
    vi.stubEnv("AUTH_GOOGLE_ID", "server-client.apps.googleusercontent.com");
    mocks.consumeChallenge.mockResolvedValue([{ id: 1 }]);
  });

  it("only advertises configured provider audiences", () => {
    expect(nativeProviderAvailability()).toEqual({
      apple: true,
      google: true,
    });

    vi.stubEnv("APPLE_NATIVE_CLIENT_ID", "");
    expect(nativeProviderAvailability()).toEqual({
      apple: false,
      google: true,
    });
  });

  it("verifies Apple's stable subject and one-time nonce", async () => {
    const challenge = "currentfold_challenge_example";
    const nonce = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(challenge),
    );
    const nonceHex = Array.from(new Uint8Array(nonce), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    mocks.verifyAppleToken.mockResolvedValue({
      payload: {
        sub: "apple-subject",
        nonce: nonceHex,
        email: "reader@example.com",
        email_verified: "true",
      },
    });

    const identity = await verifyNativeAppleProof({
      identityToken: "apple-token",
      challenge,
      displayName: "Reader",
    });

    expect(mocks.verifyAppleToken).toHaveBeenCalledWith(
      "apple-token",
      "apple-key-set",
      {
        issuer: "https://appleid.apple.com",
        audience: "no.currentfold.reader",
        algorithms: ["RS256"],
      },
    );
    expect(identity).toEqual({
      provider: "apple",
      subject: "apple-subject",
      email: "reader@example.com",
      emailVerified: true,
      displayName: "Reader",
    });
  });

  it("rejects an Apple identity token not bound to the challenge", async () => {
    mocks.verifyAppleToken.mockResolvedValue({
      payload: {
        sub: "apple-subject",
        nonce: "wrong-nonce",
        email: "reader@example.com",
        email_verified: true,
      },
    });

    expect(
      await verifyNativeAppleProof({
        identityToken: "apple-token",
        challenge: "currentfold_challenge_example",
      }),
    ).toBeNull();
  });

  it("verifies Google tokens against the server client audience", async () => {
    mocks.verifyGoogleToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-subject",
        email: "reader@example.com",
        email_verified: true,
        name: "Reader",
      }),
    });

    const identity = await verifyNativeGoogleProof("google-token");

    expect(mocks.verifyGoogleToken).toHaveBeenCalledWith({
      idToken: "google-token",
      audience: "server-client.apps.googleusercontent.com",
    });
    expect(identity).toEqual({
      provider: "google",
      subject: "google-subject",
      email: "reader@example.com",
      emailVerified: true,
      displayName: "Reader",
    });
  });
});
