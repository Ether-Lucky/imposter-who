import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type Category,
  type RawCategory,
  clueTooClose,
  matchesWord,
  normalise,
  parseCategory,
  pickWord,
  sameWord,
  seededRng,
  wordKey,
} from '../src/index.ts';

const WORDS_DIR = join(import.meta.dirname, '../../../data/words/en');

function loadBuiltIn(): Category[] {
  return readdirSync(WORDS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => parseCategory(JSON.parse(readFileSync(join(WORDS_DIR, f), 'utf8')) as RawCategory));
}

describe('REQ-WORD-1 built-in bank', () => {
  const library = loadBuiltIn();

  it('ships at least 8 categories', () => {
    expect(library.length).toBeGreaterThanOrEqual(8);
  });

  it.each(library.map((c) => [c.id, c] as const))('%s has at least 40 unique words', (_, c) => {
    expect(c.words.length).toBeGreaterThanOrEqual(40);
    expect(new Set(c.words.map((w) => normalise(w.word))).size).toBe(c.words.length);
  });

  it('parses aliases from array entries', () => {
    const food = library.find((c) => c.id === 'food')!;
    expect(food.words.find((w) => w.word === 'doughnut')?.aliases).toEqual(['donut']);
  });

  it('drops blank and duplicate words', () => {
    const c = parseCategory({ id: 'x', name: ' X ', words: ['a b', ' ', 'A B', ['c', '']] });
    expect(c.words).toEqual([
      { word: 'a b', aliases: [] },
      { word: 'c', aliases: [] },
    ]);
    expect(c.name).toBe('X');
  });
});

describe('REQ-WORD-3 no quick repeats', () => {
  const cat: Category = {
    id: 'c',
    name: 'C',
    custom: false,
    words: ['one', 'two', 'three'].map((word) => ({ word, aliases: [] })),
  };

  it('skips recent words while fresh ones remain', () => {
    const rng = seededRng(7);
    const recent = [wordKey('c', cat.words[0]!), wordKey('c', cat.words[1]!)];
    for (let i = 0; i < 20; i++) {
      expect(pickWord([cat], ['c'], recent, rng)!.entry.word).toBe('three');
    }
  });

  it('falls back to the whole pool when everything is recent', () => {
    const recent = cat.words.map((w) => wordKey('c', w));
    expect(pickWord([cat], ['c'], recent, seededRng(1))).not.toBeNull();
  });

  it('only picks from selected categories', () => {
    const other: Category = { ...cat, id: 'other', words: [{ word: 'nope', aliases: [] }] };
    const rng = seededRng(3);
    for (let i = 0; i < 20; i++)
      expect(pickWord([cat, other], ['c'], [], rng)!.category.id).toBe('c');
  });
});

describe('REQ-WORD-4 empty pool', () => {
  it('returns null when no selected category has words', () => {
    const empty: Category = { id: 'e', name: 'E', words: [], custom: true };
    expect(pickWord([empty], ['e'], [], seededRng(1))).toBeNull();
    expect(pickWord([empty], ['missing'], [], seededRng(1))).toBeNull();
  });
});

describe('REQ-GUESS-3 matching', () => {
  const entry = (word: string, ...aliases: string[]) => ({ word, aliases });

  it.each([
    ['BANANA', 'banana'],
    ['  banana ', 'banana'],
    ['bananas', 'banana'],
    ['Banana!', 'banana'],
    ['crème brûlée', 'creme brulee'],
    ['berries', 'berry'],
    ['horses', 'horse'],
    ['glasses', 'glass'],
    ['ice  cream', 'ice cream'],
    ['icecream', 'ice cream'],
    ['Spider Man', 'spider-man'],
  ])('%j matches %j', (guess, word) => {
    expect(matchesWord(guess, entry(word))).toBe(true);
  });

  it.each([
    ['apple', 'banana'],
    ['ban', 'banana'],
    ['', 'banana'],
    ['gas', 'ga'],
  ])('%j does not match %j', (guess, word) => {
    expect(matchesWord(guess, entry(word))).toBe(false);
  });

  it('matches aliases', () => {
    expect(matchesWord('donut', entry('doughnut', 'donut'))).toBe(true);
    expect(matchesWord('Donuts', entry('doughnut', 'donut'))).toBe(true);
  });

  it('normalise strips accents, punctuation and extra spaces', () => {
    expect(normalise('  Jalapeño-Pepper!! ')).toBe('jalapenopepper');
    expect(normalise('E.T.')).toBe('et');
  });

  it('sameWord treats plurals and case as equal', () => {
    expect(sameWord('Fruits', 'fruit')).toBe(true);
    expect(sameWord('fruit', 'yellow')).toBe(false);
  });
});

describe('REQ-CLUE-2 closeness check', () => {
  const banana = { word: 'banana', aliases: [] };

  it('flags clues equal to or containing the word', () => {
    expect(clueTooClose('banana', banana)).toBe(true);
    expect(clueTooClose('Bananas', banana)).toBe(true);
    expect(clueTooClose('bananabread', banana)).toBe(true);
  });

  it('allows related clues', () => {
    expect(clueTooClose('yellow', banana)).toBe(false);
    expect(clueTooClose('giant', { word: 'ant', aliases: [] })).toBe(false);
  });
});
