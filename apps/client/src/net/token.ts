/**
 * The phone's private player token (REQ-RECON-1). Stored in localStorage so a reload or a
 * locked screen rejoins the same seat. `?as=<name>` keeps a separate token per profile,
 * which lets one browser act as several phones while testing.
 */

const BASE_KEY = 'iw-player-token';
const memory = new Map<string, string>();

function storageKey(search: string): string {
  const profile = new URLSearchParams(search)
    .get('as')
    ?.replace(/[^\w-]/g, '')
    .slice(0, 24);
  return profile ? `${BASE_KEY}:${profile}` : BASE_KEY;
}

/** 22 url-safe characters from crypto.getRandomValues (works without HTTPS). */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

export function playerToken(search = location.search): string {
  const key = storageKey(search);
  let token = read(key);
  if (!token || !/^[\w-]{16,128}$/.test(token)) {
    token = newToken();
    write(key, token);
  }
  return token;
}
