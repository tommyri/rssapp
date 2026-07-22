import contract from "@currentfold/api-contract/openapi";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(contract, {
    headers: {
      "cache-control": "public, max-age=300, must-revalidate",
      "content-type": "application/vnd.oai.openapi+json;version=3.1",
    },
  });
}
