import { describe, expect, it } from 'vitest';
import { MapFormatError, loadTiledMap, objectsOfType, singleObjectOfType } from './tiled';

/** A 4 × 3 map as Tiled 1.11 writes it (trimmed of editor-only fields). */
function sampleMap(): Record<string, unknown> {
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: 4,
    height: 3,
    tilewidth: 32,
    tileheight: 32,
    properties: [{ name: 'title', type: 'string', value: 'Sample' }],
    tilesets: [
      {
        firstgid: 1,
        name: 'course',
        tilewidth: 32,
        tileheight: 32,
        tilecount: 2,
        columns: 0,
        tiles: [
          {
            id: 0,
            image: 'ground.svg',
            properties: [
              { name: 'collision', type: 'string', value: 'solid' },
              { name: 'frame', type: 'string', value: 'tile-ground' },
            ],
          },
          {
            id: 1,
            image: 'platform.svg',
            properties: [
              { name: 'collision', type: 'string', value: 'oneWay' },
              { name: 'frame', type: 'string', value: 'tile-platform' },
            ],
          },
        ],
      },
    ],
    layers: [
      {
        id: 1,
        type: 'tilelayer',
        name: 'terrain',
        width: 4,
        height: 3,
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
        // The third tile is flipped horizontally: flag bits must be ignored.
        data: [0, 2, 0x80000002, 0, 0, 0, 0, 0, 1, 1, 1, 1],
      },
      {
        id: 2,
        type: 'objectgroup',
        name: 'markers',
        objects: [
          { id: 1, name: 'start', type: 'spawn', x: 16, y: 96, width: 0, height: 0, point: true },
          {
            id: 2,
            name: '',
            type: 'goal',
            x: 32,
            y: 0,
            width: 64,
            height: 32,
            properties: [{ name: 'index', type: 'int', value: 1 }],
          },
        ],
      },
    ],
  };
}

describe('loadTiledMap', () => {
  it('reads size, collision, drawn tiles, objects and properties', () => {
    const map = loadTiledMap(sampleMap());
    expect(map).toMatchObject({ columns: 4, rows: 3, tileSize: 32 });
    expect(map.properties).toEqual({ title: 'Sample' });
    expect(map.grid.at(1, 0)).toBe('oneWay');
    expect(map.grid.at(2, 0)).toBe('oneWay');
    expect(map.grid.at(0, 0)).toBe('empty');
    expect(map.grid.at(3, 2)).toBe('solid');
    expect(map.tiles).toHaveLength(6);
    expect(map.tiles[0]).toEqual({ column: 1, row: 0, frame: 'tile-platform', layer: 'terrain' });
    expect(singleObjectOfType(map, 'spawn')).toMatchObject({ x: 16, y: 96, name: 'start' });
    expect(objectsOfType(map, 'goal')[0]?.properties).toEqual({ index: 1 });
  });

  it('rejects maps it cannot read', () => {
    const isometric = { ...sampleMap(), orientation: 'isometric' };
    expect(() => loadTiledMap(isometric)).toThrow(MapFormatError);
    const shortLayer = sampleMap();
    (shortLayer.layers as { data?: number[] }[])[0]!.data = [0, 1];
    expect(() => loadTiledMap(shortLayer)).toThrow(/wrong number of tiles/);
    const unknownTile = sampleMap();
    (unknownTile.layers as { data?: number[] }[])[0]!.data![0] = 9;
    expect(() => loadTiledMap(unknownTile)).toThrow(/unknown tile 9/);
    expect(() => loadTiledMap('not a map')).toThrow(MapFormatError);
  });

  it('rejects an unknown collision value', () => {
    const map = sampleMap();
    const tileset = (map.tilesets as { tiles: { properties: { value: string }[] }[] }[])[0]!;
    tileset.tiles[0]!.properties[0]!.value = 'sticky';
    expect(() => loadTiledMap(map)).toThrow(/unknown collision "sticky"/);
  });

  it('requires exactly one object for singleObjectOfType', () => {
    const map = loadTiledMap(sampleMap());
    expect(() => singleObjectOfType(map, 'missing')).toThrow(/found 0/);
  });
});
