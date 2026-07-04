"use client";

import { useState } from "react";

/**
 * Favicon derived from the feed's site origin — no third-party icon service
 * (the browser already talks to these sites via article links). Falls back to
 * a neutral dot when the site has no /favicon.ico.
 */
export function FeedIcon({
  siteUrl,
  feedUrl,
}: {
  siteUrl: string | null;
  feedUrl: string;
}) {
  const [failed, setFailed] = useState(false);

  let origin: string | null = null;
  try {
    origin = new URL(siteUrl ?? feedUrl).origin;
  } catch {
    // Fall through to the placeholder.
  }

  if (!origin || failed) {
    return (
      <span
        aria-hidden
        className="inline-block size-4 shrink-0 rounded-sm bg-muted-foreground/20"
      />
    );
  }

  return (
    <img
      src={`${origin}/favicon.ico`}
      alt=""
      loading="lazy"
      className="size-4 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}
