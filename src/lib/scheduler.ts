import { db } from "./db";
import { sweep } from "./sins";

interface SchedulerState { started?: boolean; lastSweep: number; tasks: Map<string, () => void> }
const holder = globalThis as typeof globalThis & { __absolvoScheduler?: SchedulerState };
const state: SchedulerState = (holder.__absolvoScheduler ??= { lastSweep: 0, tasks: new Map<string, () => void>() });

/** Sweeps at most once a minute; called from requests too, so a missed timer never strands a confession. */
export function maybeSweep(now = Date.now()) {
  if (now - state.lastSweep < 60_000) return;
  state.lastSweep = now;
  try {
    const report = sweep(now);
    if (report.expired || report.burned || report.consumed.length) console.info("Sweep", { expired: report.expired, burned: report.burned, eaten: report.consumed.length });
    // With secure_delete on, a truncating checkpoint zeroes freed pages instead of leaving them in the WAL.
    db().pragma("wal_checkpoint(TRUNCATE)");
  } catch (error) {
    console.error("Sweep failed", error instanceof Error ? error.message : "unknown");
  }
}

/** Extra periodic work (the Graveyard publisher) registers here, keyed so bundles and reloads never double it. */
export function every5s(name: string, task: () => void) { state.tasks.set(name, task); }

export function startScheduler() {
  if (state.started) return;
  state.started = true;
  maybeSweep();
  const timer = setInterval(() => {
    maybeSweep();
    for (const task of state.tasks.values()) {
      try { task(); } catch (error) { console.error("Scheduled task failed", error instanceof Error ? error.message : "unknown"); }
    }
  }, 5_000);
  timer.unref?.();
}
