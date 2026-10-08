import { z } from 'zod';
import { CollisionGrid, type TileCollision } from './collision-grid';

/**
 * Loader for maps saved by the Tiled editor as JSON (orthogonal, finite, uncompressed tile
 * layers, embedded tilesets). Only the parts a platformer needs are read; anything else in
 * the file is ignored, so maps stay editable in Tiled.
 *
 * Tile meaning comes from custom properties on tileset tiles:
 * - `frame` (string): the theme atlas frame drawn for the tile.
 * - `collision` (`solid` | `oneWay` | `empty`, default `empty`).
 */

const propertySchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const tileLayerSchema = z.object({
  type: z.literal('tilelayer'),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  data: z.array(z.number().int().nonnegative()),
  visible: z.boolean().optional(),
  properties: z.array(propertySchema).optional(),
});

const objectSchema = z.object({
  id: z.number().int(),
  name: z.string().default(''),
  type: z.string().default(''),
  x: z.number(),
  y: z.number(),
  width: z.number().default(0),
  height: z.number().default(0),
  point: z.boolean().optional(),
  properties: z.array(propertySchema).optional(),
});

const objectLayerSchema = z.object({
  type: z.literal('objectgroup'),
  name: z.string(),
  objects: z.array(objectSchema),
  properties: z.array(propertySchema).optional(),
});

const otherLayerSchema = z.object({ type: z.enum(['imagelayer', 'group']) });

const tilesetSchema = z.object({
  firstgid: z.number().int().positive(),
  name: z.string(),
  tiles: z
    .array(
      z.object({
        id: z.number().int().nonnegative(),
        properties: z.array(propertySchema).optional(),
      }),
    )
    .default([]),
});

const tiledMapSchema = z.object({
  type: z.literal('map').optional(),
  orientation: z.literal('orthogonal'),
  infinite: z.literal(false).optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  layers: z.array(z.union([tileLayerSchema, objectLayerSchema, otherLayerSchema])),
  tilesets: z.array(tilesetSchema),
  properties: z.array(propertySchema).optional(),
});

/** A custom property value from Tiled. */
export type MapPropertyValue = string | number | boolean;

/** One drawn tile. */
export interface MapTile {
  column: number;
  row: number;
  /** Theme atlas frame to draw. */
  frame: string;
  /** Name of the Tiled layer the tile came from, in draw order. */
  layer: string;
}

/** An object from an object layer, in world pixels. Points have zero width and height. */
export interface MapObject {
  id: number;
  name: string;
  /** The object's type (class) in Tiled, e.g. `spawn`. */
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: Record<string, MapPropertyValue>;
}

/** A Tiled map turned into what a platformer needs. */
export interface PlatformerMap {
  columns: number;
  rows: number;
  tileSize: number;
  grid: CollisionGrid;
  tiles: MapTile[];
  objects: MapObject[];
  properties: Record<string, MapPropertyValue>;
}

/** Thrown when a map file is not a Tiled map this loader understands. */
export class MapFormatError extends Error {
  override name = 'MapFormatError';
}

// Tiled stores flip and rotation flags in the top bits of each gid.
const gidFlagMask = 0x1fffffff;

const collisionValues: readonly TileCollision[] = ['empty', 'solid', 'oneWay'];

/** Parses a Tiled JSON map (already decoded from text) into a {@link PlatformerMap}. */
export function loadTiledMap(json: unknown): PlatformerMap {
  const parsed = tiledMapSchema.safeParse(json);
  if (!parsed.success) {
    throw new MapFormatError(`Not a supported Tiled map: ${z.prettifyError(parsed.error)}`);
  }
  const map = parsed.data;
  if (map.tilewidth !== map.tileheight) {
    throw new MapFormatError('Tiles must be square');
  }

  const tileInfo = new Map<number, { frame?: string; collision: TileCollision }>();
  for (const tileset of map.tilesets) {
    for (const tile of tileset.tiles) {
      const properties = toRecord(tile.properties);
      const collision = properties.collision ?? 'empty';
      if (!collisionValues.includes(collision as TileCollision)) {
        throw new MapFormatError(
          `Tile ${tile.id} in tileset "${tileset.name}" has unknown collision "${String(collision)}"`,
        );
      }
      const frame = typeof properties.frame === 'string' ? properties.frame : undefined;
      tileInfo.set(tileset.firstgid + tile.id, {
        ...(frame ? { frame } : {}),
        collision: collision as TileCollision,
      });
    }
  }

  const grid = new CollisionGrid(map.width, map.height, map.tilewidth);
  const tiles: MapTile[] = [];
  const objects: MapObject[] = [];
  for (const layer of map.layers) {
    if (layer.type === 'tilelayer') {
      if (layer.width !== map.width || layer.height !== map.height) {
        throw new MapFormatError(`Layer "${layer.name}" is not the size of the map`);
      }
      if (layer.data.length !== layer.width * layer.height) {
        throw new MapFormatError(`Layer "${layer.name}" has the wrong number of tiles`);
      }
      layer.data.forEach((rawGid, index) => {
        const gid = rawGid & gidFlagMask;
        if (gid === 0) return;
        const info = tileInfo.get(gid);
        if (!info) throw new MapFormatError(`Layer "${layer.name}" uses unknown tile ${gid}`);
        const column = index % layer.width;
        const row = Math.floor(index / layer.width);
        if (info.collision !== 'empty') grid.set(column, row, info.collision);
        if (info.frame && layer.visible !== false) {
          tiles.push({ column, row, frame: info.frame, layer: layer.name });
        }
      });
    } else if (layer.type === 'objectgroup') {
      for (const object of layer.objects) {
        objects.push({
          id: object.id,
          name: object.name,
          type: object.type,
          x: object.x,
          y: object.y,
          width: object.width,
          height: object.height,
          properties: toRecord(object.properties),
        });
      }
    }
  }

  return {
    columns: map.width,
    rows: map.height,
    tileSize: map.tilewidth,
    grid,
    tiles,
    objects,
    properties: toRecord(map.properties),
  };
}

/** Objects of one type, in file order. */
export function objectsOfType(map: PlatformerMap, type: string): MapObject[] {
  return map.objects.filter((object) => object.type === type);
}

/** The single object of `type`; throws when there is none or more than one. */
export function singleObjectOfType(map: PlatformerMap, type: string): MapObject {
  const found = objectsOfType(map, type);
  if (found.length !== 1) {
    throw new MapFormatError(`Expected exactly one "${type}" object, found ${found.length}`);
  }
  return found[0] as MapObject;
}

function toRecord(
  properties: readonly { name: string; value: MapPropertyValue }[] | undefined,
): Record<string, MapPropertyValue> {
  return Object.fromEntries((properties ?? []).map(({ name, value }) => [name, value]));
}
