/**
 * The host display's board (04 §1.5): one viewport-sized grid of flap cells. Empty cells
 * show as blank flaps; content goes in `BoardItem`s placed by cell, so nothing floats.
 */
import {
  createContext,
  memo,
  useContext,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { boardGrid, place, type Grid } from './grid.ts';
import './flap.css';

/** What the server renders (and tests see): a 1366x768 laptop. */
const SERVER_VIEWPORT = '1366x768';

function subscribeResize(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function useViewport(): [number, number] {
  const size = useSyncExternalStore(
    subscribeResize,
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => SERVER_VIEWPORT,
  );
  const [w, h] = size.split('x').map(Number);
  return [w!, h!];
}

const BoardContext = createContext<Grid>(boardGrid(1366, 768));

/** The current grid, for layouts that adapt to the column count. */
export function useBoard(): Grid {
  return useContext(BoardContext);
}

const Blanks = memo(function Blanks({ count }: { count: number }) {
  return (
    <div className="board-layer" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="board-blank" />
      ))}
    </div>
  );
});

export function BoardGrid({ children }: { children: ReactNode }) {
  const [width, height] = useViewport();
  const grid = boardGrid(width, height);
  const style = {
    '--cell-h': `${grid.cellH}px`,
    '--board-cols': grid.cols,
    '--board-rows': grid.rows,
    '--board-left': `${grid.left}px`,
    '--board-top': `${grid.top}px`,
  } as CSSProperties;
  return (
    <BoardContext.Provider value={grid}>
      <div className="board" style={style}>
        <Blanks count={grid.cols * grid.rows} />
        <div className="board-layer">{children}</div>
      </div>
    </BoardContext.Provider>
  );
}

/**
 * A block of `w` x `h` cells at (`col`, `row`), 0-based. Negative positions count from
 * the right or bottom edge (-1 is the last cell).
 */
export function BoardItem({
  col,
  row,
  w = 1,
  h = 1,
  className = '',
  children,
}: {
  col: number;
  row: number;
  w?: number;
  h?: number;
  className?: string;
  children?: ReactNode;
}) {
  const grid = useBoard();
  return (
    <div className={`board-item ${className}`} style={place(grid, col, row, w, h)}>
      {children}
    </div>
  );
}
