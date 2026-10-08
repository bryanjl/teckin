import { describe, expect, it } from 'vitest';
import { hostKeyStorageKey } from './browser-storage';
import { hostKeyFromFragment, hostScreenLink, resolveHostKey } from './host-key';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const key = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

describe('host keys', () => {
  it('takes a key from the link fragment and keeps it for the tab', () => {
    const storage = new MemoryStorage();
    expect(resolveHostKey('room1', `#hostKey=${key}`, storage)).toEqual({
      hostKey: key,
      fromFragment: true,
    });
    expect(storage.getItem(hostKeyStorageKey('room1'))).toBe(key);
    expect(resolveHostKey('room1', '', storage)).toEqual({ hostKey: key, fromFragment: false });
  });

  it('has no key without a fragment or a stored one, and ignores malformed keys', () => {
    const storage = new MemoryStorage();
    expect(resolveHostKey('room1', '', storage).hostKey).toBeNull();
    expect(resolveHostKey('room1', '', null).hostKey).toBeNull();
    expect(hostKeyFromFragment('#hostKey=short')).toBeNull();
    expect(hostKeyFromFragment('#hostKey=<script>alert(1)</script>xxxxxxxx')).toBeNull();
    storage.setItem(hostKeyStorageKey('room2'), 'not a key');
    expect(resolveHostKey('room2', '', storage).hostKey).toBeNull();
  });

  it('builds a host screen link whose fragment carries the key back', () => {
    const link = hostScreenLink('http://laptop:3000', 'room 1', key);
    expect(link).toBe(`http://laptop:3000/host/room%201#hostKey=${key}`);
    expect(hostKeyFromFragment(new URL(link).hash)).toBe(key);
  });
});
