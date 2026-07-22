import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/components/onboarding-flow", () => ({
  OnboardingFlow: ({ email }: { email: string }) =>
    createElement("div", {}, `onboarding:${email}`),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import OnboardingPage from "./page";

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows guided setup for a new verified account", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 2,
      email: "new@example.com",
      displayName: null,
      onboardingCompletedAt: null,
    });

    const page = await OnboardingPage();

    expect(renderToStaticMarkup(page)).toContain("onboarding:new@example.com");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns completed accounts to the reader", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 1,
      email: "reader@example.com",
      displayName: null,
      onboardingCompletedAt: new Date(),
    });

    await OnboardingPage();

    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
