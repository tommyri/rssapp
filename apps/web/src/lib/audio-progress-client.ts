import type { AudioProgressInput } from "@/lib/audio-progress-input";

/**
 * Send a tiny progress write that the browser is allowed to finish during
 * navigation. The endpoint derives the reader identity from its session.
 */
export async function persistItemAudioProgress(
  input: AudioProgressInput,
): Promise<boolean> {
  try {
    const response = await fetch("/api/audio-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
      body: JSON.stringify(input),
    });
    if (!response.ok) return false;

    const body: unknown = await response.json().catch(() => null);
    return (
      typeof body === "object" &&
      body !== null &&
      "ok" in body &&
      body.ok === true
    );
  } catch {
    return false;
  }
}
