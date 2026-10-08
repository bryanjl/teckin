import { defineServerGame } from '@teckin/room-core';
import { climberGame } from '../definition';
import { ClimberRoom } from './climber-room';

/** The Climber as the realtime server registers it. */
export const climberServerGame = defineServerGame({ definition: climberGame, room: ClimberRoom });
