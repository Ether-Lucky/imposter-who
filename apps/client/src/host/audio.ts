/**
 * The host's audio director (REQ-AUD-1, 04 §7, T6.2): unlocks on the first click on the
 * board, plays a low ambience in the lobby, a sound per cue, a drum roll under the vote
 * reveal, and the flap clatter. Stingers duck the ambience. Volume and mute follow the
 * host settings.
 */
import { useEffect, useRef } from 'react';
import type { Cue, HostView } from '@imposter-who/core';
import { setFlapStepSound } from '../flap/Flap.tsx';
import {
  ambience,
  audioReady,
  drumRoll,
  flapTick,
  setMasterVolume,
  sfx,
  unlockAudio,
} from '../fx/synth.ts';

let enabled = false;

/** Play one sound if the host has sound on and the board has been clicked once. */
export function hostSfx(name: keyof typeof sfx) {
  if (enabled && audioReady()) sfx[name]();
}

/** Which sound a cue makes on the board, if any. */
export function cueSound(cue: Cue, view: HostView): keyof typeof sfx | null {
  switch (cue.cue) {
    case 'playerJoined':
      return 'checkIn';
    case 'roundStart':
      return 'departure';
    case 'turnStart':
      return 'turn';
    case 'clueLanded':
      return 'thunk';
    case 'finalCall':
      return 'finalCall';
    case 'lastCall':
      return 'departed';
    case 'intermission':
      return 'cancelled';
    case 'result': {
      const outcome = view.round?.outcome;
      if (!outcome) return null;
      if (outcome.reason === 'civilianVotedOut') return 'cancelled';
      if (outcome.reason === 'imposterCaught') return 'departed';
      return outcome.winner === 'none' ? null : 'fanfare';
    }
    default:
      return null;
  }
}

export function useHostAudio(view: HostView | null, cue: { cue: Cue; n: number } | null) {
  const on = !!view?.settings.hostSound;
  const volume = (view?.settings.hostVolume ?? 70) / 100;
  const phase = view?.phase;
  const amb = useRef<ReturnType<typeof ambience> | null>(null);
  const roll = useRef<(() => void) | null>(null);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });

  // Unlock on the first gesture anywhere on the board (autoplay rules).
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      setMasterVolume(volume);
    };
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
    return () => {
      removeEventListener('pointerdown', unlock);
      removeEventListener('keydown', unlock);
    };
  }, [volume]);

  useEffect(() => {
    enabled = on;
    setMasterVolume(volume);
    setFlapStepSound(on ? flapTick : null);
    return () => setFlapStepSound(null);
  }, [on, volume]);

  // Ambience in the lobby only; the drum roll only under the vote reveal.
  useEffect(() => {
    if (!on) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const start = () => {
      if (!audioReady()) {
        if (tries++ < 600) timer = setTimeout(start, 500);
        return;
      }
      if (phase === 'lobby') amb.current = ambience();
      if (phase === 'voteReveal') roll.current = drumRoll();
    };
    start();
    return () => {
      clearTimeout(timer);
      amb.current?.stop();
      amb.current = null;
      roll.current?.();
      roll.current = null;
    };
  }, [on, phase]);

  const n = cue?.n;
  useEffect(() => {
    const v = viewRef.current;
    if (!cue || !v || !enabled || !audioReady()) return;
    const name = cueSound(cue.cue, v);
    if (!name) return;
    // The thunk lands when the clue's cells settle, after the cascade.
    const delay = name === 'thunk' ? 700 : 0;
    const id = setTimeout(() => {
      amb.current?.duck(1500);
      sfx[name]();
    }, delay);
    return () => clearTimeout(id);
    // Each cue plays once, keyed by its counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
}
