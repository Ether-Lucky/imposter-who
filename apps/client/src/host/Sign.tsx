/** Enamel signs set into the board: the host's buttons, snapped to cells (04 §4.2). */
import type { ReactNode } from 'react';
import { BoardItem } from '../flap/BoardGrid.tsx';
import './board.css';

export type SignTone = 'amber' | 'plain' | 'red' | 'outline-amber';

export interface SignSpec {
  label: string;
  tone?: SignTone;
  onClick: () => void;
  disabled?: boolean;
  /** Accessible name when the label is terse. */
  title?: string;
  icon?: ReactNode;
}

/** Cells a sign needs: its label plus a cell of padding each side. */
export const signWidth = (s: Pick<SignSpec, 'label'>) => Math.max(4, s.label.length + 2);

export function Sign({
  col,
  row,
  w,
  h = 1,
  spec,
}: {
  col: number;
  row: number;
  w: number;
  h?: number;
  spec: SignSpec;
}) {
  const { label, tone = 'plain', onClick, disabled, title, icon } = spec;
  return (
    <BoardItem col={col} row={row} w={w} h={h}>
      <button
        type="button"
        className={`sign sign-${tone}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={title}
      >
        {icon ?? label}
      </button>
    </BoardItem>
  );
}

/** Signs packed left to right from `col` 0, one gap apart. */
export function SignRunLeft({
  row,
  signs,
  gap = 1,
}: {
  row: number;
  signs: SignSpec[];
  gap?: number;
}) {
  const widths = signs.map(signWidth);
  return (
    <>
      {signs.map((spec, i) => (
        <Sign
          key={spec.label}
          col={widths.slice(0, i).reduce((sum, w) => sum + w + gap, 0)}
          row={row}
          w={widths[i]!}
          spec={spec}
        />
      ))}
    </>
  );
}

/**
 * A run of signs on one row, packed against the right edge (first sign leftmost).
 */
export function SignRun({ row, signs, gap = 1 }: { row: number; signs: SignSpec[]; gap?: number }) {
  // Lay out right to left: each sign's right edge sits one gap left of the next one.
  const widths = signs.map(signWidth);
  const placed = signs.map((spec, i) => {
    const toTheRight = widths.slice(i + 1).reduce((sum, w) => sum + w + gap, 0);
    return { spec, w: widths[i]!, col: -1 - toTheRight };
  });
  return (
    <>
      {placed.map(({ spec, w, col }) => (
        <Sign key={spec.label} col={col} row={row} w={w} spec={spec} />
      ))}
    </>
  );
}

export function signRunWidth(signs: SignSpec[], gap = 1): number {
  return signs.reduce((sum, s) => sum + signWidth(s), 0) + Math.max(0, signs.length - 1) * gap;
}
