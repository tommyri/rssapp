import { apiJson } from "@/lib/api-v1-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Authorize Currentfold's HTTPS account links for the signed native app. */
export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId)) {
    return apiJson(
      { error: { code: "not_configured", message: "Not configured." } },
      { status: 404 },
    );
  }

  return apiJson(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.no.currentfold.reader`,
            components: [
              { "/": "/verify-email", comment: "Email verification" },
              { "/": "/reset-password", comment: "Password recovery" },
              { "/": "/signup", comment: "Account invitation" },
            ],
          },
        ],
      },
    },
    {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "application/json",
      },
    },
  );
}
