/**
 * T8.1/T8.2: the mechanical half of the 04 §10 pre-flight checklist, run on every test
 * pass so it stays true: palette only, no em dashes, no emoji, no Inter, no purple, and
 * AA contrast for every colour pair the screens use (REQ-UX-7).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const sources = files(SRC)
  .filter((f) => /\.(tsx?|css)$/.test(f))
  .map((f) => ({ file: f.slice(SRC.length + 1), text: readFileSync(f, 'utf8') }));

const tokens = Object.fromEntries(
  [
    ...readFileSync(join(SRC, 'styles/tokens.css'), 'utf8').matchAll(
      /--color-([a-z-]+): (#[0-9a-f]{6});/g,
    ),
  ].map((m) => [m[1]!, m[2]!]),
);

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('UX pre-flight (04 §10)', () => {
  it('uses only the palette: tokens, plus black and white for light and shade', () => {
    const allowed = new Set([
      ...Object.values(tokens).map((h) => rgb(h).join(' ')),
      '0 0 0',
      '255 255 255',
    ]);
    const found: string[] = [];
    for (const { file, text } of sources) {
      if (file.endsWith('tokens.css')) continue;
      for (const m of text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
        const hex = m[1]!.length === 3 ? m[1]!.replace(/./g, '$&$&') : m[1]!;
        if (!allowed.has(rgb(`#${hex}`).join(' '))) found.push(`${file}: #${m[1]}`);
      }
      for (const m of text.matchAll(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/g)) {
        if (!allowed.has(`${m[1]} ${m[2]} ${m[3]}`)) found.push(`${file}: ${m[0]}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('has the nine palette tokens and nothing purple', () => {
    expect(Object.keys(tokens).sort()).toEqual(
      [
        'amber',
        'board',
        'flap',
        'flap-seam',
        'ink',
        'ink-dim',
        'red',
        'ticket',
        'ticket-ink',
      ].sort(),
    );
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/\b(purple|violet|fuchsia|indigo)-\d/);
    }
  });

  it('no em dashes, no emoji, no Inter, no glow', () => {
    for (const { file, text } of sources) {
      expect(text, file).not.toContain('—');
      expect(text, file).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(text, file).not.toMatch(/['"]Inter['"]|font-inter/);
      expect(text, file).not.toMatch(/text-shadow|drop-shadow\(0 0/);
    }
  });

  describe('REQ-UX-7 contrast', () => {
    const t = tokens as Record<string, string>;
    // Body text: 4.5:1.
    it.each([
      ['ink', 'board'],
      ['ink-dim', 'board'],
      ['ink', 'flap'],
      ['ink-dim', 'flap'],
      ['amber', 'flap'],
      ['amber', 'board'],
      ['ticket-ink', 'ticket'],
      ['ticket-ink', 'amber'],
    ])('%s on %s reaches 4.5:1', (fg, bg) => {
      expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
    });

    // Red only ever appears as large text (flap cells, stamps, headlines) or as a bar.
    it.each([
      ['red', 'flap'],
      ['red', 'board'],
      ['red', 'ticket'],
      ['ink', 'red'],
    ])('%s on %s reaches 3:1 for large text', (fg, bg) => {
      expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
    });
  });
});
