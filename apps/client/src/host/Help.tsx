/**
 * "Phones can't connect?" (REQ-CONN-1, 02 §7, T7.1): the usual fixes, a network switcher
 * and a self-test that asks the game server for its health on the address the phones use.
 */
import { useState } from 'react';
import { BoardItem, useBoard } from '../flap/BoardGrid.tsx';
import type { JoinInfo } from './api.ts';
import { FIRST_ROW, MAX_ROWS } from './rows.tsx';

type Test = { state: 'idle' } | { state: 'running' } | { state: 'ok' | 'fail'; address: string };

/**
 * Fetch the health endpoint on the phones' address. `no-cors` because that address is
 * another origin; any answer at all means the server is listening there. A pass cannot
 * rule out the firewall (the laptop reaching itself skips it), so the copy says so.
 */
export async function selfTest(url: string, timeoutMs = 3000): Promise<boolean> {
  const target = new URL('/api/health', url);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    await fetch(target, { mode: 'no-cors', cache: 'no-store', signal: abort.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function Help({
  info,
  onAddress,
  onClose,
}: {
  info: JoinInfo | null;
  onAddress: (a: string) => void;
  onClose: () => void;
}) {
  const grid = useBoard();
  const [test, setTest] = useState<Test>({ state: 'idle' });
  const run = async () => {
    if (!info?.url) return;
    setTest({ state: 'running' });
    const ok = await selfTest(info.url);
    setTest({ state: ok ? 'ok' : 'fail', address: new URL(info.url).host });
  };
  const btn = 'sign w-auto px-[calc(var(--cell-h)*0.5)] h-[var(--cell-h)]';

  return (
    <BoardItem col={0} row={FIRST_ROW} w={grid.cols} h={MAX_ROWS} className="z-5">
      <section aria-label="Phones can't connect?" data-state="open" className="board-panel h-full">
        <div className="grid max-w-[70ch] gap-[calc(var(--cell-h)*0.3)] text-[calc(var(--cell-h)*0.45)] text-ink">
          <h2 className="font-[family-name:var(--font-flap)] text-[calc(var(--cell-h)*0.7)] font-bold tracking-[0.06em] text-amber uppercase">
            Phones can't connect?
          </h2>
          {info?.mode === 'public' ? (
            <p>
              Online game: anyone with the link can check in, from any network. If a phone can't
              open it, check its data connection, then try the link again.
            </p>
          ) : (
            <ol className="grid list-decimal gap-[calc(var(--cell-h)*0.15)] pl-[1.4em]">
              <li>Phones must be on the same Wi-Fi as this laptop, not mobile data.</li>
              <li>
                On Windows, allow Node.js on private networks when the firewall asks (or in Windows
                Security, Firewall, Allow an app).
              </li>
              <li>
                Guest Wi-Fi often blocks devices from seeing each other. Use the main network.
              </li>
              <li>If the laptop has several networks, pick the Wi-Fi one below.</li>
            </ol>
          )}
          {info && info.mode !== 'public' && info.addresses.length > 1 && (
            <label className="flex flex-wrap items-center gap-3">
              <span className="text-ink-dim uppercase">Network</span>
              <select
                value={info.preferred?.address}
                onChange={(e) => onAddress(e.target.value)}
                className="min-h-[var(--cell-h)] rounded-[3px] bg-flap px-2 text-ink"
              >
                {info.addresses.map((a) => (
                  <option key={a.address} value={a.address}>
                    {a.name}: {a.address}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={`${btn} sign-plain`}
              disabled={!info?.url || test.state === 'running'}
              onClick={() => void run()}
            >
              {test.state === 'running' ? 'TESTING' : 'TEST THE ADDRESS'}
            </button>
            <p role="status" className="text-ink-dim">
              {test.state === 'ok' &&
                `The game answers on ${test.address}. If phones still can't open it, it's the Wi-Fi or the firewall (steps 1 to 3).`}
              {test.state === 'fail' &&
                `Nothing answers on ${test.address}. Pick another network above, or reconnect this laptop to the Wi-Fi and reload.`}
            </p>
          </div>
          <div>
            <button type="button" className={`${btn} sign-amber`} onClick={onClose}>
              CLOSE
            </button>
          </div>
        </div>
      </section>
    </BoardItem>
  );
}
