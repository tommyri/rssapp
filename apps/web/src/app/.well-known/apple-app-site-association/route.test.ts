import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalTeamId = process.env.APPLE_TEAM_ID;

afterEach(() => {
  if (originalTeamId === undefined) delete process.env.APPLE_TEAM_ID;
  else process.env.APPLE_TEAM_ID = originalTeamId;
});

describe("Apple app-site association", () => {
  it("stays unavailable until an Apple team is configured", async () => {
    delete process.env.APPLE_TEAM_ID;
    const response = await GET();

    expect(response.status).toBe(404);
  });

  it("publishes only the native account-link routes", async () => {
    process.env.APPLE_TEAM_ID = "A1B2C3D4E5";
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appID: "A1B2C3D4E5.no.currentfold.reader",
            components: [
              { "/": "/verify-email", comment: "Email verification" },
              { "/": "/reset-password", comment: "Password recovery" },
              { "/": "/signup", comment: "Account invitation" },
            ],
          },
        ],
      },
    });
  });
});
