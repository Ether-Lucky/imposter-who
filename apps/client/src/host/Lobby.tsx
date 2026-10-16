/** Check-in: QR to join, the passenger list, settings and Start (REQ-CONN-2, REQ-LOBBY-1..3). */
import { useEffect, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, XIcon } from '@phosphor-icons/react';
import type { HostView } from '@imposter-who/core';
import { Button } from '../ui/Button.tsx';
import { getCategories, getJoinInfo, type CategoryList, type JoinInfo } from './api.ts';
import { CategoryEditor } from './CategoryEditor.tsx';
import { SettingsPanel } from './Settings.tsx';
import type { Send } from './types.ts';

export function JoinCard({
  info,
  onAddress,
}: {
  info: JoinInfo | null;
  onAddress: (a: string) => void;
}) {
  if (!info) return <div className="aspect-square w-full animate-pulse rounded-lg bg-flap" />;
  if (!info.url) {
    return (
      <div className="rounded-lg bg-flap p-4 text-ink-dim">
        No Wi-Fi address found. Connect this laptop to the same Wi-Fi as the phones, then reload.
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div
        className="overflow-hidden rounded-lg bg-ink p-2 [&_svg]:h-auto [&_svg]:w-full"
        // Server-generated SVG from the qrcode package; contains no user input.
        dangerouslySetInnerHTML={{ __html: info.qrSvg ?? '' }}
      />
      <p className="font-mono text-lg break-all">{info.url}</p>
      {info.addresses.length > 1 && (
        <label className="grid gap-1 text-sm">
          <span className="tracking-widest text-ink-dim uppercase">Network</span>
          <select
            value={info.preferred?.address}
            onChange={(e) => onAddress(e.target.value)}
            className="min-h-10 rounded-md bg-flap px-2"
          >
            {info.addresses.map((a) => (
              <option key={a.address} value={a.address}>
                {a.name}: {a.address}
              </option>
            ))}
          </select>
        </label>
      )}
      <details className="text-sm text-ink-dim">
        <summary className="cursor-pointer">Phones can't connect?</summary>
        <ol className="mt-2 grid list-decimal gap-1 pl-5">
          <li>Phones must be on the same Wi-Fi as this laptop, not mobile data.</li>
          <li>
            On Windows, allow Node.js on private networks when the firewall asks (or in Windows
            Security, Firewall, Allow an app).
          </li>
          <li>Guest Wi-Fi often blocks devices from seeing each other. Use the main network.</li>
          <li>If the laptop has several networks, pick the Wi-Fi one above.</li>
        </ol>
      </details>
    </div>
  );
}

export function Passengers({ view, send }: { view: HostView; send: Send }) {
  const ids = view.players.map((p) => p.id);
  const move = (index: number, by: number) => {
    const order = [...ids];
    const [id] = order.splice(index, 1);
    order.splice(index + by, 0, id!);
    void send('seat:reorder', { order });
  };
  if (view.players.length === 0) {
    return (
      <p className="rounded-lg bg-flap p-6 text-ink-dim">
        No passengers yet. Scan the code to check in.
      </p>
    );
  }
  return (
    <ol className="grid gap-1">
      {view.players.map((p, i) => (
        <li
          key={p.id}
          className={`flex items-center gap-3 rounded-md bg-flap px-3 py-2 ${p.connected ? '' : 'opacity-60'}`}
        >
          <span className="w-8 font-mono text-ink-dim tabular-nums">
            {String(i + 1).padStart(2, '0')}
          </span>
          <span className="flex-1 text-lg font-bold uppercase">{p.name}</span>
          <span className="text-sm tracking-wide text-ink-dim uppercase">
            {p.connected ? 'Checked in' : 'Offline'}
            {view.round && ` · ${p.score} pts`}
          </span>
          <button
            type="button"
            aria-label={`Move ${p.name} up`}
            disabled={i === 0}
            onClick={() => move(i, -1)}
            className="grid size-9 place-items-center rounded-md bg-board disabled:opacity-30"
          >
            <ArrowUpIcon size={18} weight="bold" />
          </button>
          <button
            type="button"
            aria-label={`Move ${p.name} down`}
            disabled={i === ids.length - 1}
            onClick={() => move(i, 1)}
            className="grid size-9 place-items-center rounded-md bg-board disabled:opacity-30"
          >
            <ArrowDownIcon size={18} weight="bold" />
          </button>
          <button
            type="button"
            aria-label={`Remove ${p.name}`}
            onClick={() => {
              if (confirm(`Remove ${p.name} from the board?`))
                void send('player:remove', { id: p.id });
            }}
            className="grid size-9 place-items-center rounded-md bg-board text-red"
          >
            <XIcon size={18} weight="bold" />
          </button>
        </li>
      ))}
    </ol>
  );
}

export function Lobby({ view, send }: { view: HostView; send: Send }) {
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [categories, setCategories] = useState<CategoryList | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJoin = (address?: string) =>
    getJoinInfo(address).then(setInfo, (e: Error) => setError(e.message));

  useEffect(() => {
    void loadJoin();
    getCategories().then(setCategories, (e: Error) => setError(e.message));
  }, []);

  const connected = view.players.filter((p) => p.connected).length;
  const start = async () => {
    const ack = await send(view.phase === 'result' ? 'round:next' : 'round:start');
    setError(ack.ok ? null : ack.message);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(240px,320px)_1fr]">
      <aside className="grid content-start gap-4">
        <h2 className="text-2xl font-bold uppercase">Check in here</h2>
        <JoinCard info={info} onAddress={(a) => void loadJoin(a)} />
      </aside>

      <section className="grid content-start gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-2xl font-bold uppercase">
            Passengers <span className="text-ink-dim">{view.players.length}/15</span>
          </h2>
          <Button
            tone="primary"
            className="min-h-14 px-8 text-xl"
            disabled={connected < 3}
            onClick={start}
          >
            {connected < 3 ? `Need ${3 - connected} more` : 'Start round'}
          </Button>
        </div>
        {error && <p className="text-red">{error}</p>}
        <Passengers view={view} send={send} />
        <details className="rounded-lg bg-flap/40 p-4" open>
          <summary className="cursor-pointer text-xl font-bold uppercase">
            Timetable (settings)
          </summary>
          <div className="mt-4">
            <SettingsPanel
              settings={view.settings}
              categories={categories}
              send={send}
              onEditCustom={() => setEditing(true)}
            />
          </div>
        </details>
      </section>

      {editing && categories && (
        <CategoryEditor
          categories={categories}
          onSaved={setCategories}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
