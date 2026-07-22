import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const expectedEnvironment = {
  APPLE_NATIVE_CLIENT_ID: "no.currentfold.reader",
  APPLE_TEAM_ID: "ABCDE12345",
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
