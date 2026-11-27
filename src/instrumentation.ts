/**
 * Runs once when the server instance boots (stable since Next 15 — no flag).
 * Boots the playout scheduler and the Telegram poller so the bot works even
 * before the first page view.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { ensureSchedulerRunning } = await import("./lib/scheduler");
    ensureSchedulerRunning();
  } catch {
    /* scheduler starts again on the first /api/tick */
  }

  try {
    const { ensureBotRunning } = await import("./lib/telegram");
    void ensureBotRunning().catch(() => undefined);
  } catch {
    /* bot starts again on the first API request */
  }
}
