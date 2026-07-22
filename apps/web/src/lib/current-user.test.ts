import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
  select: vi.fn(),
  sessionWhere: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/db", () => ({
  db: {
    query: { users: { findFirst: mocks.findFirst } },
    select: mocks.select,
  },
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

import { getCurrentOwner, getOptionalCurrentUser } from "./current-user";

describe("getCurrentOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "1", sessionVersion: 1 } });
    mocks.redirect.mockImplementation(() => {
      throw new Error("redirected");
    });
    mocks.notFound.mockImplementation(() => {
      throw new Error("not found");
    });
  });

  it("returns the active deployment owner", async () => {
    mocks.findFirst.mockResolvedValue({ id: 1, role: "owner" });

    await expect(getCurrentOwner()).resolves.toMatchObject({
      id: 1,
      role: "owner",
    });
  });

  it("hides account management from a normal member", async () => {
    mocks.findFirst.mockResolvedValue({ id: 1, role: "member" });

    await expect(getCurrentOwner()).rejects.toThrow("not found");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("rejects a revoked or expired server-recorded session", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "1", sessionVersion: 1, sessionId: "a".repeat(43) },
    });
    mocks.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({ where: mocks.sessionWhere }),
      }),
    });
    mocks.sessionWhere.mockResolvedValue([]);

    await expect(getOptionalCurrentUser()).resolves.toBeNull();
    expect(mocks.select).toHaveBeenCalledOnce();
  });
});
