/**
 * REQ-LOBBY-4: a 4-step explainer that flaps onto the board, steps every 6 s, and anyone
 * can skip (button or Escape).
 */
import { useEffect, useState } from 'react';
import type { GameMode } from '@imposter-who/core';
import { BoardItem, useBoard } from '../flap/BoardGrid.tsx';
import { FlapRow } from '../flap/Flap.tsx';
import { FIRST_ROW, MAX_ROWS } from './rows.tsx';
import { fitWords } from './model.ts';

export const STEP_MS = 6000;

export function steps(mode: GameMode): { title: string; lines: string[] }[] {
  return [
    {
      title: '1. CHECK IN',
      lines: ['SCAN THE CODE WITH YOUR PHONE.', 'TYPE YOUR NAME. 3 TO 15 PASSENGERS.'],
    },
    {
      title: '2. TEAR YOUR TICKET',
      lines: [
        'EVERYONE GETS THE SAME DESTINATION,',
        'EXCEPT ONE: DESTINATION UNKNOWN.',
        'THAT ONE IS THE IMPOSTER. KEEP IT SECRET.',
      ],
    },
    {
      title: '3. BOARD IN TURN',
      lines: [
        'GIVE ONE WORD THAT FITS THE DESTINATION.',
        'TOO OBVIOUS HELPS THE IMPOSTER.',
        'TOO VAGUE MAKES YOU LOOK GUILTY.',
      ],
    },
    mode === 'manhunt'
      ? {
          title: '4. FINAL CALL',
          lines: [
            'DISCUSS, THEN VOTE SOMEONE OFF THE TRAIN.',
            'CATCH THE IMPOSTER AND CIVILIANS WIN.',
            'A WRONG VOTE COSTS A LIFE. NEW WORD, NEXT ROUND.',
          ],
        }
      : {
          title: '4. FINAL CALL',
          lines: [
            'DISCUSS, THEN VOTE FOR THE IMPOSTER.',
            'CAUGHT? THE IMPOSTER GETS ONE GUESS',
            'AT THE DESTINATION TO STEAL THE WIN.',
          ],
        },
  ];
}

export function HowToPlay({ mode, onClose }: { mode: GameMode; onClose: () => void }) {
  const grid = useBoard();
  const all = steps(mode);
  const [i, setI] = useState(0);
  const w = Math.min(grid.cols - 2, 46);
  const col = Math.floor((grid.cols - w) / 2);

  useEffect(() => {
    const id = setTimeout(() => (i < all.length - 1 ? setI(i + 1) : undefined), STEP_MS);
    return () => clearTimeout(id);
  }, [i, all.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const step = all[i]!;
  const last = i === all.length - 1;
  const btn = 'sign h-[var(--cell-h)] px-[calc(var(--cell-h)*0.5)] w-auto';
  return (
    <>
      <BoardItem col={0} row={FIRST_ROW} w={grid.cols} h={MAX_ROWS}>
        <div className="board-veil" />
      </BoardItem>
      <BoardItem col={col} row={FIRST_ROW + 2} w={w} className="z-5">
        <h2>
          <FlapRow text={step.title} width={w} tone="amber" />
        </h2>
      </BoardItem>
      {[0, 1, 2].map((n) => (
        <BoardItem key={n} col={col} row={FIRST_ROW + 4 + n} w={w} className="z-5">
          <FlapRow text={fitWords(step.lines[n] ?? '', w)} width={w} row={n} />
        </BoardItem>
      ))}
      <BoardItem col={col} row={FIRST_ROW + 9} w={w} className="z-5">
        <div className="flex h-full items-center gap-[calc(var(--cell-h)*0.3)]">
          <span className="board-text">
            STEP {i + 1} OF {all.length}
          </span>
          <span className="flex-1" />
          {!last && (
            <button type="button" className={`${btn} sign-plain`} onClick={() => setI(i + 1)}>
              NEXT
            </button>
          )}
          <button type="button" className={`${btn} sign-amber`} onClick={onClose} autoFocus>
            {last ? 'GOT IT' : 'SKIP'}
          </button>
        </div>
      </BoardItem>
    </>
  );
}
