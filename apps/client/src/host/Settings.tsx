/** REQ-LOBBY-3 settings, edited from the board in the lobby and between rounds. */
import type { Settings as SettingsT } from '@imposter-who/core';
import type { CategoryList } from './api.ts';
import type { Send } from './types.ts';

type Option<T> = { value: T; label: string };

const secs = (values: number[]): Option<number>[] =>
  values.map((v) => ({ value: v, label: v === 0 ? 'Off' : `${v} s` }));

const CHOICES = {
  clueMode: [
    { value: 'typed', label: 'Typed on phone' },
    { value: 'spoken', label: 'Spoken aloud' },
  ],
  laps: [1, 2, 3].map((v) => ({ value: v, label: String(v) })),
  clueSeconds: secs([0, 15, 30, 45, 60]),
  discussionSeconds: secs([0, 60, 90, 120, 180]),
  voteSeconds: secs([0, 30, 60]),
} as const;

const LABELS: Record<keyof typeof CHOICES, string> = {
  clueMode: 'Clue mode',
  laps: 'Laps per round',
  clueSeconds: 'Clue timer',
  discussionSeconds: 'Discussion timer',
  voteSeconds: 'Vote timer',
};

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm tracking-widest text-ink-dim uppercase">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`min-h-10 rounded-md px-3 text-sm font-bold uppercase active:scale-[0.97] ${
              o.value === value ? 'bg-amber text-ticket-ink' : 'bg-flap text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-amber"
      />
      <span>{label}</span>
    </label>
  );
}

export function SettingsPanel({
  settings,
  categories,
  send,
  onEditCustom,
}: {
  settings: SettingsT;
  categories: CategoryList | null;
  send: Send;
  onEditCustom: () => void;
}) {
  const update = (patch: Partial<SettingsT>) => void send('settings:update', patch);
  const selected = new Set(settings.categories);
  const toggleCategory = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    update({ categories: [...next] });
  };
  const all = categories
    ? [
        ...categories.builtIn,
        ...categories.custom.map((c) => ({ id: c.id, name: c.name, wordCount: c.words.length })),
      ]
    : [];

  return (
    <div className="grid gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        {(Object.keys(CHOICES) as (keyof typeof CHOICES)[]).map((key) => (
          <Segmented
            key={key}
            label={LABELS[key]}
            options={CHOICES[key] as readonly Option<string | number>[]}
            value={settings[key]}
            onChange={(v) => update({ [key]: v } as Partial<SettingsT>)}
          />
        ))}
      </div>

      <div className="grid gap-1">
        <Toggle
          label="Show the category to the imposter"
          checked={settings.showCategoryToImposter}
          onChange={(v) => update({ showCategoryToImposter: v })}
        />
        <Toggle
          label="Imposter can guess early (wrong guess loses)"
          checked={settings.earlyGuess}
          onChange={(v) => update({ earlyGuess: v })}
        />
        <Toggle
          label="Sound on this laptop"
          checked={settings.hostSound}
          onChange={(v) => update({ hostSound: v })}
        />
        <Toggle
          label="Reduce motion"
          checked={settings.reducedMotion}
          onChange={(v) => update({ reducedMotion: v })}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm tracking-widest text-ink-dim uppercase">Categories</legend>
        {!categories && <p className="text-ink-dim">Loading categories…</p>}
        <div className="grid gap-1 sm:grid-cols-2">
          {all.map((c) => (
            <Toggle
              key={c.id}
              label={`${c.name} (${c.wordCount})`}
              checked={selected.has(c.id)}
              onChange={(v) => toggleCategory(c.id, v)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onEditCustom}
          className="justify-self-start text-amber underline underline-offset-4"
        >
          Edit custom lists
        </button>
      </fieldset>
    </div>
  );
}
