import {
  type AudioProgressByUrl,
  resumableAudioPosition,
} from "@/lib/audio-progress";

const ARTICLE_AUDIO_PROGRESS_INTERVAL_SECONDS = 15;

interface ArticleAudioProgressBindingOptions {
  initialProgressByUrl: AudioProgressByUrl;
  onProgressChange: (url: string, progress: number | null) => void;
}

function sourceUrl(audio: HTMLAudioElement): string | null {
  const source =
    audio.currentSrc ||
    audio.getAttribute("src") ||
    audio.querySelector("source")?.getAttribute("src");
  if (!source) return null;
  try {
    return new URL(source, document.baseURI).href;
  } catch {
    return source;
  }
}

/**
 * Native audio inside feed HTML bypasses React, so bind resume behavior after
 * the sanitized markup is mounted. Each source has independent state because
 * a single post can contain several recordings.
 */
export function bindArticleAudioProgress(
  root: HTMLElement,
  {
    initialProgressByUrl,
    onProgressChange,
  }: ArticleAudioProgressBindingOptions,
): () => void {
  const reports: Array<() => void> = [];
  const cleanups: Array<() => void> = [];

  for (const audio of root.querySelectorAll<HTMLAudioElement>("audio")) {
    const url = sourceUrl(audio);
    if (!url) continue;

    let metadataLoaded = false;
    let lastReported: number | null | undefined = initialProgressByUrl[url];
    const restoreProgress = () => {
      if (metadataLoaded) return;
      metadataLoaded = true;
      const stored = initialProgressByUrl[url];
      if (stored === undefined) return;

      const progress = resumableAudioPosition(stored, audio.duration);
      if (progress === null) {
        lastReported = null;
        onProgressChange(url, null);
        return;
      }
      audio.currentTime = progress;
      lastReported = progress;
    };
    const reportProgress = () => {
      if (!metadataLoaded) {
        if (audio.readyState < 1) return;
        restoreProgress();
      }

      const progress = resumableAudioPosition(
        audio.currentTime,
        audio.duration,
      );
      // There is nothing to clear for a freshly opened, unplayed recording.
      if (progress === null && lastReported === undefined) {
        lastReported = null;
        return;
      }
      if (progress === lastReported) return;
      lastReported = progress;
      onProgressChange(url, progress);
    };
    const onTimeUpdate = () => {
      if (
        lastReported === undefined ||
        lastReported === null ||
        Math.abs(audio.currentTime - lastReported) >=
          ARTICLE_AUDIO_PROGRESS_INTERVAL_SECONDS
      ) {
        reportProgress();
      }
    };
    const clearProgress = () => {
      if (lastReported === undefined || lastReported === null) return;
      lastReported = null;
      onProgressChange(url, null);
    };

    audio.addEventListener("loadedmetadata", restoreProgress);
    audio.addEventListener("seeked", reportProgress);
    audio.addEventListener("pause", reportProgress);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", clearProgress);
    // Inline article HTML can load before React's passive effect runs.
    if (audio.readyState >= 1) restoreProgress();
    reports.push(reportProgress);
    cleanups.push(() => {
      audio.removeEventListener("loadedmetadata", restoreProgress);
      audio.removeEventListener("seeked", reportProgress);
      audio.removeEventListener("pause", reportProgress);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", clearProgress);
    });
  }

  const flushProgress = () => {
    for (const reportProgress of reports) reportProgress();
  };
  const saveWhenHidden = () => {
    if (root.ownerDocument.visibilityState === "hidden") flushProgress();
  };
  const view = root.ownerDocument.defaultView;
  view?.addEventListener("pagehide", flushProgress);
  root.ownerDocument.addEventListener("visibilitychange", saveWhenHidden);

  return () => {
    flushProgress();
    for (const cleanup of cleanups) cleanup();
    view?.removeEventListener("pagehide", flushProgress);
    root.ownerDocument.removeEventListener("visibilitychange", saveWhenHidden);
  };
}
