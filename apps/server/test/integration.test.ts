import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type HostView, IMPOSTER_HEADLINE, type PlayerView } from '@imposter-who/core';
import { type Client, type Harness, startHarness } from './harness.ts';

let h: Harness;
afterEach(async () => {
  await h?.close();
});

type Phone = Client<PlayerView>;

/** Host + N joined phones, with every view settled in the lobby. */
async function table(count: number, settings: Record<string, unknown> = {}) {
  const host = await h.host();
  if (Object.keys(settings).length) await host.ok('settings:update', settings);
  const phones: Phone[] = [];
  for (let i = 0; i < count; i++) {
    const phone = await h.phone();
    await phone.ok('player:join', { name: `P${i}` });
    phones.push(phone);
  }
  await host.waitFor((v) => v.players.length === count);
  return { host, phones };
}

async function startRound(host: Client<HostView>, phones: Phone[]) {
  await host.ok('round:start');
  await Promise.all(phones.map((p) => p.waitFor((v) => v.phase === 'reveal' && !!v.you?.ticket)));
  const imposter = phones.find((p) => p.view.you!.ticket!.headline === IMPOSTER_HEADLINE)!;
  const civilians = phones.filter((p) => p !== imposter);
  return { imposter, civilians, word: civilians[0]!.view.you!.ticket!.headline };
}

const byId = (phones: Phone[], id: string | null | undefined) =>
  phones.find((p) => p.view.you?.id === id)!;

describe('integration: a full typed round over real sockets', () => {
  it('plays from check-in to result without leaking the secret', async () => {
    h = await startHarness();
    const { host, phones } = await table(4);
    const { imposter, civilians, word } = await startRound(host, phones);

    // REQ-SEC-1: the board knows neither the word nor the imposter.
    expect(JSON.stringify(host.view).toLowerCase()).not.toContain(word.toLowerCase());
    expect(host.view.round!.imposterId).toBeNull();
    expect(civilians).toHaveLength(3);

    for (const p of phones) await p.ok('ticket:torn');
    await host.waitFor((v) => v.phase === 'clues');

    let n = 0;
    while (host.view.phase === 'clues') {
      const current = byId(phones, host.view.round!.currentPlayerId);
      await current.ok('clue:submit', { text: `qzx${'abcdefgh'[n++]}` });
      await host.waitFor((v) => v.round!.clues.length === n);
    }
    expect(host.view.phase).toBe('discussion');
    expect(host.view.round!.clues.map((c) => c.text)).toEqual(['qzxa', 'qzxb', 'qzxc', 'qzxd']);

    await host.ok('phase:skip');
    await host.waitFor((v) => v.phase === 'voting');
    const imposterId = imposter.view.you!.id;
    for (const p of phones) {
      const target = p === imposter ? civilians[0]!.view.you!.id : imposterId;
      await p.ok('vote:cast', { targetId: target });
    }
    await host.waitFor((v) => v.phase === 'voteReveal');
    expect(host.view.round!.ballots[0]!.ejectedId).toBe(imposterId);

    await host.ok('reveal:done');
    await host.waitFor((v) => v.phase === 'lastChance');
    expect(host.view.round!.imposterId).toBe(imposterId);

    await imposter.ok('guess:submit', { text: 'definitely-not-it' });
    const result = await host.waitFor((v) => v.phase === 'result');
    expect(result.round!.outcome).toMatchObject({ winner: 'civilians', reason: 'lastChanceWrong' });
    expect(result.round!.word!.word).toBe(word);
    expect(result.round!.overrideOpen).toBe(true);
    for (const c of civilians)
      expect(result.players.find((p) => p.id === c.view.you!.id)!.score).toBe(1);

    // Cues reach every screen, phones included.
    await phones[0]!.waitForCue('result');
  });

  it('rejects a civilian clue privately and keeps the turn', async () => {
    h = await startHarness();
    const { host, phones } = await table(3);
    const { imposter, word } = await startRound(host, phones);
    for (const p of phones) await p.ok('ticket:torn');
    await host.waitFor((v) => v.phase === 'clues');

    while (host.view.round!.currentPlayerId === imposter.view.you!.id) {
      await imposter.ok('clue:submit', { text: 'qzxq' });
      await host.waitFor((v) => v.round!.clues.length === 1);
    }
    const current = byId(phones, host.view.round!.currentPlayerId);
    const ack = await current.emit('clue:submit', { text: word.replace(/[^\p{L}]/gu, '') });
    expect(ack).toMatchObject({ ok: false, code: 'CLUE_TOO_CLOSE' });
    expect(host.view.round!.currentPlayerId).toBe(current.view.you!.id);
  });
});

describe('integration: spoken mode (REQ-CLUE-3)', () => {
  it('advances on Done taps and the host can advance too', async () => {
    h = await startHarness();
    const { host, phones } = await table(3, { clueMode: 'spoken' });
    await startRound(host, phones);
    await host.ok('phase:continue');
    await host.waitFor((v) => v.phase === 'clues');

    const first = byId(phones, host.view.round!.currentPlayerId);
    await first.waitFor((v) => v.you!.isTurn);
    await first.ok('turn:done');
    await host.waitFor((v) => v.round!.clues.length === 1);
    await host.ok('phase:skip');
    await host.waitFor((v) => v.round!.clues.length === 2);
    expect(host.view.round!.clues.map((c) => c.status)).toEqual(['spoken', 'spoken']);
  });

  it('plays a full spoken round to a result', async () => {
    h = await startHarness();
    const { host, phones } = await table(4, { clueMode: 'spoken' });
    const { imposter, civilians } = await startRound(host, phones);
    for (const p of phones) await p.ok('ticket:torn');
    await host.waitFor((v) => v.phase === 'clues');

    for (let n = 1; n <= 4; n++) {
      await byId(phones, host.view.round!.currentPlayerId).ok('turn:done');
      await host.waitFor((v) => v.round!.clues.length === n);
    }
    await host.waitFor((v) => v.phase === 'discussion');
    await host.ok('phase:skip');
    await host.waitFor((v) => v.phase === 'voting');

    // Everyone votes the same civilian out: the imposter wins.
    const victim = civilians[0]!.view.you!.id;
    for (const p of phones) {
      await p.ok('vote:cast', { targetId: p === civilians[0] ? imposter.view.you!.id : victim });
    }
    await host.waitFor((v) => v.phase === 'voteReveal');
    await host.ok('reveal:done');
    const result = await host.waitFor((v) => v.phase === 'result');
    expect(result.round!.outcome).toMatchObject({ winner: 'imposter', reason: 'civilianVotedOut' });
    expect(result.round!.clues.every((c) => c.status === 'spoken' && c.text === null)).toBe(true);
  });
});

describe('integration: clock sync', () => {
  it('answers time pings with the server clock', async () => {
    h = await startHarness();
    const phone = await h.phone();
    const before = Date.now();
    const reply = (await phone.socket.timeout(1000).emitWithAck('time:ping', { t0: 123 })) as {
      t0: number;
      server: number;
    };
    expect(reply.t0).toBe(123);
    expect(reply.server).toBeGreaterThanOrEqual(before);
    expect(reply.server).toBeLessThanOrEqual(Date.now());
    expect(phone.states.at(-1)!.serverNow).toBeGreaterThan(0);
  });
});

describe('integration: reconnection (REQ-RECON-1, REQ-RECON-2)', () => {
  it('restores seat, name and secret from the stored token', async () => {
    h = await startHarness();
    const { host, phones } = await table(3);
    await startRound(host, phones);
    const phone = phones[1]!;
    const before = phone.view.you!;
    const token = (phone.auth as { token: string }).token;

    phone.socket.disconnect();
    const again = await h.phone(token);
    const view = await again.waitFor((v) => !!v.you);
    expect(view.you).toEqual(before);
    // Back inside the grace window: the board never showed them offline.
    expect(host.states.every((s) => s.view.players.every((p) => p.connected))).toBe(true);
  });

  it('shows a player offline after the grace period and back online on return', async () => {
    h = await startHarness();
    const { host, phones } = await table(3);
    const phone = phones[0]!;
    const id = phone.view.you!.id;
    const token = (phone.auth as { token: string }).token;

    phone.socket.disconnect();
    await host.waitFor((v) => v.players.find((p) => p.id === id)!.connected === false);
    await h.phone(token);
    await host.waitFor((v) => v.players.find((p) => p.id === id)!.connected === true);
  });

  it('a fresh phone is not joined until it checks in', async () => {
    h = await startHarness();
    const phone = await h.phone();
    await phone.waitFor((v) => v.phase === 'lobby');
    expect(phone.view.you).toBeNull();
    expect(await phone.emit('ticket:torn')).toMatchObject({ ok: false, code: 'UNKNOWN_PLAYER' });
    await phone.ok('player:join', { name: 'Zoe' });
    expect(await phone.emit('player:join', { name: 'Zoe2' })).toMatchObject({
      code: 'ALREADY_JOINED',
    });
  });
});

describe('integration: host display (REQ-RECON-5, REQ-CONN-3)', () => {
  it('rebuilds the board after a reload with no change to the game', async () => {
    h = await startHarness();
    const { host, phones } = await table(3);
    await startRound(host, phones);
    const version = host.states.at(-1)!.version;
    host.socket.disconnect();
    const reloaded = await h.host();
    const view = await reloaded.waitFor((v) => v.phase === 'reveal');
    expect(reloaded.states.at(-1)!.version).toBe(version);
    expect(view.players).toHaveLength(3);
  });

  it('refuses host commands from players', async () => {
    h = await startHarness();
    const { phones } = await table(3);
    // Host events are not registered on player sockets, so they are ignored (no ack).
    await expect(phones[0]!.socket.timeout(200).emitWithAck('round:start')).rejects.toThrow();
  });

  it('a phone cannot get the host token or open a host socket', async () => {
    h = await startHarness({ trustProxy: true });
    const phoneHeaders = { 'x-forwarded-for': '192.168.1.50' };
    const res = await fetch(`${h.url}/api/host-session`, { headers: phoneHeaders });
    expect(res.status).toBe(403);

    const real = h.server.hostToken;
    const { Client } = await import('./harness.ts');
    await expect(
      Client.connect(h.url, { kind: 'host', hostToken: real }, phoneHeaders),
    ).rejects.toThrow('NOT_HOST');
    await expect(Client.connect(h.url, { kind: 'host', hostToken: 'wrong' })).rejects.toThrow(
      'NOT_HOST',
    );
  });

  it('kicks a removed player and lets them check in again', async () => {
    h = await startHarness();
    const { host, phones } = await table(3);
    const gone = phones[2]!;
    await host.ok('player:remove', { id: gone.view.you!.id });
    await gone.waitFor((v) => v.you === null);
    expect(gone.kicked).toBe(true);
    await gone.ok('player:join', { name: 'Back' });
    await host.waitFor((v) => v.players.some((p) => p.name === 'Back'));
  });
});

describe('integration: abuse limits', () => {
  it('rate-limits a socket that floods intents', async () => {
    h = await startHarness({ ratePerSecond: 5 });
    const phone = await h.phone();
    const acks = await Promise.all(Array.from({ length: 12 }, () => phone.emit('ticket:torn')));
    expect(acks.filter((a) => !a.ok && a.code === 'RATE_LIMITED').length).toBeGreaterThanOrEqual(6);
  });

  it('rejects a bad player token at the handshake', async () => {
    h = await startHarness();
    await expect(h.phone('short')).rejects.toThrow('BAD_REQUEST');
  });

  it('survives garbage payloads', async () => {
    h = await startHarness();
    const { host } = await table(3);
    expect(await host.emit('seat:reorder', 'nope')).toMatchObject({
      ok: false,
      code: 'SEATS_INVALID',
    });
    expect(await host.emit('settings:update', { laps: 'many' })).toMatchObject({
      code: 'SETTINGS_INVALID',
    });
    expect(await host.emit('timer:add', null)).toMatchObject({ ok: false });
  });
});

describe('integration: HTTP', () => {
  it('serves join info with a QR code to the host only', async () => {
    h = await startHarness();
    expect((await fetch(`${h.url}/api/join-info`)).status).toBe(403);
    const res = await fetch(`${h.url}/api/join-info?port=5173`, {
      headers: { 'x-host-token': h.server.hostToken },
    });
    const body = (await res.json()) as { url: string; qrSvg: string };
    expect(body.url).toBe('http://192.168.1.23:5173/play');
    expect(body.qrSvg).toContain('<svg');
  });

  it('edits custom categories (REQ-WORD-2) and validates them', async () => {
    h = await startHarness();
    const headers = { 'x-host-token': h.server.hostToken, 'content-type': 'application/json' };
    const put = await fetch(`${h.url}/api/categories`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ custom: [{ name: 'Inside jokes', words: ['tita', 'karaoke'] }] }),
    });
    const body = (await put.json()) as {
      builtIn: { wordCount: number }[];
      custom: { id: string }[];
    };
    expect(body.custom).toHaveLength(1);
    expect(body.builtIn[0]).not.toHaveProperty('words');
    expect(h.server.store.library().some((c) => c.id === body.custom[0]!.id)).toBe(true);

    const bad = await fetch(`${h.url}/api/categories`, {
      method: 'PUT',
      headers,
      body: '{"custom":5}',
    });
    expect(bad.status).toBe(400);
    const broken = await fetch(`${h.url}/api/categories`, {
      method: 'PUT',
      headers,
      body: '{oops',
    });
    expect(broken.status).toBe(400);
  });

  it('plays a round with a custom category', async () => {
    h = await startHarness();
    const headers = { 'x-host-token': h.server.hostToken, 'content-type': 'application/json' };
    const res = await fetch(`${h.url}/api/categories`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ custom: [{ name: 'Only one', words: ['adobo'] }] }),
    });
    const { custom } = (await res.json()) as { custom: { id: string }[] };
    const { host, phones } = await table(3, { categories: [custom[0]!.id] });
    const { word } = await startRound(host, phones);
    expect(word).toBe('adobo');
  });

  it('persists settings changed from the board (REQ-LOBBY-3)', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'iw-persist-'));
    h = await startHarness({ dataDir });
    const host = await h.host();
    await host.ok('settings:update', { laps: 3 });
    await h.close();
    h = await startHarness({ dataDir });
    const again = await h.host();
    const view = await again.waitFor(() => true);
    expect(view.settings.laps).toBe(3);
  });

  it('serves the built client at /host and /play when present', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'iw-dist-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'host.html'), '<title>board</title>');
    writeFileSync(join(dist, 'play.html'), '<title>ticket</title>');
    writeFileSync(join(dist, 'assets', 'a.js'), 'x');
    h = await startHarness({ clientDist: dist });
    expect(await (await fetch(`${h.url}/host`)).text()).toContain('board');
    expect(await (await fetch(`${h.url}/play`)).text()).toContain('ticket');
    expect((await fetch(`${h.url}/assets/a.js`)).status).toBe(200);
    const root = await fetch(`${h.url}/`, { redirect: 'manual' });
    expect(root.headers.get('location')).toBe('/host');
  });
});

describe('integration: public mode over a tunnel', () => {
  const KEY = 'test-host-key-123456';

  it('does not trust loopback: the host key is required for a host session', async () => {
    h = await startHarness({ hostKey: KEY });
    // Tunnel traffic arrives from 127.0.0.1, exactly like this request.
    expect((await fetch(`${h.url}/api/host-session`)).status).toBe(403);
    expect((await fetch(`${h.url}/api/host-session?key=wrong-key-000000`)).status).toBe(403);
    const ok = await fetch(`${h.url}/api/host-session?key=${KEY}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ hostToken: h.server.hostToken, mode: 'public' });
  });

  it('host sockets need the token, not a loopback address', async () => {
    h = await startHarness({ hostKey: KEY, trustProxy: true });
    const { Client } = await import('./harness.ts');
    await expect(Client.connect(h.url, { kind: 'host', hostToken: 'nope' })).rejects.toThrow(
      'NOT_HOST',
    );
    // A host somewhere else on the internet still connects with the real token.
    const host = await Client.connect(
      h.url,
      { kind: 'host', hostToken: h.server.hostToken },
      { 'x-forwarded-for': '203.0.113.9' },
    );
    expect(host.socket.connected).toBe(true);
  });

  it('builds the join link and QR from the public origin', async () => {
    h = await startHarness({ hostKey: KEY });
    const headers = { 'x-host-token': h.server.hostToken };
    const origin = encodeURIComponent('https://example-words.trycloudflare.com');
    const res = await fetch(`${h.url}/api/join-info?origin=${origin}`, { headers });
    const body = (await res.json()) as { mode: string; url: string; qrSvg: string };
    expect(body).toMatchObject({
      mode: 'public',
      url: 'https://example-words.trycloudflare.com/play',
    });
    expect(body.qrSvg).toContain('<svg');
    const bad = await fetch(`${h.url}/api/join-info?origin=javascript:alert(1)`, { headers });
    expect(bad.status).toBe(400);
  });

  it('plays a round end to end in public mode', async () => {
    h = await startHarness({ hostKey: KEY });
    const res = await fetch(`${h.url}/api/host-session?key=${KEY}`);
    const { hostToken } = (await res.json()) as { hostToken: string };
    const { Client } = await import('./harness.ts');
    const host = await Client.connect<HostView>(h.url, { kind: 'host', hostToken });
    const phones: Phone[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await h.phone();
      await p.ok('player:join', { name: `Net${i}` });
      phones.push(p);
    }
    await host.waitFor((v) => v.players.length === 3);
    await host.ok('round:start');
    await host.waitFor((v) => v.phase === 'reveal');
  });

  it('sends the site root to the phone page', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'iw-dist-'));
    writeFileSync(join(dist, 'host.html'), 'h');
    writeFileSync(join(dist, 'play.html'), 'p');
    h = await startHarness({ hostKey: KEY, clientDist: dist });
    const root = await fetch(`${h.url}/`, { redirect: 'manual' });
    expect(root.headers.get('location')).toBe('/play');
  });
});
