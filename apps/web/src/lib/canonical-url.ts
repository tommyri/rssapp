// Tracking params that don't identify the page — dropped so the same link
// shared with different campaign tags dedups to one saved page.
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "ref_src",
  "_hsenc",
  "_hsmi",
]);

function tryParse(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

/**
 * Normalize a user-supplied URL for storage and dedup: add a scheme if missing,
 * lowercase the host, drop tracking params and the fragment. Returns null if it
 * isn't a usable http(s) URL. Pure — no I/O — so it's unit-tested directly.
 */
export function canonicalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Parse as-is first so a foreign scheme (mailto:, ftp:, javascript:, tel:…)
  // is recognized and rejected below — not silently smuggled into the host by a
  // prepended https://. Only a scheme-less input (which fails to parse) gets one.
  const u = tryParse(trimmed) ?? tryParse(`https://${trimmed}`);
  if (!u) return null;

  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname.includes(".")) return null; // reject bare words like "hello"

  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
      u.searchParams.delete(key);
    }
  }
  return u.toString();
}
