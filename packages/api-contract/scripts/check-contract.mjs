import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
  await readFile(join(packageRoot, "openapi.json"), "utf8"),
);

if (contract.openapi !== "3.1.0") {
  throw new Error("The first-party contract must use OpenAPI 3.1.0.");
}

const requiredOperations = new Map([
  ["GET /api/v1", "getServiceMetadata"],
  ["GET /api/v1/openapi.json", "getOpenApiContract"],
  ["POST /api/v1/auth/session", "createNativeSession"],
  ["DELETE /api/v1/auth/session", "revokeNativeSession"],
  ["POST /api/v1/auth/session/refresh", "refreshNativeSession"],
  ["GET /api/v1/auth/providers", "listNativeAuthProviders"],
  ["POST /api/v1/auth/providers/apple/challenge", "createNativeAppleChallenge"],
  ["POST /api/v1/auth/provider-session", "createNativeProviderSession"],
  ["POST /api/v1/auth/registration", "registerNativeAccount"],
  ["POST /api/v1/auth/verification", "resendNativeVerification"],
  ["PATCH /api/v1/auth/verification", "verifyNativeEmail"],
  ["POST /api/v1/auth/recovery", "requestNativePasswordReset"],
  ["PATCH /api/v1/auth/recovery", "resetNativePassword"],
  ["GET /api/v1/me", "getCurrentAccount"],
  ["GET /api/v1/subscriptions", "listSubscriptions"],
  ["GET /api/v1/articles", "listArticles"],
  ["PATCH /api/v1/articles/read-state", "updateArticleReadState"],
]);

const operationIds = new Set();
for (const [key, expectedId] of requiredOperations) {
  const [method, path] = key.split(" ");
  const operation = contract.paths?.[path]?.[method.toLowerCase()];
  if (!operation) throw new Error(`Missing contract operation: ${key}`);
  if (operation.operationId !== expectedId) {
    throw new Error(`${key} must use operationId ${expectedId}.`);
  }
}

for (const pathItem of Object.values(contract.paths ?? {})) {
  for (const operation of Object.values(pathItem)) {
    if (!operation || typeof operation !== "object" || !operation.operationId) {
      continue;
    }
    if (operationIds.has(operation.operationId)) {
      throw new Error(`Duplicate operationId: ${operation.operationId}`);
    }
    operationIds.add(operation.operationId);
  }
}

console.log(
  `Validated Currentfold API ${contract.info.version} (${operationIds.size} operations).`,
);
