/**
 * Laptop-side persistence: settings and custom word lists as JSON in ./.data/,
 * plus the built-in word bank. Source: REQ-LOBBY-3, REQ-WORD-1, REQ-WORD-2.
 */
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  type Category,
  type RawCategory,
  type Settings,
  normalise,
  parseCategory,
  sanitizeSettings,
} from '@imposter-who/core';

export const CUSTOM_LIMITS = {
  categories: 50,
  wordsPerCategory: 500,
  nameMax: 24,
  wordMax: 40,
} as const;

export class StoreError extends Error {}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Write via a temp file and rename, so a crash never leaves half a file. */
function writeJsonAtomic(path: string, data: unknown) {
  const temp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(temp, path);
}

export function loadBuiltInCategories(wordsDir: string): Category[] {
  return readdirSync(wordsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => parseCategory(JSON.parse(readFileSync(join(wordsDir, f), 'utf8')) as RawCategory));
}

/** Validate host-supplied custom categories. Throws StoreError with a readable message. */
export function parseCustomCategories(input: unknown): Category[] {
  if (!Array.isArray(input)) throw new StoreError('Expected a list of categories.');
  if (input.length > CUSTOM_LIMITS.categories) {
    throw new StoreError(`At most ${CUSTOM_LIMITS.categories} custom categories.`);
  }
  const seenIds = new Set<string>();
  return input.map((raw: Partial<RawCategory>) => {
    const name = String(raw?.name ?? '').trim();
    if (!name || name.length > CUSTOM_LIMITS.nameMax) {
      throw new StoreError(`Category names are 1 to ${CUSTOM_LIMITS.nameMax} characters.`);
    }
    if (!Array.isArray(raw.words) || raw.words.length > CUSTOM_LIMITS.wordsPerCategory) {
      throw new StoreError(
        `"${name}" needs a list of up to ${CUSTOM_LIMITS.wordsPerCategory} words.`,
      );
    }
    for (const w of raw.words.flat()) {
      if (String(w).trim().length > CUSTOM_LIMITS.wordMax) {
        throw new StoreError(`Words are at most ${CUSTOM_LIMITS.wordMax} characters.`);
      }
    }
    let id =
      typeof raw.id === 'string' && /^custom-[a-z0-9-]{1,48}$/.test(raw.id) ? raw.id : undefined;
    if (!id || seenIds.has(id)) {
      const slug =
        normalise(name)
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 24) || 'list';
      id = `custom-${slug}-${randomBytes(3).toString('hex')}`;
    }
    seenIds.add(id);
    return parseCategory({ id, name, words: raw.words }, true);
  });
}

export class Store {
  readonly builtIn: Category[];
  private custom: Category[];
  private readonly settingsPath: string;
  private readonly customPath: string;

  constructor(
    private readonly dataDir: string,
    wordsDir: string,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.settingsPath = join(dataDir, 'settings.json');
    this.customPath = join(dataDir, 'custom-words.json');
    this.builtIn = loadBuiltInCategories(wordsDir);
    this.custom = this.loadCustom();
  }

  private loadCustom(): Category[] {
    if (!existsSync(this.customPath)) return [];
    try {
      return parseCustomCategories(readJson(this.customPath));
    } catch (error) {
      console.warn(`Ignoring unreadable ${this.customPath}: ${(error as Error).message}`);
      return [];
    }
  }

  loadSettings(): Partial<Settings> {
    return sanitizeSettings(readJson(this.settingsPath));
  }

  saveSettings(settings: Settings) {
    writeJsonAtomic(this.settingsPath, settings);
  }

  library(): Category[] {
    return [...this.builtIn, ...this.custom];
  }

  customCategories(): Category[] {
    return this.custom;
  }

  /** Replace every custom category. Validates first; nothing is written on error. */
  setCustomCategories(input: unknown): Category[] {
    const parsed = parseCustomCategories(input);
    writeJsonAtomic(
      this.customPath,
      parsed.map((c) => ({
        id: c.id,
        name: c.name,
        words: c.words.map((w) => (w.aliases.length ? [w.word, ...w.aliases] : w.word)),
      })),
    );
    this.custom = parsed;
    return parsed;
  }
}
