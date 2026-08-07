import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const expectedEnvironment = {
  APPLE_NATIVE_CLIENT_ID: "com.currentfold.reader",
  APPLE_TEAM_ID: "K2Z3B4RGA8",
  APP_URL: "https://compose-contract.test",
};

const output = execFileSync(
  "docker",
  ["compose", "-f", "compose.yaml", "config", "--format", "json"],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      APP_IMAGE: "ghcr.io/example/currentfold:test",
      AUTH_SECRET: "compose-contract-test-secret",
      DATABASE_URL: "postgres://currentfold:test@db:5432/currentfold",
      POSTGRES_PASSWORD: "compose-contract-test-password",
      ...expectedEnvironment,
    },
  },
);

const config = JSON.parse(output);
const appEnvironment = config.services?.app?.environment ?? {};

// Auth.js reads AUTH_URL; the operator sets only APP_URL. Compose must derive
// one from the other — deliberately asserted without AUTH_URL in the input env,
// so a mapping that reads ${AUTH_URL} instead of ${APP_URL} fails here rather
// than in production, where login redirects would rebuild URLs from the
// container's bind address (https://0.0.0.0:3000) behind the proxy.
if (appEnvironment.AUTH_URL !== appEnvironment.APP_URL) {
  throw new Error(
    `AUTH_URL must mirror APP_URL in the resolved app environment; received ${JSON.stringify(appEnvironment.AUTH_URL)} vs ${JSON.stringify(appEnvironment.APP_URL)}`,
  );
}
const missing = Object.entries(expectedEnvironment).filter(
  ([name, value]) => appEnvironment[name] !== value,
);

if (missing.length > 0) {
  const details = missing
    .map(
      ([name, value]) =>
        `${name}: expected ${JSON.stringify(value)}, received ${JSON.stringify(appEnvironment[name])}`,
    )
    .join("\n");
  throw new Error(
    `compose.yaml does not forward required application environment variables:\n${details}`,
  );
}

console.log("Compose application environment contract is valid.");
