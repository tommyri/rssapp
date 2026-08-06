import { execSync } from "node:child_process";
import packageJson from "../../package.json";

const calendarVersionPattern = /^\d{4}\.(?:[1-9]|1[0-2])\.[1-9]\d*$/;
const sourceRevisionPattern = /^[0-9a-f]{7,64}$/i;

export interface BuildIdentity {
  /** Calendar release version baked into the artifact. */
  version: string;
  /** Full source revision for deployment checks; null in local development. */
  revision: string | null;
  /** Compact revision for quiet user-facing display. */
  shortRevision: string | null;
}

interface BuildIdentityEnvironment {
  CURRENTFOLD_VERSION?: string;
  CURRENTFOLD_REVISION?: string;
}

function buildVersion(value: string | undefined): string {
  const candidate = value?.trim();
  if (
    candidate === "development" ||
    (candidate && calendarVersionPattern.test(candidate))
  ) {
    return candidate;
  }
  return calendarVersionPattern.test(packageJson.version)
    ? packageJson.version
    : "development";
}

function sourceRevision(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate && sourceRevisionPattern.test(candidate)
    ? candidate.toLowerCase()
    : null;
}

/**
 * One server-only source for the identity shown to readers and deployment
 * probes. Runtime variables are baked into production images, while local
 * development falls back to package metadata and an explicit local revision.
 */
export function getBuildIdentity(
  environment: BuildIdentityEnvironment = {
    CURRENTFOLD_VERSION: process.env.CURRENTFOLD_VERSION,
    CURRENTFOLD_REVISION: process.env.CURRENTFOLD_REVISION,
  },
): BuildIdentity {
  const revision = sourceRevision(environment.CURRENTFOLD_REVISION);
  return {
    version: buildVersion(environment.CURRENTFOLD_VERSION),
    revision,
    shortRevision: revision?.slice(0, 12) ?? null,
  };
}

let checkoutRevisionCache: string | null | undefined;

function git(command: string): string {
  return execSync(command, {
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 2_000,
  })
    .toString()
    .trim();
}

/**
 * Where no revision is baked in (local `next dev`, prod-from-source), the git
 * checkout itself can still answer "which code is this installation running?"
 * — the whole point of the App information footer, and the question support
 * conversations otherwise get stuck on. Best-effort and cached per process:
 * without a git checkout or binary it stays null and the footer keeps its
 * plain "Local development" label. A dirty tree is called out, since local
 * modifications make the hash alone an incomplete answer.
 */
export function checkoutRevision(): string | null {
  if (checkoutRevisionCache !== undefined) return checkoutRevisionCache;
  try {
    const head = git("git rev-parse HEAD").toLowerCase();
    if (!sourceRevisionPattern.test(head)) {
      checkoutRevisionCache = null;
      return checkoutRevisionCache;
    }
    const dirty = git("git status --porcelain") !== "";
    checkoutRevisionCache = `${head.slice(0, 12)}${dirty ? " (modified)" : ""}`;
  } catch {
    checkoutRevisionCache = null;
  }
  return checkoutRevisionCache;
}
