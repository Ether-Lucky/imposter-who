/** Phone controller entry: connect with the stored token and render the ticket. */
import { useEffect, useRef } from 'react';
import type { Cue, PlayerView } from '@imposter-who/core';
import { createConnection, type Connection } from '../net/connection.ts';
import { playerToken } from '../net/token.ts';
import { feedback, type Buzz } from './feedback.tsx';
import { PlayScreen } from './PlayScreen.tsx';

let connection: Connection<PlayerView> | null = null;

function getConnection() {
  connection ??= createConnection<PlayerView>({ kind: 'player', token: playerToken() });
  return connection;
}

/**
 * Which buzz a cue gives this phone (04 §7). Turn cues buzz only the player whose turn it
 * is; everything else buzzes every passenger still in, whatever their role. Ghosts and
 * standby passengers get nothing.
 */
export function cueBuzz(cue: Cue, view: PlayerView | null): Buzz | null {
  const you = view?.you;
  if (!you || !you.ticket || you.ghost) return null;
  switch (cue.cue) {
    case 'roundStart':
      return 'roundStart';
    case 'turnStart':
      return cue.playerId === you.id ? 'turn' : null;
    case 'finalCall':
      return 'finalCall';
    default:
      return null;
  }
}

export function PlayApp() {
  const conn = getConnection();
  const view = conn.use((s) => s.view);
  const offset = conn.use((s) => s.offset);
  const status = conn.use((s) => s.status);
  const kicked = conn.use((s) => s.kicked);
  const cue = conn.use((s) => s.cue);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });
  useEffect(() => {
    const buzz = cue && cueBuzz(cue.cue, viewRef.current);
    if (buzz) feedback(buzz);
  }, [cue]);
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
