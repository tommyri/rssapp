import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getOptionalCurrentUser: vi.fn(),
  hasAnyUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/current-user", () => ({
  getOptionalCurrentUser: mocks.getOptionalCurrentUser,
}));
vi.mock("./actions", () => ({ hasAnyUser: mocks.hasAnyUser }));
vi.mock("@/components/auth-form", () => ({
  AuthForm: ({ mode }: { mode: string }) => createElement("div", {}, mode),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A session issued before sessionVersion was added still looks signed in to
    // the edge proxy, but it is no longer a current account session.
    mocks.auth.mockResolvedValue({ user: { id: "1" } });
    mocks.getOptionalCurrentUser.mockResolvedValue(null);
    mocks.hasAnyUser.mockResolvedValue(true);
  });

  it("renders login instead of redirecting a stale session back to the reader", async () => {
    const page = await LoginPage();

    expect(mocks.getOptionalCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(page)).toContain("login");
  });

  it("still redirects a current active account to the reader", async () => {
    mocks.getOptionalCurrentUser.mockResolvedValue({ id: 1 });

    await LoginPage();

    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
