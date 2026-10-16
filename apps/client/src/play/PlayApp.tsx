/** Phone controller entry: connect with the stored token and render the ticket. */
import type { PlayerView } from '@imposter-who/core';
import { createConnection, type Connection } from '../net/connection.ts';
import { playerToken } from '../net/token.ts';
import { PlayScreen } from './PlayScreen.tsx';

let connection: Connection<PlayerView> | null = null;

function getConnection() {
  connection ??= createConnection<PlayerView>({ kind: 'player', token: playerToken() });
  return connection;
}

export function PlayApp() {
  const conn = getConnection();
  const view = conn.use((s) => s.view);
  const offset = conn.use((s) => s.offset);
  const status = conn.use((s) => s.status);
  const kicked = conn.use((s) => s.kicked);
  return (
    <PlayScreen
      view={view}
      offset={offset}
      status={status}
      kicked={kicked}
      send={conn.send}
      onRejoin={() => conn.store.setState({ kicked: false })}
    />
  );
}
