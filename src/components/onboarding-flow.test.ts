import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ addFeedAction: vi.fn() }));
vi.mock("@/app/onboarding/actions", () => ({
  completeOnboardingAction: vi.fn(),
}));
vi.mock("@/components/add-feed-form", () => ({
  AddFeedForm: () => createElement("div", {}, "Add one feed"),
}));
vi.mock("@/components/opml-controls", () => ({
  OpmlControls: () => createElement("div", {}, "Import OPML"),
}));

import { OnboardingFlow } from "./onboarding-flow";

describe("OnboardingFlow", () => {
  it("keeps one completion action at the end of source setup", () => {
    const markup = renderToStaticMarkup(
      createElement(OnboardingFlow, {
        email: "new@example.com",
        displayName: "New reader",
        starterFeeds: [],
      }),
    );

    expect(markup.indexOf("Bring your sources")).toBeLessThan(
      markup.indexOf("Start reading"),
    );
    expect(markup.indexOf("Set an optional name")).toBeLessThan(
      markup.indexOf("Start reading"),
    );
    expect(markup.match(/<button[^>]*>Start reading<\/button>/g)).toHaveLength(
      1,
    );
  });
});
