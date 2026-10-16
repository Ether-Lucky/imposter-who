/** Host display entry: get the laptop-only token, connect, render the board. */
import { useEffect, useState } from 'react';
import type { HostView } from '@imposter-who/core';
import { createConnection, type Connection } from '../net/connection.ts';
import { startHostSession, takeHostKey } from './api.ts';
import { HostScreen } from './HostScreen.tsx';

let connection: Connection<HostView> | null = null;

function NotTheLaptop() {
  return (
    <main className="grid min-h-[100dvh] place-items-center p-6 text-center">
      <div className="grid max-w-md gap-4">
        <h1 className="text-3xl font-black uppercase">This is the board</h1>
        <p className="text-ink-dim">
          The board only runs on the laptop hosting the game, opened with its host link. On a phone,
          check in here instead:
        </p>
        <a href="/play" className="text-2xl font-bold text-amber underline underline-offset-4">
          Open your ticket
        </a>
      </div>
    </main>
  );
}

function Connected({ conn }: { conn: Connection<HostView> }) {
  const view = conn.use((s) => s.view);
  const offset = conn.use((s) => s.offset);
  const status = conn.use((s) => s.status);
  if (status === 'refused') return <NotTheLaptop />;
  if (!view) return <p className="p-6 text-ink-dim">Connecting to the game server…</p>;
  return (
    <>
      {status === 'offline' && (
        <p role="status" className="bg-red px-6 py-2 text-center font-bold text-ink">
          Lost the game server. Is it still running? Reconnecting…
        </p>
      )}
      <HostScreen view={view} offset={offset} send={conn.send} />
    </>
  );
}

export function HostApp() {
  const [state, setState] = useState<'loading' | 'refused' | 'down' | 'ready'>(
    connection ? 'ready' : 'loading',
  );

  useEffect(() => {
    if (connection) return;
    let retry: ReturnType<typeof setTimeout>;
    const key = takeHostKey();
    const attempt = () =>
      startHostSession(key).then(
        (token) => {
          if (!token) return setState('refused');
          connection ??= createConnection<HostView>({ kind: 'host', hostToken: token });
          setState('ready');
        },
        () => {
          setState('down');
          retry = setTimeout(attempt, 2000);
        },
      );
    void attempt();
    return () => clearTimeout(retry);
  }, []);

  if (state === 'refused') return <NotTheLaptop />;
  if (state === 'down') {
    return <p className="p-6 text-ink-dim">Can't reach the game server. Retrying…</p>;
  }
  if (state === 'loading' || !connection) {
    return <p className="p-6 text-ink-dim">Starting the board…</p>;
  }
  return <Connected conn={connection} />;
}
