/** LAN address discovery and loopback checks. Source: specs/02-design.md §7. */
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

export interface LanAddress {
  name: string;
  address: string;
}

const VIRTUAL =
  /vethernet|virtualbox|vmware|wsl|docker|hyper-v|vbox|loopback|tailscale|zerotier|utun/i;
const WIRELESS = /wi-?fi|wlan|wireless|^wl/i;

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Private IPv4 addresses phones can reach, best first: Wi-Fi adapters, then other physical
 * adapters. Virtual adapters (WSL, Docker, VPNs) are dropped.
 */
export function lanAddresses(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): LanAddress[] {
  const found: (LanAddress & { rank: number })[] = [];
  for (const [name, infos] of Object.entries(interfaces)) {
    if (!infos || VIRTUAL.test(name)) continue;
    for (const info of infos) {
      if (info.family !== 'IPv4' || info.internal || !isPrivateIPv4(info.address)) continue;
      found.push({ name, address: info.address, rank: WIRELESS.test(name) ? 0 : 1 });
    }
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map(({ name, address }) => ({ name, address }));
}

export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
  return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.');
}

/**
 * The address of whoever made the request. Behind our own dev proxy (Vite, `xfwd: true`)
 * the real client is the LAST X-Forwarded-For entry, which the proxy appended; earlier
 * entries can be forged by the client. Without trustProxy the header is ignored.
 */
export function clientAddress(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustProxy: boolean,
): string | undefined {
  if (trustProxy && isLoopback(remoteAddress) && forwardedFor) {
    const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
    const last = header.split(',').at(-1)?.trim();
    if (last) return last;
  }
  return remoteAddress;
}
