import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAVE_LINK_LIMITED_MESSAGE } from "@/lib/save-link-notice";

// Only the redirect-marker path is exercised here. Driving the input is not
// possible under linkedom — React's onChange never fires for a dispatched input
// event — so the notice-precedence rules are covered in save-link-notice.test.ts.
const mocks = vi.hoisted(() => ({
  saveLinkAction: vi.fn(),
  refresh: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => mocks.params,
}));
vi.mock("@/app/actions", () => ({ saveLinkAction: mocks.saveLinkAction }));

import { SaveLinkForm } from "./save-link-form";

type DomGlobals = {
  window?: Window;
  document?: Document;
  HTMLElement?: typeof HTMLElement;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

async function withForm(
  run: (context: { mount: HTMLElement }) => Promise<void>,
) {
  const { document, window } = parseHTML(
    '<html><body><div id="mount"></div></body></html>',
  );
  const globals = globalThis as typeof globalThis & DomGlobals;
  const previous: DomGlobals = {
    window: globals.window,
    document: globals.document,
    HTMLElement: globals.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globals, {
    window,
    document,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const mount = document.querySelector("#mount") as unknown as HTMLElement;
  let root: Root | null = createRoot(mount);
  try {
    await act(async () => {
      root?.render(createElement(SaveLinkForm));
    });
    await run({ mount });
  } finally {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    Object.assign(globals, previous);
  }
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams();
});

describe("SaveLinkForm", () => {
  it("shows nothing until something has happened", async () => {
    await withForm(async ({ mount }) => {
      expect(mount.textContent).not.toContain(SAVE_LINK_LIMITED_MESSAGE);
    });
  });

  it("reports a bookmark save that ran out of budget", async () => {
    mocks.params = new URLSearchParams("saved=limited");

    await withForm(async ({ mount }) => {
      expect(mount.textContent).toContain(SAVE_LINK_LIMITED_MESSAGE);
      expect(mount.querySelector("p")?.getAttribute("class")).toContain(
        "text-destructive",
      );
    });
  });
});
