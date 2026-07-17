const RESUME_MINIMUM_SECONDS = 5;
const RESUME_END_GUARD_SECONDS = 3;

/** Saved positions are scoped to each source because one post may embed several recordings. */
export type AudioProgressByUrl = Record<string, number>;

/**
 * Do not resume a nearly finished episode: replaying its last seconds feels
 * like a bug, while a position before the opening has no useful continuity.
 */
export function resumableAudioPosition(
  position: number,
  duration: number,
): number | null {
  if (!Number.isFinite(position) || position < RESUME_MINIMUM_SECONDS) {
    return null;
  }

  // Some valid podcast responses are seekable but omit a content length. The
  // native media element represents that as Infinity, so retain the absolute
  // position while still applying the near-end guard when a duration exists.
  // Native players report NaN until a duration can be determined. A user can
  // still seek a byte-range audio file in that state, so persist the absolute
  // position instead of silently dropping it.
  if (duration === Number.POSITIVE_INFINITY || Number.isNaN(duration)) {
    return position;
  }

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    position >= duration - RESUME_END_GUARD_SECONDS
  ) {
    return null;
  }

  return Math.min(position, duration - RESUME_END_GUARD_SECONDS);
}

export function formatAudioTimestamp(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  const secondsPart = String(remainingSeconds).padStart(2, "0");

  if (hours > 0)
    return `${hours}:${String(minutes).padStart(2, "0")}:${secondsPart}`;
  return `${minutes}:${secondsPart}`;
}

export function withAudioProgress(
  current: AudioProgressByUrl,
  url: string,
  progress: number | null,
): AudioProgressByUrl {
  const next = { ...current };
  if (progress === null) delete next[url];
  else next[url] = progress;
  return next;
}
