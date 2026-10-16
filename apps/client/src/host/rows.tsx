/** Pieces of the host board shared by every screen (04 §1.5, §4). */
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { HostView, VoteRecord } from '@imposter-who/core';
import { BoardItem, useBoard } from '../flap/BoardGrid.tsx';
import { FlapRow, type FlapTone } from '../flap/Flap.tsx';
import { nameOf } from '../ui/labels.ts';
import { fitWords, type BoardRow } from './model.ts';
import type { RevealBeat } from './revealTimeline.ts';
import './board.css';

/** First passenger row and how many fit (04 §1.5: 18 rows). */
export const FIRST_ROW = 2;
export const MAX_ROWS = 15;
export const FOOTER_ROW = 17;

/** Row 1: the station announcement. */
export function Headline({
  text,
  tone = 'amber',
  blink,
}: {
  text: string;
  tone?: FlapTone;
  /** Change this key to blink the headline twice (final call, 04 §4.8). */
  blink?: string;
}) {
  const grid = useBoard();
  return (
    <BoardItem col={0} row={1} w={grid.cols}>
      <h2 key={blink} className={blink ? 'headline-blink' : undefined}>
        <FlapRow text={fitWords(text, grid.cols)} width={grid.cols} tone={tone} />
      </h2>
    </BoardItem>
  );
}

export interface RevealState {
  beat: RevealBeat;
  ballot: VoteRecord;
}

/** Passenger rows. In the vote reveal, the status column shows who each row voted for. */
export function PassengerRows({
  view,
  rows,
  left = 0,
  clue = true,
  reveal,
  score = false,
  renderStatus,
  onRowClick,
  selected,
}: {
  view: HostView;
  rows: BoardRow[];
  left?: number;
  clue?: boolean;
  reveal?: RevealState;
  /** Show each passenger's score in the count column. */
  score?: boolean;
  renderStatus?: (row: BoardRow, r: number) => ReactNode;
  onRowClick?: (row: BoardRow) => void;
  selected?: string | null;
}) {
  const grid = useBoard();
  const counts = !!reveal || score;
  const clueCol = left + 16;
  const clueW = grid.cols - clueCol - 13 - (counts ? 4 : 0);
  return (
    <>
      {rows.slice(0, MAX_ROWS).map((row, i) => {
        const r = FIRST_ROW + i;
        const ballot = reveal?.ballot;
        const isAccused = !!ballot && ballot.ejectedId === row.id;
        const faded = !!reveal?.beat.collapsed && !isAccused;
        const lifted = !!reveal?.beat.lifted && isAccused;
        const cls = lifted
          ? 'board-row-lift'
          : faded
            ? 'board-row-fade'
            : row.dim
              ? 'board-row-dim'
              : '';

        let status = row.status;
        let tone = row.tone;
        let count = '';
        if (reveal && ballot) {
          const voted = view.round!.turnOrder.indexOf(row.id);
          const shown = voted >= 0 && voted < reveal.beat.votesShown;
          const target = ballot.votes[row.id];
          status = faded
            ? ''
            : shown
              ? target
                ? nameOf(view, target).toUpperCase()
                : 'NO VOTE'
              : '';
          tone = shown && !target ? 'dim' : 'ink';
          if (reveal.beat.tally && !faded) {
            const n = ballot.tally[row.id] ?? 0;
            count = String(n).padStart(2, ' ');
          }
          if (isAccused && reveal.beat.collapsed) tone = 'amber';
        } else if (score) {
          count = String(view.players.find((p) => p.id === row.id)?.score ?? 0).padStart(2, ' ');
        }

        return (
          <div key={row.id} className="contents" data-row-id={row.id}>
            <BoardItem col={left} row={r} w={2} className={cls}>
              {row.live && (
                <motion.span
                  layoutId="live-bar"
                  className="live-bar"
                  transition={{ duration: 0.35, ease: [0.77, 0, 0.175, 1] }}
                />
              )}
              <FlapRow text={row.seat} width={2} tone="dim" row={i} />
            </BoardItem>
            <BoardItem col={left + 3} row={r} w={12} className={cls}>
              <FlapRow text={row.name} width={12} row={i} tone={row.live ? 'amber' : 'ink'} />
            </BoardItem>
            {clue && clueW >= 4 && (
              <BoardItem col={clueCol} row={r} w={clueW} className={cls}>
                <FlapRow text={fitWords(row.clue, clueW)} width={clueW} row={i} />
              </BoardItem>
            )}
            {counts && (
              <BoardItem col={-14} row={r} w={2} className={cls}>
                <FlapRow text={count} width={2} row={i} tone={isAccused ? 'amber' : 'ink'} />
              </BoardItem>
            )}
            {/* The status stays at full strength in a dimmed row: dim or red text at 60% misses
                AA contrast (REQ-UX-7), and the word is what says why the row is dimmed. */}
            <BoardItem col={-1} row={r} w={12} className={cls === 'board-row-dim' ? '' : cls}>
              {renderStatus?.(row, r) ?? <FlapRow text={status} width={12} row={i} tone={tone} />}
            </BoardItem>
            {onRowClick && (
              <BoardItem col={left} row={r} w={15}>
                <button
                  type="button"
                  aria-pressed={selected === row.id}
                  aria-label={`Select ${row.name}`}
                  className="absolute inset-0 cursor-pointer rounded-[3px] focus-visible:outline-2 focus-visible:outline-amber aria-pressed:outline-2 aria-pressed:outline-amber/70"
                  onClick={() => onRowClick(row)}
                />
              </BoardItem>
            )}
          </div>
        );
      })}
    </>
  );
}
