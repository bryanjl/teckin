import type { RealtimeChannel } from '@teckin/game-contracts';
import { describe, expect, it } from 'vitest';
import { bundledCourseMap, createClimberCourse } from '../course/course';
import {
  climberClientMessageTypes,
  climberRequestTypes,
  climberServerMessageTypes,
  type ClimberPlacement,
  type MoveReport,
} from '../protocol';
import { defaultClimberTunables } from '../tunables';
import { ClimberLink } from './climber-link';
import { ClimberRun } from './climber-run';

const tunables = defaultClimberTunables;
const course = createClimberCourse(bundledCourseMap, tunables);

function createChannel(placement: ClimberPlacement) {
  const sent: { type: string; payload: unknown }[] = [];
  const listeners = new Map<string, (payload: unknown) => void>();
  const channel: RealtimeChannel = {
    playerId: 'p1',
    send: (type, payload) => sent.push({ type, payload }),
    request: async <Reply>(type: string) => {
      if (type !== climberRequestTypes.placement) throw new Error(type);
      return placement as Reply;
    },
    onMessage: (type, listener) => {
      listeners.set(type, listener);
      return () => listeners.delete(type);
    },
  };
  return {
    channel,
    sent,
    reports: () =>
      sent
        .filter((item) => item.type === climberClientMessageTypes.move)
        .map((item) => item.payload as MoveReport),
    push: (type: string, payload: unknown) => listeners.get(type)?.(payload),
    listening: () => listeners.size,
  };
}

const energy = { energy: 1_000, spendEnergy: () => true };

describe('ClimberLink', () => {
  it('reports the feet about ten times a second of play', () => {
    const run = new ClimberRun(course, tunables, energy, false);
    const room = createChannel({
      ...course.spawn,
      summitsReached: 0,
      finished: false,
      correctionId: 0,
    });
    const link = new ClimberLink(run, room.channel);
    const step = tunables.physics.fixedStep;
    for (let index = 0; index < 120; index += 1) {
      run.step({ left: false, right: true, jumpHeld: false, jumpPressed: false });
      link.afterStep(step);
    }
    const reports = room.reports();
    expect(reports).toHaveLength(10);
    expect(reports.map((report) => report.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(reports[9]).toMatchObject({ x: run.foot.x, y: run.foot.y, summits: 0, correctionId: 0 });
  });

  it('restores the position and summits the room has for a rejoining device', async () => {
    const run = new ClimberRun(course, tunables, energy, true);
    const summit = course.summits[1]!;
    const room = createChannel({
      x: summit.respawnX,
      y: summit.respawnY,
      summitsReached: 2,
      finished: false,
      correctionId: 3,
    });
    const link = new ClimberLink(run, room.channel);
    await link.restore();
    expect(run.foot).toEqual({ x: summit.respawnX, y: summit.respawnY });
    expect(run.progress.goalsReached).toBe(2);
    link.report();
    expect(room.reports()[0]?.correctionId).toBe(3);
  });

  it('puts the player back on a correction, once, and echoes its id', () => {
    const run = new ClimberRun(course, tunables, energy, false);
    const room = createChannel({
      ...course.spawn,
      summitsReached: 0,
      finished: false,
      correctionId: 0,
    });
    let corrected = 0;
    const link = new ClimberLink(run, room.channel, { onCorrection: () => (corrected += 1) });
    run.placeAt(course.spawn.x + 64, course.spawn.y - 300);
    const correction = { ...course.spawn, summitsReached: 0, finished: false, correctionId: 1 };
    room.push(climberServerMessageTypes.correction, correction);
    room.push(climberServerMessageTypes.correction, correction);
    expect(run.foot).toEqual(course.spawn);
    expect(link.corrections).toBe(1);
    expect(corrected).toBe(1);
    link.report();
    expect(room.reports()[0]?.correctionId).toBe(1);
    link.dispose();
    expect(room.listening()).toBe(0);
  });
});
