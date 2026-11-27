/**
 * Server-side playout scheduler.
 *
 * Runs inside the Next.js process (started from instrumentation.ts and again
 * from the tick route as a belt-and-braces measure), so armed posts publish on
 * time even when nobody has the console open.
 */

import { runTick } from "./pipeline";

const g = globalThis as typeof globalThis & {
  __reelayScheduler?: ReturnType<typeof setInterval>;
  __schedErr?: string | null;
  __schedAt?: number | null;
};

/** last scheduler failure — surfaced in the console instead of dying silently */
export function schedulerError(): string | null {
  return g.__schedErr ?? null;
}

export function lastTickAt(): number | null {
  return g.__schedAt ?? null;
}

const everyMs = Number(process.env.SCHEDULER_INTERVAL_MS ?? 15_000);

export function schedulerRunning(): boolean {
  return Boolean(g.__reelayScheduler);
}

export function ensureSchedulerRunning(): void {
  if (g.__reelayScheduler) return;
  const timer = setInterval(() => {
    runTick()
      .then(() => {
        g.__schedErr = null;
        g.__schedAt = Date.now();
      })
      .catch((e) => {
        // never swallow: a dead scheduler must be visible in the console
        g.__schedErr = e instanceof Error ? e.message : String(e);
        g.__schedAt = Date.now();
      });
  }, Math.max(5_000, everyMs));
  // don't let the timer hold a shutdown open
  if (typeof timer === "object" && timer && "unref" in timer) {
    (timer as unknown as { unref: () => void }).unref();
  }
  g.__reelayScheduler = timer;
}
