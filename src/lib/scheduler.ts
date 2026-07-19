import { writeScheduledBackups } from "@/lib/backup";
import { refreshDueFeeds } from "@/lib/feeds";
import { sweepPendingFullContent } from "@/lib/feeds/full-content";
import { sweepNotificationDigests } from "@/lib/notification-digests";
import { sweepAutoRead } from "@/lib/reader";
import { sweepPendingSavedPages } from "@/lib/saved-pages";

// In-process poller (docs/tech-stack.md): every tick, refresh feeds whose
// next_fetch_at has passed. No Redis/queue — the queue is a column. If this ever
// needs to scale out, promote to a real queue and claim rows with SKIP LOCKED.

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 60_000);
const INITIAL_DELAY_MS = 5_000;
const BATCH_LIMIT = 50;
const CONCURRENCY = 4;

interface SchedulerState {
  timer: NodeJS.Timeout | null;
  running: boolean;
}

// Stash state on globalThis so dev HMR reloading this module doesn't spawn a
// second interval alongside the first.
const globalRef = globalThis as unknown as {
  __rssappScheduler?: SchedulerState;
};
if (!globalRef.__rssappScheduler) {
  globalRef.__rssappScheduler = { timer: null, running: false };
}
const state: SchedulerState = globalRef.__rssappScheduler;

async function tick(): Promise<void> {
  // Skip if the previous tick is still running (a slow pass must not overlap).
  if (state.running) return;
  state.running = true;
  try {
    const summary = await refreshDueFeeds({
      limit: BATCH_LIMIT,
      concurrency: CONCURRENCY,
    });
    if (summary.due > 0) {
      console.log(
        `[scheduler] refreshed ${summary.due} feed(s), +${summary.itemsAdded} item(s), ${summary.errors} error(s)`,
      );
    }
    const fullContent = await sweepPendingFullContent();
    if (fullContent.claimed > 0) {
      console.log(
        `[scheduler] full text: ${fullContent.extracted} extracted, ${fullContent.reused} reused, ${fullContent.retried} retrying, ${fullContent.unavailable} unavailable`,
      );
    }
    const swept = await sweepAutoRead();
    if (swept > 0) {
      console.log(`[scheduler] auto-read swept ${swept} item(s)`);
    }
    const extracted = await sweepPendingSavedPages();
    if (extracted > 0) {
      console.log(`[scheduler] extracted ${extracted} saved page(s)`);
    }
    const digests = await sweepNotificationDigests();
    if (digests.created > 0 || digests.claimed > 0) {
      console.log(
        `[scheduler] notification digests: ${digests.sent} sent, ${digests.skipped} skipped, ${digests.retrying} retrying, ${digests.failed} failed`,
      );
    }
    const backups = await writeScheduledBackups();
    if (backups.written > 0 || backups.failed > 0) {
      console.log(
        `[scheduler] wrote ${backups.written} backup(s), ${backups.failed} failed`,
      );
    }
  } catch (err) {
    console.error("[scheduler] tick failed:", err);
  } finally {
    state.running = false;
  }
}

export function startScheduler(): void {
  if (state.timer) return; // already running in this process
  console.log(
    `[scheduler] starting; tick every ${Math.round(TICK_MS / 1000)}s`,
  );
  state.timer = setInterval(tick, TICK_MS);
  // Run once shortly after boot so a restart catches up without waiting a full tick.
  setTimeout(tick, INITIAL_DELAY_MS);
}
