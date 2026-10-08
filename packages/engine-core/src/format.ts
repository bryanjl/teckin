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
