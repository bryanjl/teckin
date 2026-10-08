import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceFolder = new URL('.', import.meta.url).pathname;

describe('room-core boundaries', () => {
  it('never imports a game (the lint rule enforces this too)', () => {
    const offenders = readdirSync(sourceFolder, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) =>
        /from\s+['"](@teckin\/climber|[./]*games\/)/.test(
          readFileSync(join(sourceFolder, file), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
