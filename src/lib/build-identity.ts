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
  RSSAPP_VERSION?: string;
  RSSAPP_REVISION?: string;
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
    RSSAPP_VERSION: process.env.RSSAPP_VERSION,
    RSSAPP_REVISION: process.env.RSSAPP_REVISION,
  },
): BuildIdentity {
  const revision = sourceRevision(environment.RSSAPP_REVISION);
  return {
    version: buildVersion(environment.RSSAPP_VERSION),
    revision,
    shortRevision: revision?.slice(0, 12) ?? null,
  };
}
