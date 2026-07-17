"use client";

import { HeadphonesIcon } from "lucide-react";

/** Native controls keep podcast playback fast, accessible, and dependency-free. */
export function ArticleAudioPlayer({
  url,
  type,
}: {
  url: string;
  type: string | null;
}) {
  return (
    <section className="mb-6 rounded-lg border bg-accent/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <HeadphonesIcon className="size-4 text-muted-foreground" />
        Listen to this episode
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: RSS enclosures expose audio URLs, not caption-track URLs */}
      <audio controls preload="metadata" className="w-full">
        <source src={url} type={type ?? undefined} />
        Your browser does not support audio playback.
      </audio>
    </section>
  );
}
