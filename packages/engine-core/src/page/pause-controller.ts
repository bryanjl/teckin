/** Why the game is paused. More than one reason can hold at once. */
export type PauseReason = 'hidden' | 'player';

/**
 * Tracks why a game is paused. The game runs only when no reason holds, so a player who
 * paused, switched apps and came back is still paused until they press resume.
 */
export class PauseController {
  private readonly reasons = new Set<PauseReason>();
  private readonly listeners = new Set<(paused: boolean, reasons: PauseReason[]) => void>();

  /** True while any pause reason holds. */
  get isPaused(): boolean {
    return this.reasons.size > 0;
  }

  /** The reasons currently holding the game paused. */
  get activeReasons(): PauseReason[] {
    return [...this.reasons];
  }

  /** Adds a pause reason. */
  pause(reason: PauseReason): void {
    if (this.reasons.has(reason)) return;
    this.reasons.add(reason);
    this.notify();
  }

  /** Removes a pause reason. The game resumes once none remain. */
  resume(reason: PauseReason): void {
    if (!this.reasons.delete(reason)) return;
    this.notify();
  }

  /** Toggles the player's own pause, for the pause button. */
  togglePlayerPause(): void {
    if (this.reasons.has('player')) this.resume('player');
    else this.pause('player');
  }

  /** Subscribes to changes; the listener also hears reason changes that keep the game paused. */
  onChange(listener: (paused: boolean, reasons: PauseReason[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.isPaused, this.activeReasons);
  }
}

/**
 * Pauses `controller` with reason `hidden` while the tab is hidden (phone locked, app
 * switched) and lifts it when the tab is shown. Returns a function that stops watching.
 */
export function pauseWhenHidden(document: Document, controller: PauseController): () => void {
  const window = document.defaultView;
  const sync = (): void => {
    if (document.visibilityState === 'hidden') controller.pause('hidden');
    else controller.resume('hidden');
  };
  document.addEventListener('visibilitychange', sync);
  window?.addEventListener('pagehide', sync);
  window?.addEventListener('pageshow', sync);
  sync();
  return () => {
    document.removeEventListener('visibilitychange', sync);
    window?.removeEventListener('pagehide', sync);
    window?.removeEventListener('pageshow', sync);
  };
}
