/**
 * REQ-LOBBY-3 settings as a station timetable (04 §4.3): a panel that slides up over the
 * passenger rows. Each value is a flap selector; the arrows either side flap the value cell.
 */
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import type { Settings as SettingsT } from '@imposter-who/core';
import { FlapRow } from '../flap/Flap.tsx';
import type { CategoryList } from './api.ts';
import type { Send } from './types.ts';

type Option<T> = { value: T; label: string };

const secs = (values: number[]): Option<number>[] =>
  values.map((v) => ({ value: v, label: v === 0 ? 'OFF' : `${v} S` }));

/** Steps for the laptop volume (REQ-AUD-1); 70 is the default. */
const VOLUMES: Option<number>[] = [20, 40, 55, 70, 85, 100].map((v) => ({
  value: v,
  label: `${v}%`,
}));

const ONOFF: Option<boolean>[] = [
  { value: true, label: 'ON' },
  { value: false, label: 'OFF' },
];

export const CHOICES = {
  mode: [
    { value: 'classic', label: 'CLASSIC' },
    { value: 'manhunt', label: 'MANHUNT' },
  ],
  lives: [
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 0, label: 'NO LIMIT' },
  ],
  clueMode: [
    { value: 'typed', label: 'TYPED' },
    { value: 'spoken', label: 'SPOKEN' },
  ],
  laps: [1, 2, 3].map((v) => ({ value: v, label: String(v) })),
  clueSeconds: secs([0, 15, 30, 45, 60]),
  discussionSeconds: secs([0, 60, 90, 120, 180]),
  voteSeconds: secs([0, 30, 60]),
} as const;

const LABELS: Record<keyof typeof CHOICES, string> = {
  mode: 'Game mode',
  lives: 'Lives (wrong votes allowed)',
  clueMode: 'Clue mode',
  laps: 'Laps per round',
  clueSeconds: 'Clue timer',
  discussionSeconds: 'Discussion timer',
  voteSeconds: 'Vote timer',
};

const TOGGLES = {
  showCategoryToImposter: 'Show the category to the imposter',
  earlyGuess: 'Imposter can guess early (wrong guess loses)',
  hostSound: 'Sound on this laptop',
  reducedMotion: 'Reduce motion',
} as const;

function Selector<T extends string | number | boolean>({
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
  const at = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const step = (by: number) =>
    onChange(options[(at + by + options.length) % options.length]!.value);
  const arrow =
    'grid h-[var(--cell-h)] w-[calc(var(--cell-h)*0.68)] place-items-center rounded-[3px] text-ink active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-amber hover:bg-ink/10';
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-[calc(var(--cell-h)*0.08)]"
    >
      <span className="board-text min-w-0 flex-1 text-ink uppercase">{label}</span>
      <button
        type="button"
        className={arrow}
        aria-label={`Previous ${label}`}
        onClick={() => step(-1)}
      >
        <CaretLeftIcon size="70%" weight="bold" />
      </button>
      <span aria-live="polite">
        <span className="sr-only">{options[at]?.label}</span>
        <FlapRow text={options[at]?.label ?? ''} width={8} tone="amber" />
      </span>
      <button type="button" className={arrow} aria-label={`Next ${label}`} onClick={() => step(1)}>
        <CaretRightIcon size="70%" weight="bold" />
      </button>
    </div>
  );
}

export function Timetable({
  open,
  settings,
  categories,
  send,
  onEditCustom,
}: {
  open: boolean;
  settings: SettingsT;
  categories: CategoryList | null;
  send: Send;
  onEditCustom: () => void;
}) {
  const update = (patch: Partial<SettingsT>) => void send('settings:update', patch);
  const selected = new Set(settings.categories);
  const toggleCategory = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update({ categories: [...next] });
  };
  const all = categories
    ? [
        ...categories.builtIn,
        ...categories.custom.map((c) => ({ id: c.id, name: c.name, wordCount: c.words.length })),
      ]
    : [];
  const toggles = (Object.keys(TOGGLES) as (keyof typeof TOGGLES)[]).filter(
    (k) => k !== 'earlyGuess' || settings.mode === 'classic',
  );

  return (
    <section
      aria-label="Timetable (settings)"
      aria-hidden={!open}
      inert={!open}
      data-state={open ? 'open' : 'closed'}
      className="board-panel pointer-events-auto grid h-full gap-x-[calc(var(--cell-h)*0.8)] gap-y-[calc(var(--cell-h)*0.14)] md:grid-cols-2"
    >
      <div className="grid content-start gap-[calc(var(--cell-h)*0.14)]">
        <h2 className="board-text tracking-[0.2em] text-ink-dim uppercase">Timetable</h2>
        {(Object.keys(CHOICES) as (keyof typeof CHOICES)[])
          .filter((key) => key !== 'lives' || settings.mode === 'manhunt')
          .map((key) => (
            <Selector
              key={key}
              label={LABELS[key]}
              options={CHOICES[key] as readonly Option<string | number>[]}
              value={settings[key]}
              onChange={(v) => update({ [key]: v } as Partial<SettingsT>)}
            />
          ))}
        {toggles.map((key) => (
          <Selector
            key={key}
            label={TOGGLES[key]}
            options={ONOFF}
            value={settings[key]}
            onChange={(v) => update({ [key]: v })}
          />
        ))}
        {settings.hostSound && (
          <Selector
            label="Laptop volume"
            options={VOLUMES}
            value={settings.hostVolume}
            onChange={(v) => update({ hostVolume: v })}
          />
        )}
        <p className="board-text">
          {settings.mode === 'manhunt'
            ? 'Manhunt: the imposter can never guess. Wrong votes knock a passenger out and cost a life; a new word each round until the imposter is caught or the lives run out.'
            : 'Classic: one vote. If caught, the imposter gets one guess at the word to steal the win.'}
        </p>
      </div>

      <div className="grid content-start gap-[calc(var(--cell-h)*0.14)]">
        <h2 className="board-text tracking-[0.2em] text-ink-dim uppercase">Lines (categories)</h2>
        {!categories && <p className="board-text">Loading categories…</p>}
        <div className="grid gap-[calc(var(--cell-h)*0.14)] sm:grid-cols-2">
          {all.map((c) => {
            const on = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCategory(c.id)}
                className={`flex min-h-[var(--cell-h)] items-center justify-between gap-2 rounded-[3px] border-[1.5px] px-[calc(var(--cell-h)*0.3)] text-left font-[family-name:var(--font-flap)] text-[calc(var(--cell-h)*0.55)] font-bold tracking-[0.06em] uppercase active:scale-[0.97] ${
                  on ? 'border-amber text-amber' : 'border-ink/25 text-ink-dim'
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="tabular-nums">
                  {on ? 'ON' : 'OFF'} · {c.wordCount}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onEditCustom}
          className="board-text justify-self-start text-amber underline underline-offset-4"
        >
          Edit custom lists
        </button>
      </div>
    </section>
  );
}
