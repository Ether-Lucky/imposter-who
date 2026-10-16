/** Host-only REST calls (02-design §5.3). */
import type { Category, RawCategory } from '@imposter-who/core';

let hostToken = '';

/** REQ-CONN-3: only the laptop gets a token. Null means this is not the laptop. */
export async function startHostSession(): Promise<string | null> {
  const res = await fetch('/api/host-session', { cache: 'no-store' });
  if (!res.ok) return null;
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
  addresses: { name: string; address: string }[];
  preferred: { name: string; address: string } | null;
  url: string | null;
  qrSvg: string | null;
}

export function getJoinInfo(address?: string): Promise<JoinInfo> {
  const params = new URLSearchParams({ port: location.port || '80' });
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
