/** Word bank parsing and picking. Source: REQ-WORD-1..4. */
import { normalise } from './normalise.ts';
import type { Category, Rng, WordEntry } from './types.ts';

/** On-disk format: a word is either "banana" or ["doughnut", "donut"] (word, then aliases). */
export interface RawCategory {
  id: string;
  name: string;
  words: (string | string[])[];
}

export const RECENT_WORD_LIMIT = 30;

export function parseCategory(raw: RawCategory, custom = false): Category {
  if (
    !raw ||
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    !Array.isArray(raw.words)
  ) {
    throw new Error('Invalid category: needs id, name and words');
  }
  const words: WordEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw.words) {
    const [word, ...aliases] = (Array.isArray(item) ? item : [item]).map((w) => String(w).trim());
    if (!word || !normalise(word)) continue;
    const key = normalise(word);
    if (seen.has(key)) continue;
    seen.add(key);
    words.push({ word, aliases: aliases.filter((a) => normalise(a)) });
  }
  return { id: raw.id, name: raw.name.trim(), words, custom };
}

export function wordKey(categoryId: string, entry: WordEntry): string {
  return `${categoryId}:${normalise(entry.word)}`;
}

export interface PickedWord {
  category: Category;
  entry: WordEntry;
  key: string;
}

/** Selected categories that hold at least one word. */
export function usableCategories(library: Category[], selected: string[]): Category[] {
  const ids = new Set(selected);
  return library.filter((c) => ids.has(c.id) && c.words.length > 0);
}

/**
 * Pick uniformly across every word in the selected categories, skipping recent words
 * unless that empties the pool (WORD-3). Returns null when nothing is usable (WORD-4).
 */
export function pickWord(
  library: Category[],
  selected: string[],
  recent: readonly string[],
  rng: Rng,
): PickedWord | null {
  const all: PickedWord[] = usableCategories(library, selected).flatMap((category) =>
    category.words.map((entry) => ({ category, entry, key: wordKey(category.id, entry) })),
  );
  if (all.length === 0) return null;
  const recentSet = new Set(recent);
  const fresh = all.filter((p) => !recentSet.has(p.key));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[rng.int(pool.length)]!;
}
