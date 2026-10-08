import { runDataRetention, type DataRetentionSummary } from '@teckin/db';
import type { PrismaClient } from '@teckin/db/client';

/** Settings for {@link scheduleDataRetention}. */
export interface RetentionScheduleOptions {
  /** Months player answer data is kept (`PLAYER_DATA_RETENTION_MONTHS`, default 12). */
  playerDataRetentionMonths: number;
  /** Time between runs. */
  intervalMs: number;
  /** Delay before the first run, so a deploy's processes do not all start at once. */
  firstRunAfterMs: number;
  log?: (message: string, details: Record<string, unknown>) => void;
}

/**
 * Runs the data retention job ({@link runDataRetention}) now and then for as long as the
 * process lives. The job is idempotent, so several realtime processes running it is harmless.
 * Returns a function that stops the schedule.
 */
export function scheduleDataRetention(
  database: PrismaClient,
  options: RetentionScheduleOptions,
): () => void {
  const log = options.log ?? ((message, details) => console.info(message, details));
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const summary: DataRetentionSummary = await runDataRetention(database, {
        playerDataRetentionMonths: options.playerDataRetentionMonths,
      });
      log('Data retention run finished', { ...summary });
    } catch (error) {
      log('Data retention run failed', { error });
    } finally {
      running = false;
    }
  };
  let interval: NodeJS.Timeout | undefined;
  const first = setTimeout(() => {
    void run();
    interval = setInterval(() => void run(), options.intervalMs);
    interval.unref();
  }, options.firstRunAfterMs);
  first.unref();
  return () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}

/** Reads a positive whole number from the environment, or the fallback. */
export function positiveIntegerFromEnvironment(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value?.trim());
  return value?.trim() && Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
