import { readdir, readFile } from "node:fs/promises";
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
  ["PATCH /api/v1/articles/starred-state", "updateArticleStarredState"],
  ["PATCH /api/v1/articles/read-later-state", "updateArticleReadLaterState"],
  ["POST /api/v1/articles/mark-all-read", "markAllArticlesRead"],
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

/**
 * Every fixture is a payload a client decodes in its own tests, so each one has
 * to be a legal instance of the schema it stands for. Validated here against the
 * contract itself rather than by eye: a fixture that drifts from the schema
 * teaches a client the wrong shape, and nothing else would catch it.
 */
const fixtureSchemas = new Map([
  ["article-page.json", "ArticlePage"],
  ["read-state-request.json", "ReadStateUpdate"],
  ["starred-state-request.json", "StarredStateUpdate"],
  ["starred-state-response.json", "StarredStateResponse"],
  ["read-later-state-request.json", "ReadLaterStateUpdate"],
  ["read-later-state-response.json", "ReadLaterStateResponse"],
  ["mark-all-read-request.json", "MarkAllReadRequest"],
  ["mark-all-read-response.json", "MarkAllReadResponse"],
]);

function resolveSchema(schema) {
  if (!schema?.$ref) return schema;
  const name = schema.$ref.replace("#/components/schemas/", "");
  const resolved = contract.components?.schemas?.[name];
  if (!resolved)
    throw new Error(`Unresolvable schema reference: ${schema.$ref}`);
  return resolveSchema(resolved);
}

/** The JSON Schema subset this contract actually uses; anything else is ignored. */
function schemaErrors(value, schema, path = "") {
  const node = resolveSchema(schema);
  const at = path || "(root)";

  if (Array.isArray(node.oneOf)) {
    const matches = node.oneOf.filter(
      (branch) => schemaErrors(value, branch, path).length === 0,
    );
    return matches.length === 1
      ? []
      : [
          `${at} matches ${matches.length} of ${node.oneOf.length} oneOf branches`,
        ];
  }
  if (node.const !== undefined && value !== node.const) {
    return [`${at} must be ${JSON.stringify(node.const)}`];
  }
  if (node.enum && !node.enum.includes(value)) {
    return [`${at} must be one of ${node.enum.join(", ")}`];
  }

  const types = node.type
    ? Array.isArray(node.type)
      ? node.type
      : [node.type]
    : null;
  const actual =
    value === null
      ? "null"
      : Array.isArray(value)
        ? "array"
        : Number.isInteger(value)
          ? "integer"
          : typeof value;
  if (
    types &&
    !types.includes(actual) &&
    !(actual === "integer" && types.includes("number"))
  ) {
    return [`${at} is ${actual}, expected ${types.join(" or ")}`];
  }
  if (value === null) return [];

  const errors = [];
  if (typeof value === "string") {
    if (node.pattern && !new RegExp(node.pattern).test(value)) {
      errors.push(`${at} does not match ${node.pattern}`);
    }
    if (node.maxLength !== undefined && value.length > node.maxLength) {
      errors.push(`${at} is longer than ${node.maxLength} characters`);
    }
  }
  if (typeof value === "number") {
    if (node.minimum !== undefined && value < node.minimum) {
      errors.push(`${at} is below the minimum ${node.minimum}`);
    }
  }
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) {
      errors.push(`${at} has fewer than ${node.minItems} items`);
    }
    if (node.maxItems !== undefined && value.length > node.maxItems) {
      errors.push(`${at} has more than ${node.maxItems} items`);
    }
    if (node.items) {
      value.forEach((entry, index) => {
        errors.push(...schemaErrors(entry, node.items, `${path}[${index}]`));
      });
    }
    return errors;
  }
  if (actual === "object") {
    for (const key of node.required ?? []) {
      if (!(key in value)) errors.push(`${at} is missing "${key}"`);
    }
    for (const [key, entry] of Object.entries(value)) {
      const property = node.properties?.[key];
      if (!property) {
        if (node.additionalProperties === false) {
          errors.push(`${at} has an unexpected "${key}"`);
        }
        continue;
      }
      errors.push(...schemaErrors(entry, property, `${path}.${key}`));
    }
  }
  return errors;
}

const fixtureDir = join(packageRoot, "fixtures");
const fixtureFiles = (await readdir(fixtureDir)).filter((name) =>
  name.endsWith(".json"),
);
for (const name of fixtureFiles) {
  const schemaName = fixtureSchemas.get(name);
  if (!schemaName) {
    throw new Error(
      `Fixture ${name} has no schema in check-contract.mjs; add one so it is validated.`,
    );
  }
  const fixture = JSON.parse(await readFile(join(fixtureDir, name), "utf8"));
  const errors = schemaErrors(fixture, {
    $ref: `#/components/schemas/${schemaName}`,
  });
  if (errors.length > 0) {
    throw new Error(
      `Fixture ${name} violates ${schemaName}:\n  ${errors.join("\n  ")}`,
    );
  }
}

console.log(
  `Validated Currentfold API ${contract.info.version} (${operationIds.size} operations, ${fixtureFiles.length} fixtures).`,
);
