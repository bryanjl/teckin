import type { RoomConnection } from './network-session';

/** A Colyseus SDK signal: call it to listen, `.remove` to stop. */
interface SdkSignal<Listener> {
  (listener: Listener): unknown;
  remove(listener: Listener): void;
}

/**
 * The parts of a Colyseus SDK `Room` this package uses, typed structurally so the session
 * package does not depend on the SDK.
 */
export interface SdkRoomLike {
  send(type: string, payload?: unknown): void;
  request(type: string, payload?: unknown): Promise<unknown>;
  onMessage(type: string, listener: (payload: unknown) => void): () => void;
  readonly state: unknown;
  onStateChange: SdkSignal<(state: unknown) => void>;
}

/** Wraps a joined Colyseus SDK room as the {@link RoomConnection} a session talks through. */
export function sdkRoomConnection(room: SdkRoomLike): RoomConnection {
  return {
    send: (type, payload) => room.send(type, payload),
    request: (type, payload) => room.request(type, payload),
    onMessage: (type, listener) => room.onMessage(type, listener),
    state: () => room.state,
    onStateChange: (listener) => {
      room.onStateChange(listener);
      return () => room.onStateChange.remove(listener);
    },
  };
}
