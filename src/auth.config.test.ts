import { describe, expect, it } from "vitest";
import { authConfig } from "./auth.config";

const authorized = authConfig.callbacks.authorized;

function request(pathname: string) {
  return { nextUrl: { pathname } } as never;
}

describe("auth route exceptions", () => {
  it("keeps account-recovery pages reachable without a session", () => {
    for (const pathname of [
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
    ]) {
      expect(authorized({ auth: null, request: request(pathname) })).toBe(true);
    }
  });

  it("keeps reader routes behind a session", () => {
    expect(authorized({ auth: null, request: request("/") })).toBe(false);
    expect(
      authorized({ auth: { user: { id: "1" } }, request: request("/") }),
    ).toBe(true);
  });

  it("carries a server-verifiable session handle in a newly issued JWT", async () => {
    const jwt = authConfig.callbacks.jwt;
    const session = authConfig.callbacks.session;
    const token = await jwt({
      token: {},
      user: {
        id: "1",
        sessionVersion: 2,
        sessionId: "a".repeat(43),
      },
    } as never);
    const result = await session({
      session: { user: {} },
      token,
    } as never);

    expect(result.user).toMatchObject({
      id: "1",
      sessionVersion: 2,
      sessionId: "a".repeat(43),
    });
  });
});
