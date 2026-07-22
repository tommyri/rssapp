/** Accept only an app-local path; never let an auth form become an open redirect. */
export function safeReturnTo(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048) {
    return fallback;
  }
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const parsed = new URL(value, "https://rssapp.invalid");
    if (parsed.origin !== "https://rssapp.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
