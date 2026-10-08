import { describe, expect, it } from 'vitest';
import { defaultSignedInPath, safeReturnPath } from './return-path';

describe('safeReturnPath', () => {
  it('keeps paths on this site', () => {
    expect(safeReturnPath('/dashboard')).toBe('/dashboard');
    expect(safeReturnPath('/host/abc?tab=players#top')).toBe('/host/abc?tab=players#top');
  });

  it('refuses anything that could leave the site', () => {
    for (const value of [
      'https://evil.test/',
      '//evil.test',
      '/\\evil.test',
      'javascript:alert(1)',
      'dashboard',
      '',
      undefined,
      ['/dashboard'],
    ]) {
      expect(safeReturnPath(value)).toBe(defaultSignedInPath);
    }
  });
});
