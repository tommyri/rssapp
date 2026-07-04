import { refreshDueFeeds } from "@/lib/feeds";
import { sweepAutoRead } from "@/lib/reader";

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
    const swept = await sweepAutoRead();
    if (swept > 0) {
      console.log(`[scheduler] auto-read swept ${swept} item(s)`);
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
