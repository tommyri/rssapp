import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getOptionalCurrentUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/current-user", () => ({
  getOptionalCurrentUser: mocks.getOptionalCurrentUser,
}));
vi.mock("@/components/auth-form", () => ({
  AuthForm: ({ mode, notice }: { mode: string; notice?: string }) =>
    createElement("div", {}, `${mode}${notice ? `: ${notice}` : ""}`),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import LoginPage from "./page";

describe("LoginPage", () => {
  const routeProps = (
    searchParams: { notice?: string; owner?: string } = {},
  ) => ({
    searchParams: Promise.resolve(searchParams),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // A session issued before sessionVersion was added still looks signed in to
    // the edge proxy, but it is no longer a current account session.
    mocks.auth.mockResolvedValue({ user: { id: "1" } });
    mocks.getOptionalCurrentUser.mockResolvedValue(null);
  });

  it("renders login instead of redirecting a stale session back to the reader", async () => {
    const page = await LoginPage(routeProps());

    expect(mocks.getOptionalCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(page)).toContain("login");
  });

  it("still redirects a current active account to the reader", async () => {
    mocks.getOptionalCurrentUser.mockResolvedValue({ id: 1 });

    await LoginPage(routeProps());

    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("explains why a former owner must sign in again", async () => {
    const page = await LoginPage(
      routeProps({
        notice: "ownership-transferred",
        owner: "new-owner@example.com",
      }),
    );

    expect(renderToStaticMarkup(page)).toContain(
      "new-owner@example.com is now the deployment owner. Please sign in again.",
    );
  });
});
