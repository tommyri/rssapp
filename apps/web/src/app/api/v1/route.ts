import { apiJson } from "@/lib/api-v1-response";
import { getBuildIdentity } from "@/lib/build-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return apiJson({
    data: {
      name: "Currentfold",
      apiVersion: "v1",
      productVersion: getBuildIdentity().version,
      capabilities: [
        "account",
        "subscriptions",
        "articleStream",
        "articleReadState",
      ],
      links: {
        openApi: "/api/v1/openapi.json",
      },
    },
  });
}
