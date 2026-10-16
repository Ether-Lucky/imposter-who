/**
 * REQ-WORD-2: create, rename, edit and delete custom categories. One word per line;
 * aliases after a slash ("doughnut / donut").
 */
import { useState } from 'react';
import type { Category, RawCategory } from '@imposter-who/core';
import { Button } from '../ui/Button.tsx';
import { saveCustomCategories, type CategoryList } from './api.ts';

interface Draft {
  id?: string;
  name: string;
  text: string;
}

export function toText(category: Category): string {
  return category.words.map((w) => [w.word, ...w.aliases].join(' / ')).join('\n');
}

export function fromText(text: string): (string | string[])[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .filter((parts) => parts.length > 0)
    .map((parts) => (parts.length === 1 ? parts[0]! : parts));
}

export function CategoryEditor({
  categories,
  onSaved,
  onClose,
}: {
  categories: CategoryList;
  onSaved: (list: CategoryList) => void;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    categories.custom.map((c) => ({ id: c.id, name: c.name, text: toText(c) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const patch = (i: number, change: Partial<Draft>) =>
    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...change } : x)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const raw: RawCategory[] = drafts.map((d) => ({
        id: d.id ?? '',
        name: d.name,
        words: fromText(d.text),
      }));
      onSaved(await saveCustomCategories(raw));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-board/90 p-4">
      <section
        role="dialog"
        aria-label="Custom lists"
        className="grid max-h-[90dvh] w-full max-w-3xl grid-rows-[auto_1fr_auto] gap-4 rounded-xl bg-flap p-6"
      >
        <header>
          <h2 className="text-2xl font-bold uppercase">Custom lists</h2>
          <p className="text-ink-dim">
            One word per line. Add other accepted spellings after a slash: doughnut / donut. Players
            can see this screen, so edit before everyone arrives.
          </p>
        </header>

        <div className="grid content-start gap-6 overflow-y-auto pr-2">
          {drafts.length === 0 && <p className="text-ink-dim">No custom lists yet.</p>}
          {drafts.map((d, i) => (
            <div key={d.id ?? `new-${i}`} className="grid gap-2 rounded-lg bg-board p-4">
              <label className="grid gap-1">
                <span className="text-sm tracking-widest text-ink-dim uppercase">Name</span>
                <input
                  value={d.name}
                  maxLength={24}
                  onChange={(e) => patch(i, { name: e.target.value })}
                  className="min-h-11 rounded-md border border-ink/20 bg-flap px-3"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm tracking-widest text-ink-dim uppercase">
                  Words ({fromText(d.text).length})
                </span>
                <textarea
                  value={d.text}
                  rows={6}
                  onChange={(e) => patch(i, { text: e.target.value })}
                  className="rounded-md border border-ink/20 bg-flap px-3 py-2 font-mono"
                />
              </label>
              <Button
                tone="danger"
                className="justify-self-start"
                onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))}
              >
                Delete list
              </Button>
            </div>
          ))}
          <Button
            className="justify-self-start"
            onClick={() => setDrafts((d) => [...d, { name: 'New list', text: '' }])}
          >
            Add a list
          </Button>
        </div>

        <footer className="flex flex-wrap items-center gap-3">
          <Button tone="primary" disabled={saving} onClick={save}>
            Save lists
          </Button>
          <Button tone="ghost" onClick={onClose}>
            Cancel
          </Button>
          {error && <p className="text-red">{error}</p>}
        </footer>
      </section>
    </div>
  );
}
