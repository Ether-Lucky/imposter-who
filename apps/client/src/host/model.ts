/**
 * What the board says, as plain data (04 §4, §4.12). The board components only place
 * these strings on cells, so the wording and the secrecy rules are tested here, without
 * a DOM. Nothing in this file may read the word before the result (REQ-SEC-3).
 */
import type { HostView, PublicPlayer } from '@imposter-who/core';
import type { FlapTone } from '../flap/Flap.tsx';
import { nameOf } from '../ui/labels.ts';

export interface BoardRow {
  id: string;
  seat: string;
  name: string;
  clue: string;
  status: string;
  tone: FlapTone;
  /** Dimmed to 60% (offline, out, standby). */
  dim: boolean;
  /** The amber bar: the row whose turn it is. */
  live: boolean;
}

export const seatLabel = (p: Pick<PublicPlayer, 'seat'>) => String(p.seat + 1).padStart(2, '0');

/** Clue column: every clue so far, oldest first (04 §4.6). */
export function clueText(view: HostView, id: string): string {
  const clues = view.round?.clues.filter((c) => c.playerId === id) ?? [];
  return clues
    .map((c) =>
      c.status === 'given' ? (c.text ?? '') : c.status === 'spoken' ? 'SPOKEN' : '-----',
    )
    .join(' ');
}

function statusFor(view: HostView, p: PublicPlayer): Pick<BoardRow, 'status' | 'tone'> {
  const round = view.round;
  if (view.match?.out.includes(p.id)) return { status: 'CANCELLED', tone: 'red' };
  if (!round || !round.turnOrder.includes(p.id)) {
    return p.standby
      ? { status: 'STANDBY', tone: 'dim' }
      : { status: p.connected ? 'CHECKED IN' : 'OFFLINE', tone: p.connected ? 'ink' : 'dim' };
  }
  if (!p.connected && view.phase !== 'result') return { status: 'OFFLINE', tone: 'dim' };
  switch (view.phase) {
    case 'reveal':
      return p.ready ? { status: 'READY', tone: 'ink' } : { status: 'ISSUED', tone: 'dim' };
    case 'clues': {
      if (round.currentPlayerId === p.id) return { status: 'NOW BOARDING', tone: 'amber' };
      const mine = round.clues.find((c) => c.playerId === p.id && c.lap === round.lap);
      if (!mine) return { status: 'WAITING', tone: 'dim' };
      return mine.status === 'passed'
        ? { status: 'PASSED', tone: 'dim' }
        : { status: 'CLUE GIVEN', tone: 'ink' };
    }
    case 'discussion':
      return { status: 'DELAYED', tone: 'ink' };
    case 'voting':
      if (round.revoteCandidates?.includes(p.id)) {
        return round.votedIds.includes(p.id)
          ? { status: 'VOTED', tone: 'amber' }
          : { status: 'ACCUSED', tone: 'amber' };
      }
      return round.votedIds.includes(p.id)
        ? { status: 'VOTED', tone: 'ink' }
        : { status: 'FINAL CALL', tone: 'amber' };
    case 'lastChance':
      return round.imposterId === p.id
        ? { status: 'DEPARTED', tone: 'amber' }
        : { status: 'ON BOARD', tone: 'dim' };
    case 'intermission': {
      const ballot = round.ballots.at(-1);
      return ballot?.ejectedId === p.id
        ? { status: 'CANCELLED', tone: 'red' }
        : { status: 'ON BOARD', tone: 'ink' };
    }
    case 'result':
      return round.imposterId === p.id
        ? { status: 'IMPOSTER', tone: 'amber' }
        : { status: 'CIVILIAN', tone: 'ink' };
    default:
      return { status: '', tone: 'ink' };
  }
}

/**
 * Rows in board order: passengers of this round in turn order, then anyone out of the
 * match (04 §4.12), then everyone else (standby, or the lobby's seat order).
 */
export function boardRows(view: HostView): BoardRow[] {
  const order = view.round?.turnOrder ?? [];
  const out = view.match?.out ?? [];
  const rank = (p: PublicPlayer) => {
    const turn = order.indexOf(p.id);
    if (turn >= 0 && !out.includes(p.id)) return turn;
    if (out.includes(p.id)) return 100 + out.indexOf(p.id);
    return 200 + p.seat;
  };
  const players =
    view.phase === 'lobby' ? view.players : [...view.players].sort((a, b) => rank(a) - rank(b));
  return players.map((p) => {
    const { status, tone } = statusFor(view, p);
    const isOut = out.includes(p.id);
    return {
      id: p.id,
      seat: seatLabel(p),
      name: p.name.toUpperCase(),
      clue: view.phase === 'lobby' ? '' : clueText(view, p.id),
      status,
      tone,
      dim: isOut || p.standby || (!p.connected && view.phase !== 'result'),
      live: view.phase === 'clues' && view.round?.currentPlayerId === p.id,
    };
  });
}

/** The amber line under the header (04 §1.6 voice). */
export function headline(view: HostView): string {
  const round = view.round;
  switch (view.phase) {
    case 'lobby': {
      const connected = view.players.filter((p) => p.connected).length;
      if (connected === 0) return 'CHECK IN: SCAN THE CODE';
      if (connected < 3) return `CHECKING IN. ${3 - connected} MORE TO DEPART`;
      return 'ALL PASSENGERS CHECKED IN';
    }
    case 'reveal':
      return 'TICKET CHECK. TEAR YOUR TICKET';
    case 'clues':
      return `NOW BOARDING: ${nameOf(view, round?.currentPlayerId).toUpperCase()}`;
    case 'discussion':
      return 'DELAYED: DISCUSS';
    case 'voting':
      return round?.revoteCandidates
        ? `REVOTE: ${round.revoteCandidates.map((id) => nameOf(view, id).toUpperCase()).join(' OR ')}`
        : 'FINAL CALL. CAST YOUR VOTE';
    case 'voteReveal':
      return 'COUNTING VOTES';
    case 'lastChance':
      return 'LAST CALL: NAME THE DESTINATION?';
    case 'intermission':
      return 'INTERMISSION';
    case 'result': {
      const outcome = round?.outcome;
      if (view.match) {
        return outcome?.winner === 'civilians'
          ? 'IMPOSTER CAUGHT'
          : outcome?.winner === 'imposter'
            ? 'IMPOSTER ESCAPED'
            : 'SERVICE CANCELLED';
      }
      return 'ARRIVALS';
    }
  }
}

/** Lives as the board shows them: `LIVES 2`, or `LIVES: NO LIMIT` (04 §4.12). */
export function livesText(view: HostView): string | null {
  if (!view.match) return null;
  return view.match.livesLeft === null ? 'LIVES: NO LIMIT' : `LIVES ${view.match.livesLeft}`;
}

/**
 * The header's info line: round, lives, line, lap, in that priority. Parts that do not fit
 * in `width` cells are dropped from the end.
 */
export function infoLine(view: HostView, width: number): string {
  const round = view.round;
  if (!round) return '';
  const parts = [
    `ROUND ${view.match ? view.match.rounds : round.number}`,
    livesText(view),
    `LINE: ${(round.categoryName ?? 'Classified').toUpperCase()}`,
    view.phase === 'clues' && round.laps > 1 ? `LAP ${round.lap} OF ${round.laps}` : null,
  ].filter((p): p is string => !!p);
  let line = '';
  for (const part of parts) {
    const next = line ? `${line}  ${part}` : part;
    if (next.length > width) break;
    line = next;
  }
  return line;
}

/** Fit text to a column without cutting a word in half where it can be avoided. */
export function fitWords(text: string, width: number): string {
  if (text.length <= width) return text;
  const cut = text.slice(0, width);
  if (text[width] === ' ') return cut;
  const space = cut.lastIndexOf(' ');
  return space > width / 2 ? cut.slice(0, space) : cut;
}

/** House lines for the platform ticker (04 §4.7, §4.12). */
export const TICKER_LINES = [
  'PLEASE KEEP YOUR SUSPICIONS WITH YOU AT ALL TIMES',
  'PASSENGERS WITHOUT A DESTINATION WILL BE REMOVED',
  'MIND THE GAP BETWEEN THE CLUE AND THE WORD',
  'UNATTENDED ACCUSATIONS WILL BE INVESTIGATED',
];

export const MANHUNT_TICKER_LINES = [
  'THE IMPOSTER REMAINS ON BOARD',
  'PLEASE REPORT SUSPICIOUS CLUES TO THE TABLE',
  ...TICKER_LINES.slice(0, 2),
];

/** Attract loop destinations (04 §4.1). */
export const ATTRACT = [
  'LONDON',
  'PLATFORM 9',
  'NOWHERE',
  'LAST STOP',
  'PARIS',
  'CHICAGO',
  'TOKYO',
];
