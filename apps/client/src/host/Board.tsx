/**
 * The round ledger: one row per passenger in turn order (REQ-CLUE-5, REQ-VOTE-2/4).
 * Plain table for M3; the split-flap board replaces it in M4.
 */
import type { HostView } from '@imposter-who/core';
import { nameOf } from '../ui/labels.ts';

type Tone = 'live' | 'dim' | 'bad' | 'normal';

function statusFor(view: HostView, id: string): { text: string; tone: Tone } {
  const round = view.round!;
  const player = view.players.find((p) => p.id === id);
  if (view.match?.out.includes(id)) return { text: 'Out', tone: 'bad' };
  if (player && !player.connected) return { text: 'Offline', tone: 'dim' };
  switch (view.phase) {
    case 'reveal':
      return player?.ready
        ? { text: 'Ready', tone: 'normal' }
        : { text: 'Ticket issued', tone: 'dim' };
    case 'clues': {
      if (round.currentPlayerId === id) return { text: 'Now boarding', tone: 'live' };
      const mine = round.clues.find((c) => c.playerId === id && c.lap === round.lap);
      if (!mine) return { text: 'Waiting', tone: 'dim' };
      return mine.status === 'passed'
        ? { text: 'Passed', tone: 'dim' }
        : { text: 'Clue given', tone: 'normal' };
    }
    case 'voting':
      return round.votedIds.includes(id)
        ? { text: 'Voted', tone: 'normal' }
        : { text: 'Final call', tone: 'live' };
    default:
      return { text: '', tone: 'normal' };
  }
}

const TONE_CLASS: Record<Tone, string> = {
  live: 'text-amber',
  dim: 'text-ink-dim',
  bad: 'text-red',
  normal: 'text-ink',
};

export function Board({ view, showVotes = false }: { view: HostView; showVotes?: boolean }) {
  const round = view.round!;
  const ballot = round.ballots.at(-1);
  return (
    <table className="w-full border-separate border-spacing-y-1 text-left text-lg">
      <thead className="text-sm tracking-widest text-ink-dim uppercase">
        <tr>
          <th className="w-12 px-3">Seat</th>
          <th className="px-3">Passenger</th>
          <th className="px-3">Clues</th>
          <th className="px-3">{showVotes ? 'Voted for' : 'Status'}</th>
          {showVotes && <th className="w-16 px-3 text-right">Votes</th>}
        </tr>
      </thead>
      <tbody>
        {round.turnOrder.map((id) => {
          const player = view.players.find((p) => p.id === id);
          const status = statusFor(view, id);
          const live = round.currentPlayerId === id;
          const clues = round.clues.filter((c) => c.playerId === id);
          const ejected = ballot?.ejectedId === id && showVotes;
          return (
            <tr
              key={id}
              className={`bg-flap ${live ? 'outline-2 outline-amber' : ''} ${player?.connected === false ? 'opacity-60' : ''}`}
            >
              <td className="rounded-l-md px-3 py-2 font-mono text-ink-dim tabular-nums">
                {String((player?.seat ?? 0) + 1).padStart(2, '0')}
              </td>
              <td className="px-3 py-2 font-bold uppercase">
                {nameOf(view, id)}
                {round.imposterId === id && (
                  <span className="ml-2 rounded-sm bg-amber px-1.5 text-xs text-ticket-ink">
                    Imposter
                  </span>
                )}
                {view.match?.out.includes(id) && (
                  <span className="ml-2 rounded-sm border border-red px-1.5 text-xs text-red">
                    Out
                  </span>
                )}
              </td>
              <td className="px-3 py-2 uppercase">
                {clues.length === 0 && <span className="text-ink-dim">-</span>}
                {clues.map((c, i) => (
                  <span key={i} className={c.status === 'passed' ? 'text-ink-dim' : ''}>
                    {i > 0 && <span className="text-ink-dim"> / </span>}
                    {c.status === 'given' ? c.text : c.status === 'spoken' ? 'Spoken' : '-----'}
                  </span>
                ))}
              </td>
              {showVotes ? (
                <>
                  <td className="px-3 py-2 uppercase">
                    {ballot?.votes[id] ? (
                      nameOf(view, ballot.votes[id])
                    ) : (
                      <span className="text-ink-dim">No vote</span>
                    )}
                  </td>
                  <td
                    className={`rounded-r-md px-3 py-2 text-right font-mono tabular-nums ${ejected ? 'text-amber' : ''}`}
                  >
                    {ballot?.tally[id] ?? 0}
                  </td>
                </>
              ) : (
                <td
                  className={`rounded-r-md px-3 py-2 tracking-wide uppercase ${TONE_CLASS[status.tone]}`}
                >
                  {status.text}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
      {view.match && view.match.out.some((id) => !round.turnOrder.includes(id)) && (
        <tfoot>
          <tr>
            <td
              colSpan={showVotes ? 5 : 4}
              className="px-3 pt-3 text-sm tracking-widest text-ink-dim uppercase"
            >
              Off the train:{' '}
              {view.match.out
                .filter((id) => !round.turnOrder.includes(id))
                .map((id) => nameOf(view, id))
                .join(', ')}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
