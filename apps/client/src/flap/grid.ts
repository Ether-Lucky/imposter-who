/**
 * Board grid maths (04 §1.5): the viewport becomes one grid of flap-shaped cells, and
 * everything on the host display snaps to it. Pure, so it is unit tested directly.
 */

/** Rows on the board, always. */
export const BOARD_ROWS = 18;
/** Layouts are designed for this many columns; cells shrink so at least this many fit. */
export const MIN_COLS = 40;
/** Cell width as a share of cell height (a flap character is tall and narrow). */
export const CELL_ASPECT = 0.68;
/** Gaps as a share of cell height. The column gap matches `.flap-row` in flap.css. */
export const COL_GAP = 0.08;
export const ROW_GAP = 0.14;
/** Space round the board edge, as a share of cell height. */
export const MARGIN = 0.5;

export type Grid = {
  cols: number;
  rows: number;
  /** Cell size and gaps in px. */
  cellH: number;
  cellW: number;
  gapX: number;
  gapY: number;
  /** Where cell (0, 0) starts, in px from the top left of the viewport. */
  left: number;
  top: number;
};

/** Height a board of `rows` rows needs, in units of cell height. */
const heightUnits = (rows: number) => rows + (rows - 1) * ROW_GAP + 2 * MARGIN;
/** Width a board of `cols` columns needs, in units of cell height. */
const widthUnits = (cols: number) => cols * CELL_ASPECT + (cols - 1) * COL_GAP + 2 * MARGIN;

export function boardGrid(width: number, height: number): Grid {
  const byHeight = height / heightUnits(BOARD_ROWS);
  const byWidth = width / widthUnits(MIN_COLS);
  const cellH = Math.max(1, Math.floor(Math.min(byHeight, byWidth)));
  const cols = Math.max(
    MIN_COLS,
    Math.floor((width / cellH - 2 * MARGIN + COL_GAP) / (CELL_ASPECT + COL_GAP)),
  );
  const cellW = cellH * CELL_ASPECT;
  const gapX = cellH * COL_GAP;
  const gapY = cellH * ROW_GAP;
  const usedW = cols * cellW + (cols - 1) * gapX;
  const usedH = BOARD_ROWS * cellH + (BOARD_ROWS - 1) * gapY;
  return {
    cols,
    rows: BOARD_ROWS,
    cellH,
    cellW,
    gapX,
    gapY,
    left: (width - usedW) / 2,
    top: (height - usedH) / 2,
  };
}

/**
 * Resolve a placement to 1-based CSS grid lines. A negative `col` or `row` counts from the
 * right or bottom edge (-1 is the last cell), so a sign can hug a corner on any width.
 */
export function place(
  grid: Pick<Grid, 'cols' | 'rows'>,
  col: number,
  row: number,
  w = 1,
  h = 1,
): { gridColumn: string; gridRow: string } {
  const c = col < 0 ? grid.cols + col - w + 1 : col;
  const r = row < 0 ? grid.rows + row - h + 1 : row;
  return { gridColumn: `${c + 1} / span ${w}`, gridRow: `${r + 1} / span ${h}` };
}
