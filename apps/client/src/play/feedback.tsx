/**
 * Phone haptics and opt-in sounds (REQ-AUD-2, REQ-AUD-3, 04 §7). Patterns are identical
 * for every role (REQ-SEC-2). One per-phone toggle cycles: vibration only (default),
 * vibration and sound, all off. iOS Safari has no Vibration API; that is skipped silently.
 */
import { useSyncExternalStore } from 'react';
import { SpeakerHighIcon, SpeakerSlashIcon, VibrateIcon } from '@phosphor-icons/react';
import { sfx, unlockAudio } from '../fx/synth.ts';

export type Buzz =
  'join' | 'roundStart' | 'torn' | 'turn' | 'finalCall' | 'vote' | 'win' | 'loss' | 'countdown';
export type FeedbackLevel = 'haptics' | 'all' | 'off';

/** 04 §7, phone columns. */
export const HAPTICS: Record<Buzz, number[]> = {
  join: [20],
  roundStart: [20],
  torn: [15],
  turn: [40, 60, 40],
  finalCall: [30, 50, 30, 50, 30],
  vote: [25],
  win: [30, 60, 45, 60, 60],
  loss: [200],
  /** The last 3 seconds of your turn (REQ-UX-8). */
  countdown: [35],
};

const SOUNDS: Partial<Record<Buzz, () => void>> = {
  join: sfx.checkIn,
  torn: sfx.tear,
  turn: sfx.ding,
  finalCall: sfx.ding,
  vote: sfx.punch,
  win: sfx.win,
  loss: sfx.loss,
  countdown: sfx.tick,
};

const KEY = 'iw-feedback';
const listeners = new Set<() => void>();

function read(): FeedbackLevel {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'all' || v === 'off' ? v : 'haptics';
  } catch {
    return 'haptics';
  }
}

let level: FeedbackLevel = typeof window === 'undefined' ? 'haptics' : read();

export function setFeedbackLevel(next: FeedbackLevel) {
  level = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private mode: the choice lasts for this page.
  }
  for (const l of listeners) l();
}

export function feedback(kind: Buzz) {
  if (level === 'off' || typeof navigator === 'undefined') return;
  navigator.vibrate?.(HAPTICS[kind]);
  if (level === 'all' && unlockAudio()) SOUNDS[kind]?.();
}

function useLevel(): FeedbackLevel {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => level,
    () => 'haptics',
  );
}

const NEXT: Record<FeedbackLevel, FeedbackLevel> = { haptics: 'all', all: 'off', off: 'haptics' };
const LABEL: Record<FeedbackLevel, string> = {
  haptics: 'Vibration on, sound off. Tap to turn sound on',
  all: 'Vibration and sound on. Tap to turn both off',
  off: 'Vibration and sound off. Tap to turn vibration on',
};

export function FeedbackToggle() {
  const current = useLevel();
  const Icon =
    current === 'all' ? SpeakerHighIcon : current === 'off' ? SpeakerSlashIcon : VibrateIcon;
  return (
    <button
      type="button"
      aria-label={LABEL[current]}
      title={LABEL[current]}
      onClick={() => {
        const next = NEXT[current];
        if (next === 'all') unlockAudio();
        setFeedbackLevel(next);
        if (next !== 'off') feedback('vote');
      }}
      className="grid size-12 place-items-center rounded-md text-ink-dim active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-amber"
    >
      <Icon size={24} weight="bold" />
    </button>
  );
}
