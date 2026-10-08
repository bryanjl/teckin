/**
 * Measures how long each room keeps the server busy. A room's work between two state patches
 * (handling client messages, its own tick, and encoding and sending the patch) is one "tick"
 * of that room; the load test and the optional metrics route read these.
 */
export interface RoomWorkMeter {
  /** One patch window of one room: milliseconds of work and connected clients. */
  recordPatchWindow(roomId: string, workMs: number, clientCount: number): void;
}

/** Percentiles of recorded patch windows, in milliseconds. */
export interface RoomWorkSummary {
  windows: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** Rooms that recorded at least one window. */
  rooms: number;
  /** Most clients seen in one room. */
  mostClientsInARoom: number;
}

/**
 * Keeps patch windows in memory (up to `capacity`, oldest dropped) and summarises them.
 * Only used when metrics are switched on; nothing is recorded otherwise.
 */
export class RoomWorkStats implements RoomWorkMeter {
  private samples: number[] = [];
  private readonly roomIds = new Set<string>();
  private mostClients = 0;

  constructor(private readonly capacity = 500_000) {}

  recordPatchWindow(roomId: string, workMs: number, clientCount: number): void {
    if (this.samples.length >= this.capacity) this.samples.shift();
    this.samples.push(workMs);
    this.roomIds.add(roomId);
    this.mostClients = Math.max(this.mostClients, clientCount);
  }

  /** Summarises everything recorded since the last {@link reset}. */
  summary(): RoomWorkSummary {
    const sorted = [...this.samples].sort((left, right) => left - right);
    const at = (fraction: number) =>
      sorted.length === 0
        ? 0
        : sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!;
    const total = sorted.reduce((sum, value) => sum + value, 0);
    return {
      windows: sorted.length,
      meanMs: sorted.length === 0 ? 0 : total / sorted.length,
      p50Ms: at(0.5),
      p95Ms: at(0.95),
      p99Ms: at(0.99),
      maxMs: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
      rooms: this.roomIds.size,
      mostClientsInARoom: this.mostClients,
    };
  }

  reset(): void {
    this.samples = [];
    this.roomIds.clear();
    this.mostClients = 0;
  }
}
