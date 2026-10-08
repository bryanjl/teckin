import { Client, type Room } from '@colyseus/sdk';
import type { PlayerJoinOptions } from '@teckin/game-contracts';

/** Joins a room as a player. Throws what `joinById` throws (see {@link joinProblemFromError}). */
export async function joinAsPlayer(
  baseUrl: string,
  roomId: string,
  options: Omit<PlayerJoinOptions, 'role'>,
): Promise<Room> {
  const client = new Client(baseUrl);
  const joinOptions: PlayerJoinOptions = { role: 'player', ...options };
  return client.joinById(roomId, joinOptions);
}

/** Rooms joined on `/join`, handed to `/play/[code]` without leaving and joining again. */
const joinedRooms = new Map<string, Room>();

/** Keeps a joined room for the play page of `code`. */
export function handOverRoom(code: string, room: Room): void {
  joinedRooms.set(code, room);
}

/** Takes the room `/join` joined for `code`, if there is one. */
export function takeHandedOverRoom(code: string): Room | undefined {
  const room = joinedRooms.get(code);
  joinedRooms.delete(code);
  return room;
}
