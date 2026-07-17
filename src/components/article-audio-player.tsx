"use client";

import { HeadphonesIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  formatAudioTimestamp,
  resumableAudioPosition,
} from "@/lib/audio-progress";
import { persistItemAudioProgress } from "@/lib/audio-progress-client";

const PROGRESS_SAVE_INTERVAL_SECONDS = 15;

type QueuedProgress = number | null;

/** Native controls keep podcast playback fast, accessible, and dependency-free. */
export function ArticleAudioPlayer({
  itemId,
  url,
  type,
  initialProgress,
  onProgressChange,
}: {
  itemId: number;
  url: string;
  type: string | null;
  initialProgress: number | null;
  onProgressChange: (url: string, progress: number | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const queuedProgressRef = useRef<QueuedProgress | undefined>(undefined);
  const savingProgressRef = useRef(false);
  const lastQueuedProgressRef = useRef<QueuedProgress | undefined>(
    initialProgress,
  );
  const metadataLoadedRef = useRef(false);
  const onProgressChangeRef = useRef(onProgressChange);
  onProgressChangeRef.current = onProgressChange;
  const [resumePosition, setResumePosition] = useState(initialProgress);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const flushProgress = useCallback(async () => {
    if (savingProgressRef.current || queuedProgressRef.current === undefined) {
      return;
    }

    const progress = queuedProgressRef.current;
    queuedProgressRef.current = undefined;
    savingProgressRef.current = true;
    try {
      const saved = await persistItemAudioProgress({
        itemId,
        audioUrl: url,
        progress,
      });
      if (!saved) {
        setSaveError(
          "Couldn't save listening position. Try playing or pausing again.",
        );
        if (lastQueuedProgressRef.current === progress) {
          lastQueuedProgressRef.current = undefined;
        }
      } else {
        setSaveError(null);
      }
    } catch {
      setSaveError(
        "Couldn't save listening position. Try playing or pausing again.",
      );
      if (lastQueuedProgressRef.current === progress) {
        lastQueuedProgressRef.current = undefined;
      }
    } finally {
      savingProgressRef.current = false;
      if (queuedProgressRef.current !== undefined) void flushProgress();
    }
  }, [itemId, url]);

  const queueProgress = useCallback(
    (progress: QueuedProgress) => {
      if (progress === lastQueuedProgressRef.current) return;
      lastQueuedProgressRef.current = progress;
      setResumePosition(progress);
      onProgressChangeRef.current(url, progress);
      queuedProgressRef.current = progress;
      void flushProgress();
    },
    [flushProgress, url],
  );

  const persistCurrentProgress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !metadataLoadedRef.current) {
      return;
    }

    const position = resumableAudioPosition(audio.currentTime, audio.duration);
    queueProgress(position);
  }, [queueProgress]);

  useEffect(() => {
    const saveBeforeLeaving = () => persistCurrentProgress();
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") saveBeforeLeaving();
    };
    window.addEventListener("pagehide", saveBeforeLeaving);
    document.addEventListener("visibilitychange", saveWhenHidden);

    return () => {
      window.removeEventListener("pagehide", saveBeforeLeaving);
      document.removeEventListener("visibilitychange", saveWhenHidden);
      persistCurrentProgress();
    };
  }, [persistCurrentProgress]);

  const resumeAfterMetadataLoads = () => {
    const audio = audioRef.current;
    if (!audio) return;
    metadataLoadedRef.current = true;
    if (resumePosition === null) return;

    const position = resumableAudioPosition(resumePosition, audio.duration);
    if (position === null) {
      queueProgress(null);
      setResumePosition(null);
      return;
    }

    audio.currentTime = position;
    lastQueuedProgressRef.current = position;
    setResumePosition(position);
  };

  const resetEpisode = () => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = 0;
    queueProgress(null);
    setResumePosition(null);
  };

  return (
    <section className="mb-6 rounded-lg border bg-accent/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <HeadphonesIcon className="size-4 text-muted-foreground" />
        Listen to this episode
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: RSS enclosures expose audio URLs, not caption-track URLs */}
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        className="w-full"
        onLoadedMetadata={resumeAfterMetadataLoads}
        onSeeked={persistCurrentProgress}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false);
          persistCurrentProgress();
        }}
        onEnded={() => {
          setIsPlaying(false);
          queueProgress(null);
        }}
        onTimeUpdate={(event) => {
          const previous = lastQueuedProgressRef.current;
          if (
            previous === undefined ||
            previous === null ||
            Math.abs(event.currentTarget.currentTime - previous) >=
              PROGRESS_SAVE_INTERVAL_SECONDS
          ) {
            persistCurrentProgress();
          }
        }}
      >
        <source src={url} type={type ?? undefined} />
        Your browser does not support audio playback.
      </audio>
      {resumePosition !== null && !isPlaying ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Continue from {formatAudioTimestamp(resumePosition)}.</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetEpisode}
          >
            Start over
          </Button>
        </div>
      ) : null}
      {saveError ? (
        <output className="mt-2 block text-xs text-destructive">
          {saveError}
        </output>
      ) : null}
    </section>
  );
}
