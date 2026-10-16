import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Category, type Settings, seededRng } from '@imposter-who/core';
import { hashToken, isValidPlayerToken, tokensEqual } from '../src/auth.ts';
import { GameHost } from '../src/gameHost.ts';
import { clientAddress, isLoopback, isPrivateIPv4, lanAddresses } from '../src/network.ts';
import { Store } from '../src/store.ts';

const WORDS_DIR = join(import.meta.dirname, '../../../data/words/en');
const tempDir = () => mkdtempSync(join(tmpdir(), 'iw-test-'));

describe('REQ-CONN-1 LAN address discovery', () => {
  const iface = (address: string, internal = false) => ({
    address,
    family: 'IPv4' as const,
    internal,
    netmask: '255.255.255.0',
    mac: '00:00:00:00:00:00',
    cidr: null,
  });

  it('keeps private IPv4, prefers Wi-Fi, drops loopback and virtual adapters', () => {
    const result = lanAddresses({
      Ethernet: [iface('192.168.1.20')],
      'Wi-Fi': [iface('192.168.1.23')],
      'vEthernet (WSL)': [iface('172.20.0.1')],
      'Loopback Pseudo-Interface 1': [iface('127.0.0.1', true)],
      Public: [iface('8.8.8.8')],
    });
    expect(result).toEqual([
      { name: 'Wi-Fi', address: '192.168.1.23' },
      { name: 'Ethernet', address: '192.168.1.20' },
    ]);
  });

  it.each([
    ['10.0.0.5', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['192.168.0.1', true],
    ['8.8.8.8', false],
    ['nonsense', false],
  ])('isPrivateIPv4(%s) is %s', (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected);
  });

  it('recognises loopback in every form Node reports', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopback('192.168.1.5')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
});

describe('REQ-CONN-3 client address behind the dev proxy', () => {
  it('ignores X-Forwarded-For unless trusted', () => {
    expect(clientAddress('127.0.0.1', '192.168.1.9', false)).toBe('127.0.0.1');
  });

  it('uses the last hop, which the proxy appended, so a phone cannot forge loopback', () => {
    expect(clientAddress('127.0.0.1', '127.0.0.1, 192.168.1.9', true)).toBe('192.168.1.9');
  });

  it('only trusts the header from a loopback proxy', () => {
    expect(clientAddress('192.168.1.9', '127.0.0.1', true)).toBe('192.168.1.9');
  });
});

describe('auth helpers', () => {
  it('validates player tokens', () => {
    expect(isValidPlayerToken('abcdefghijklmnop')).toBe(true);
    expect(isValidPlayerToken('short')).toBe(false);
    expect(isValidPlayerToken('has spaces in it!!')).toBe(false);
    expect(isValidPlayerToken(42)).toBe(false);
  });

  it('hashes tokens one way and compares in constant time', () => {
    expect(hashToken('abc')).not.toContain('abc');
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(tokensEqual('same', 'same')).toBe(true);
    expect(tokensEqual('diff', 'same')).toBe(false);
    expect(tokensEqual(undefined, 'same')).toBe(false);
  });
});

describe('REQ-LOBBY-3 / REQ-WORD-2 store', () => {
  it('loads the built-in bank', () => {
    const store = new Store(tempDir(), WORDS_DIR);
    expect(store.builtIn.length).toBeGreaterThanOrEqual(8);
  });

  it('persists settings across restarts and drops invalid saved values', () => {
    const dir = tempDir();
    const store = new Store(dir, WORDS_DIR);
    store.saveSettings({ ...new GameHost({ library: () => [] }).state.settings, laps: 3 });
    expect(new Store(dir, WORDS_DIR).loadSettings().laps).toBe(3);

    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ laps: 9, clueMode: 'spoken' }));
    expect(new Store(dir, WORDS_DIR).loadSettings()).toEqual({ clueMode: 'spoken' });
  });

  it('survives a corrupt settings file', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), '{not json');
    expect(new Store(dir, WORDS_DIR).loadSettings()).toEqual({});
  });

  it('saves custom categories with stable ids and reloads them', () => {
    const dir = tempDir();
    const store = new Store(dir, WORDS_DIR);
    const [saved] = store.setCustomCategories([
      { name: 'Office jokes', words: ['stapler', ['coffee', 'kopi'], ' '] },
    ]);
    expect(saved!.id).toMatch(/^custom-office-jokes-[0-9a-f]{6}$/);
    expect(saved!.words).toEqual([
      { word: 'stapler', aliases: [] },
      { word: 'coffee', aliases: ['kopi'] },
    ]);

    const reloaded = new Store(dir, WORDS_DIR);
    expect(reloaded.customCategories()).toEqual([saved]);
    expect(reloaded.library().map((c) => c.id)).toContain(saved!.id);

    store.setCustomCategories([{ id: saved!.id, name: 'Renamed', words: ['desk'] }]);
    expect(new Store(dir, WORDS_DIR).customCategories()[0]).toMatchObject({
      id: saved!.id,
      name: 'Renamed',
    });
  });

  it.each([
    ['not a list', 'nope'],
    ['blank name', [{ name: ' ', words: [] }]],
    ['long name', [{ name: 'x'.repeat(25), words: [] }]],
    ['long word', [{ name: 'X', words: ['y'.repeat(41)] }]],
  ])('rejects %s without writing', (_, input) => {
    const dir = tempDir();
    const store = new Store(dir, WORDS_DIR);
    expect(() => store.setCustomCategories(input)).toThrow();
    expect(() => readFileSync(join(dir, 'custom-words.json'))).toThrow();
  });
});

describe('GameHost', () => {
  const library: Category[] = [
    { id: 'food', name: 'Food', custom: false, words: [{ word: 'banana', aliases: [] }] },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const host = (onSettingsChanged: (s: Settings) => void = () => {}) =>
    new GameHost({
      library: () => library,
      settings: { categories: ['food'] },
      rng: seededRng(1),
      onSettingsChanged,
    });

  const joinThree = (g: GameHost) => {
    for (const n of ['a', 'b', 'c']) {
      g.dispatch({ type: 'player:join', playerId: n, tokenHash: `t${n}`, name: n });
    }
  };

  it('returns readable rejections as acks', () => {
    const g = host();
    expect(g.dispatch({ type: 'round:start' })).toEqual({
      ok: false,
      code: 'NOT_ENOUGH_PLAYERS',
      message: 'At least 3 connected players are needed.',
    });
  });

  it('coalesces a burst of changes into one flush with all cues', async () => {
    const g = host();
    const flushes: string[][] = [];
    g.onFlush((_state, cues) => flushes.push(cues.map((c) => c.cue)));
    joinThree(g);
    await Promise.resolve();
    expect(flushes).toEqual([['playerJoined', 'playerJoined', 'playerJoined']]);
  });

  it('fires engine timers for real (REQ-CLUE-4)', () => {
    const g = host();
    joinThree(g);
    g.dispatch({ type: 'round:start' });
    g.dispatch({ type: 'phase:continue' });
    const first = g.state.round!.turnOrder[0];
    vi.advanceTimersByTime(29_999);
    expect(g.state.round!.clues).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(g.state.round!.clues[0]).toMatchObject({ playerId: first, status: 'passed' });
  });

  it('cancels timers the engine clears', () => {
    const g = host();
    joinThree(g);
    g.dispatch({ type: 'round:start' });
    g.dispatch({ type: 'phase:continue' });
    g.dispatch({ type: 'lobby:return' });
    vi.advanceTimersByTime(60_000);
    expect(g.state.phase).toBe('lobby');
  });

  it('reschedules when time is added', () => {
    const g = host();
    joinThree(g);
    g.dispatch({ type: 'round:start' });
    g.dispatch({ type: 'phase:continue' });
    g.dispatch({ type: 'timer:add', seconds: 30 });
    vi.advanceTimersByTime(30_000);
    expect(g.state.round!.clues).toHaveLength(0);
    vi.advanceTimersByTime(30_000);
    expect(g.state.round!.clues).toHaveLength(1);
  });

  it('reports settings changes for persistence', () => {
    const saved: unknown[] = [];
    const g = host((s) => saved.push(s));
    g.dispatch({ type: 'settings:update', patch: { laps: 2 } });
    g.dispatch({ type: 'settings:update', patch: { laps: 9 as never } });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ laps: 2 });
  });
});
