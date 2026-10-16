import { describe, expect, it } from 'vitest';
import { BOARD_ROWS, MIN_COLS, boardGrid, place } from '../src/flap/grid.ts';

const fits = (g: ReturnType<typeof boardGrid>, w: number, h: number) =>
  g.left >= 0 &&
  g.top >= 0 &&
  g.left * 2 + g.cols * g.cellW + (g.cols - 1) * g.gapX <= w + 0.01 &&
  g.top * 2 + g.rows * g.cellH + (g.rows - 1) * g.gapY <= h + 0.01;

describe('UX board grid (04 §1.5)', () => {
  it.each([
    [1366, 768],
    [1920, 1080],
    [1280, 720],
    [2560, 1440],
    [1024, 768],
    [1280, 1024],
    [800, 600],
  ])('fills %ix%i with 18 rows and at least 40 columns, all on screen', (w, h) => {
    const g = boardGrid(w, h);
    expect(g.rows).toBe(BOARD_ROWS);
    expect(g.cols).toBeGreaterThanOrEqual(MIN_COLS);
    expect(Number.isInteger(g.cellH)).toBe(true);
    expect(fits(g, w, h)).toBe(true);
  });

  it('never makes a cell under 28px tall at 1366x768', () => {
    expect(boardGrid(1366, 768).cellH).toBeGreaterThanOrEqual(28);
  });

  it('gives a 16:9 laptop and a 1080p screen the same layout, only bigger', () => {
    const laptop = boardGrid(1366, 768);
    const tv = boardGrid(1920, 1080);
    expect(tv.cellH).toBeGreaterThan(laptop.cellH);
    expect(Math.abs(tv.cols - laptop.cols)).toBeLessThanOrEqual(1);
  });

  it('shrinks cells on a square screen so 40 columns still fit', () => {
    const square = boardGrid(1024, 1024);
    expect(square.cols).toBe(MIN_COLS);
    expect(fits(square, 1024, 1024)).toBe(true);
  });

  it('keeps flap text on the column grid: cell and gap match FlapRow', () => {
    const g = boardGrid(1366, 768);
    expect(g.cellW).toBeCloseTo(g.cellH * 0.68);
    expect(g.gapX).toBeCloseTo(g.cellH * 0.08);
  });
});

describe('UX board placement', () => {
  const grid = { cols: 46, rows: 18 };

  it('maps a cell position and span to CSS grid lines', () => {
    expect(place(grid, 0, 0)).toEqual({ gridColumn: '1 / span 1', gridRow: '1 / span 1' });
    expect(place(grid, 2, 3, 12, 1)).toEqual({ gridColumn: '3 / span 12', gridRow: '4 / span 1' });
  });

  it('counts negative positions from the right and bottom edges', () => {
    // A 10x2 sign hugging the bottom right corner.
    expect(place(grid, -1, -1, 10, 2)).toEqual({
      gridColumn: '37 / span 10',
      gridRow: '17 / span 2',
    });
  });
});
