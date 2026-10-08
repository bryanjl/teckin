import {
  createHeightScale,
  crumblingLedgesFromTiles,
  loadTiledMap,
  type HazardLayout,
  type MapObject,
  objectsOfType,
  singleObjectOfType,
  type CourseGoal,
  type PlatformerMap,
} from '@teckin/platformer-kit';
import courseMapJson from '../../maps/course.json';
import type { ClimberTunables } from '../tunables';

/** A summit on the course: the zone that counts as reaching it and where to respawn. */
export interface ClimberSummit extends CourseGoal {
  /** 1-based summit number, matching the theme's summit names. */
  number: number;
}

/** The loaded course: map, start, summits and the height readout. */
export interface ClimberCourse {
  map: PlatformerMap;
  /** Where the player's feet start, world pixels. */
  spawn: { x: number; y: number };
  /** Summits in climbing order. */
  summits: ClimberSummit[];
  /** World y of the feet → height in metres shown in the HUD. */
  heightAt: (footY: number) => number;
  /** Moving ledges, vents, barriers and crumbling ledges. */
  hazards: HazardLayout;
}

/**
 * Builds the Climber course from a Tiled map: a `spawn` point, `summit` zones numbered by a
 * `summit` property, and the course height split evenly between the six summits of the full
 * game (so summit 2 of the Phase 1 course is always at a third of the total height).
 */
export function createClimberCourse(
  mapJson: unknown,
  tunables: Pick<ClimberTunables, 'courseHeightMetres' | 'physics' | 'hazards'>,
): ClimberCourse {
  const map = loadTiledMap(mapJson);
  if (map.tileSize !== tunables.physics.tileSize) {
    throw new Error(
      `Course tiles are ${map.tileSize} px; the game expects ${tunables.physics.tileSize}`,
    );
  }
  if (map.columns !== tunables.physics.worldWidthTiles) {
    throw new Error(
      `Course is ${map.columns} tiles wide; the game expects ${tunables.physics.worldWidthTiles}`,
    );
  }
  const spawnObject = singleObjectOfType(map, 'spawn');
  const spawn = { x: spawnObject.x, y: spawnObject.y };

  const summits = objectsOfType(map, 'summit')
    .map((object): ClimberSummit => {
      const number = object.properties.summit;
      if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
        throw new Error(`Summit object ${object.id} needs a whole-number "summit" property`);
      }
      return {
        number,
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        respawnX: object.x + object.width / 2,
        respawnY: object.y + object.height,
      };
    })
    .sort((a, b) => a.number - b.number);
  if (summits.length === 0) throw new Error('The course has no summits');
  summits.forEach((summit, index) => {
    if (summit.number !== index + 1) throw new Error('Summits must be numbered 1, 2, 3…');
  });

  const metresPerSummit = tunables.courseHeightMetres / 6;
  const heightAt = createHeightScale([
    { y: spawn.y, height: 0 },
    ...summits.map((summit) => ({ y: summit.respawnY, height: summit.number * metresPerSummit })),
  ]);
  const hazards: HazardLayout = {
    movingPlatforms: objectsOfType(map, 'movingPlatform').map((object) => ({
      id: String(object.id),
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      travelX: numberProperty(object, 'travelTiles') * map.tileSize,
      periodSeconds: numberProperty(object, 'periodSeconds'),
      phase: numberProperty(object, 'phase', 0),
    })),
    vents: objectsOfType(map, 'vent').map((object) => ({
      ...timedZone(object),
      pushSpeed: numberProperty(object, 'pushSpeed'),
    })),
    barriers: objectsOfType(map, 'barrier').map(timedZone),
    crumblingLedges: crumblingLedgesFromTiles(map.tiles),
    crumbleDelaySeconds: tunables.hazards.crumbleDelaySeconds,
    crumbleRespawnSeconds: tunables.hazards.crumbleRespawnSeconds,
    barrierKnockSpeed: tunables.hazards.barrierKnockSpeed,
  };
  return { map, spawn, summits, heightAt, hazards };
}

function numberProperty(object: MapObject, name: string, fallback?: number): number {
  const value = object.properties[name];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Map object ${object.id} (${object.type}) needs a number "${name}" property`);
}

function timedZone(object: MapObject) {
  return {
    id: String(object.id),
    zone: { x: object.x, y: object.y, width: object.width, height: object.height },
    onSeconds: numberProperty(object, 'onSeconds'),
    offSeconds: numberProperty(object, 'offSeconds'),
    offsetSeconds: numberProperty(object, 'offsetSeconds', 0),
  };
}

/** The bundled course (all six summits). */
export const bundledCourseMap: unknown = courseMapJson;
