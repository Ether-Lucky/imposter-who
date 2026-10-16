/** Host-only REST calls (02-design §5.3). */
import type { Category, RawCategory } from '@imposter-who/core';

let hostToken = '';
const KEY_STORAGE = 'iw-host-key';

/**
 * Public mode: the board is opened with /host?key=... . Keep the key for reloads in this
 * tab only, and take it out of the address bar so it is not shown or shared by accident.
 */
export function takeHostKey(): string | null {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('key');
  if (fromUrl) {
    try {
      sessionStorage.setItem(KEY_STORAGE, fromUrl);
    } catch {
      // Private mode: the key still works for this page load.
    }
    url.searchParams.delete('key');
    history.replaceState(null, '', url);
    return fromUrl;
  }
  try {
    return sessionStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

/**
 * REQ-CONN-3: on a LAN only the laptop gets a token; in public mode only the holder of the
 * host key. Null means this browser may not run the board.
 */
export async function startHostSession(key: string | null): Promise<string | null> {
  const query = key ? `?key=${encodeURIComponent(key)}` : '';
  const res = await fetch(`/api/host-session${query}`, { cache: 'no-store' });
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`host-session ${res.status}`);
  hostToken = ((await res.json()) as { hostToken: string }).hostToken;
  return hostToken;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'x-host-token': hostToken, 'content-type': 'application/json', ...init.headers },
  });
  const body = (await res.json()) as T & { ok: boolean; message?: string };
  if (!res.ok || !body.ok) throw new Error(body.message ?? `Request failed (${res.status})`);
  return body;
}

export interface JoinInfo {
  mode: 'lan' | 'public';
  addresses: { name: string; address: string }[];
  preferred: { name: string; address: string } | null;
  url: string | null;
  qrSvg: string | null;
}

export function getJoinInfo(address?: string): Promise<JoinInfo> {
  const params = new URLSearchParams({ port: location.port || '80', origin: location.origin });
  if (address) params.set('address', address);
  return call<JoinInfo>(`/api/join-info?${params}`);
}

export interface CategoryList {
  builtIn: { id: string; name: string; wordCount: number }[];
  custom: Category[];
}

export function getCategories(): Promise<CategoryList> {
  return call<CategoryList>('/api/categories');
}

export function saveCustomCategories(custom: RawCategory[]): Promise<CategoryList> {
  return call<CategoryList>('/api/categories', {
    method: 'PUT',
    body: JSON.stringify({ custom }),
  });
}
