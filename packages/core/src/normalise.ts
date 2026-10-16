/** Word and guess normalisation. Source: REQ-GUESS-3. */
import type { WordEntry } from './types.ts';

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MIN_STEM = 3;

/**
 * The normalised text plus its plausible singular stems, all with spaces removed.
 * Both sides of a comparison are expanded, so "horses" meets "horse" and "berries" meets "berry".
 */
export function forms(text: string): Set<string> {
  const base = normalise(text).replace(/ /g, '');
  const out = new Set<string>();
  if (!base) return out;
  out.add(base);
  const add = (stem: string) => {
    if (stem.length >= MIN_STEM) out.add(stem);
  };
  if (base.endsWith('ies')) add(`${base.slice(0, -3)}y`);
  if (base.endsWith('es')) add(base.slice(0, -2));
  if (base.endsWith('s') && !base.endsWith('ss')) add(base.slice(0, -1));
  return out;
}

function entryForms(entry: WordEntry): Set<string> {
  const all = new Set<string>();
  for (const w of [entry.word, ...entry.aliases]) for (const f of forms(w)) all.add(f);
  return all;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** True when two strings are the same word after normalisation (also used for duplicate clues). */
export function sameWord(a: string, b: string): boolean {
  return intersects(forms(a), forms(b));
}

/** True when a guess names the secret word or one of its aliases (GUESS-3). */
export function matchesWord(guess: string, entry: WordEntry): boolean {
  return intersects(forms(guess), entryForms(entry));
}

/** True when a civilian's clue equals or contains the secret word (CLUE-2). */
export function clueTooClose(clue: string, entry: WordEntry): boolean {
  const clueForms = forms(clue);
  const secret = entryForms(entry);
  if (intersects(clueForms, secret)) return true;
  // Substring check only for longer words, so "giant" is not blocked by the word "ant".
  for (const c of clueForms) {
    for (const s of secret) if (s.length >= MIN_CONTAINED && c.includes(s)) return true;
  }
  return false;
}

const MIN_CONTAINED = 4;
