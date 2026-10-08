/**
 * Input abstraction. Games read named actions, never raw keys or touches, so keyboard,
 * touch and future gamepad or tap-to-move sources all drive the same game code.
 *
 * Each source (a key, a touch pointer, a gamepad button) presses and releases an action
 * under its own source id. An action stays held while any source holds it, so releasing the
 * keyboard does not cancel a finger that is still on the touch button.
 */
export class ActionState<Action extends string> {
  private readonly holders = new Map<Action, Set<string>>();
  private readonly pressedSinceLastFrame = new Set<Action>();
  private readonly releasedSinceLastFrame = new Set<Action>();
  private justPressedThisFrame = new Set<Action>();
  private justReleasedThisFrame = new Set<Action>();
  private readonly listeners = new Set<(action: Action, isDown: boolean) => void>();

  /** Creates the state for a fixed set of actions. */
  constructor(readonly actions: readonly Action[]) {
    for (const action of actions) this.holders.set(action, new Set());
  }

  /** Marks `action` as held by `sourceId`. Repeated presses from the same source are ignored. */
  press(action: Action, sourceId: string): void {
    const sources = this.sourcesFor(action);
    if (sources.has(sourceId)) return;
    const wasDown = sources.size > 0;
    sources.add(sourceId);
    if (!wasDown) {
      this.pressedSinceLastFrame.add(action);
      this.notify(action, true);
    }
  }

  /** Releases `action` for `sourceId`. The action stays down while another source holds it. */
  release(action: Action, sourceId: string): void {
    const sources = this.sourcesFor(action);
    if (!sources.delete(sourceId)) return;
    if (sources.size === 0) {
      this.releasedSinceLastFrame.add(action);
      this.notify(action, false);
    }
  }

  /** Releases every action held by `sourceId`, for example when a touch is cancelled. */
  releaseSource(sourceId: string): void {
    for (const action of this.actions) this.release(action, sourceId);
  }

  /** Releases everything. Used when the game pauses so no input is stuck down on resume. */
  releaseAll(): void {
    for (const action of this.actions) {
      for (const sourceId of [...this.sourcesFor(action)]) this.release(action, sourceId);
    }
    // A press made while paused must not fire on the first frame after resuming.
    this.pressedSinceLastFrame.clear();
    this.releasedSinceLastFrame.clear();
    this.justPressedThisFrame.clear();
    this.justReleasedThisFrame.clear();
  }

  /** True while any source holds `action`. */
  isDown(action: Action): boolean {
    return this.sourcesFor(action).size > 0;
  }

  /** True during the one frame after `action` went from up to down. */
  justPressed(action: Action): boolean {
    return this.justPressedThisFrame.has(action);
  }

  /** True during the one frame after `action` went from down to up. */
  justReleased(action: Action): boolean {
    return this.justReleasedThisFrame.has(action);
  }

  /** Actions currently held, in declaration order. */
  heldActions(): Action[] {
    return this.actions.filter((action) => this.isDown(action));
  }

  /**
   * Advances one frame: edges that happened since the previous call become visible to
   * `justPressed` and `justReleased` for exactly this frame. Call once at the start of each update.
   */
  beginFrame(): void {
    this.justPressedThisFrame = new Set(this.pressedSinceLastFrame);
    this.justReleasedThisFrame = new Set(this.releasedSinceLastFrame);
    this.pressedSinceLastFrame.clear();
    this.releasedSinceLastFrame.clear();
  }

  /** Subscribes to up/down changes. Returns an unsubscribe function. */
  onChange(listener: (action: Action, isDown: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private sourcesFor(action: Action): Set<string> {
    const sources = this.holders.get(action);
    if (!sources) throw new Error(`Unknown action "${action}"`);
    return sources;
  }

  private notify(action: Action, isDown: boolean): void {
    for (const listener of this.listeners) listener(action, isDown);
  }
}

/** The actions every platformer understands. */
export const platformerActions = ['moveLeft', 'moveRight', 'jump'] as const;

/** One of the platformer actions. */
export type PlatformerAction = (typeof platformerActions)[number];

/** Creates an `ActionState` for the standard platformer actions. */
export function createPlatformerActionState(): ActionState<PlatformerAction> {
  return new ActionState(platformerActions);
}
