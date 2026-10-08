/**
 * Formats a duration for players: `m:ss.t` under an hour (`1:05.3`), `h:mm:ss` beyond.
 * Negative or non-finite input shows as zero.
 */
export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const tenths = Math.floor(safe * 10);
  const totalSeconds = Math.floor(tenths / 10);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (value: number): string => value.toString().padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(secs)}`;
  return `${minutes}:${pad(secs)}.${tenths % 10}`;
}

/**
 * Formats time left on a game clock as `m:ss`, counting whole seconds up so the clock reads
 * `0:01` until time is really out (`0:00`). Negative or non-finite input shows as `0:00`.
 */
export function formatTimeLeft(milliseconds: number): string {
  const safe = Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 0;
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
}
