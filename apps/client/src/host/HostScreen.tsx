/**
 * The host display: one departure board, a pure function of the view (04 §4). Rows 0 and
 * 1 are the header and the headline, rows 2 to 16 hold up to 15 passengers, and row 17 is
 * the host's row of signs.
 */
import { useEffect, useRef, useState } from 'react';
import type { HostView } from '@imposter-who/core';
import { BoardGrid, BoardItem, useBoard } from '../flap/BoardGrid.tsx';
import { FlapMotion, FlapRow, type FlapTone } from '../flap/Flap.tsx';
import { useCountdown } from '../net/useCountdown.ts';
import { OUTCOME_LABEL, nameOf } from '../ui/labels.ts';
import { useReducedMotion } from '../ui/motion.ts';
import { burstConfetti } from '../fx/confetti.ts';
import { hostSfx } from './audio.ts';
import { BigClock, CLOCK_COLS, TimerBar } from './clock.tsx';
import { fireworks, flicker, getaway, shudder, sweep, verdictStamp } from './effects.ts';
import { Lobby } from './Lobby.tsx';
import { FIRST_ROW, FOOTER_ROW, Headline, MAX_ROWS, PassengerRows } from './rows.tsx';
import {
  MANHUNT_TICKER_LINES,
  TICKER_LINES,
  boardRows,
  fitWords,
  headline,
  infoLine,
} from './model.ts';
import { beatAt, revealHeadline, revealPlan, sameBeat, type RevealBeat } from './revealTimeline.ts';
import { SignRun, signRunWidth, type SignSpec } from './Sign.tsx';
import type { HostScreenProps, Send } from './types.ts';

/** Server-side fallback for the vote reveal is 12 s; the board normally finishes first. */
export const REVEAL_FALLBACK_MS = 12_000;

function useAck(send: Send) {
  const [error, setError] = useState<string | null>(null);
  const act = async (event: string, payload?: unknown) => {
    const ack = await send(event, payload);
    setError(ack.ok ? null : ack.message);
    return ack.ok;
  };
  return { error, act };
}

/** Whether the clock module is up: rows 0 and 1 make room for it. */
const hasClock = (view: HostView) =>
  view.phase !== 'voteReveal' &&
  view.phase !== 'result' &&
  (view.deadline !== null || view.pausedRemainingMs !== null);

/** Row 0: what this round is; the big clock sits at the right of rows 0 and 1. */
function Header({ view, offset, text }: { view: HostView; offset: number; text: string }) {
  const grid = useBoard();
  const w = grid.cols - (hasClock(view) ? CLOCK_COLS + 1 : 0);
  return (
    <>
      <BoardItem col={0} row={0} w={w}>
        <FlapRow text={fitWords(text, w)} width={w} />
      </BoardItem>
      <BigClock view={view} offset={offset} />
      <TimerBar view={view} offset={offset} />
    </>
  );
}

/** Row 17, left of the signs: a line of flaps that fits whatever room is left. */
function FooterText({ text, room, tone = 'dim' }: { text: string; room: number; tone?: FlapTone }) {
  if (room < 6) return null;
  return (
    <BoardItem col={0} row={FOOTER_ROW} w={room}>
      <FlapRow text={fitWords(text, room)} width={room} tone={tone} />
    </BoardItem>
  );
}

/** The platform ticker (04 §4.7): house lines in chunks that fit; quiet near the end. */
function Ticker({ view, room, quiet }: { view: HostView; room: number; quiet: boolean }) {
  const lines = view.match ? MANHUNT_TICKER_LINES : TICKER_LINES;
  const chunks = lines.flatMap((line) => chunk(line, room));
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (quiet || reduced) return;
    const id = setInterval(() => setI((n) => n + 1), 3500);
    return () => clearInterval(id);
  }, [quiet, reduced]);
  return <FooterText text={quiet ? '' : (chunks[i % chunks.length] ?? '')} room={room} />;
}

function chunk(line: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of line.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > width && cur) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** Last call suspense (04 §4.10): cells shuffle, never leaking anything. */
function Shuffle({ room }: { room: number }) {
  const reduced = useReducedMotion();
  const w = Math.min(10, room);
  const [text, setText] = useState('?'.repeat(w));
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      setText(Array.from({ length: w }, () => abc[Math.floor(Math.random() * 26)]).join(''));
    }, 260);
    return () => clearInterval(id);
  }, [reduced, w]);
  if (room < 6) return null;
  return (
    <BoardItem col={0} row={FOOTER_ROW} w={w}>
      <FlapRow text={text} width={w} tone="amber" />
    </BoardItem>
  );
}

function useRevealClock(view: HostView, send: Send, reduced: boolean) {
  const ballots = view.round?.ballots.length ?? 0;
  const active = view.phase === 'voteReveal';
  // The beat for one ballot's reveal. A new ballot (a revote) starts again from 0. The
  // board re-renders only when the beat changes, not on every tick.
  const skipped = useRef(-1);
  const sent = useRef(-1);
  const ballot = view.round?.ballots.at(-1);
  const result = ballot?.result;
  const voters = view.round?.turnOrder.length ?? 0;
  const [clock, setClock] = useState<{ ballots: number; beat: RevealBeat | null }>({
    ballots,
    beat: null,
  });

  useEffect(() => {
    if (!active || !result) return;
    const plan = revealPlan(voters, result, reduced);
    const t0 = performance.now();
    const tick = () => {
      const t = skipped.current === ballots ? Infinity : performance.now() - t0;
      const next = beatAt(plan, voters, t);
      setClock((c) =>
        c.ballots === ballots && c.beat && sameBeat(c.beat, next) ? c : { ballots, beat: next },
      );
    };
    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [active, ballots, result, voters, reduced]);

  const beat =
    clock.ballots === ballots && clock.beat
      ? clock.beat
      : result
        ? beatAt(revealPlan(voters, result, reduced), voters, 0)
        : null;
  useEffect(() => {
    if (active && beat?.done && sent.current !== ballots) {
      sent.current = ballots;
      void send('reveal:done');
    }
  }, [active, beat?.done, ballots, send]);

  return {
    beat,
    ballot,
    skip: () => {
      skipped.current = ballots;
      if (result)
        setClock({ ballots, beat: beatAt(revealPlan(voters, result, reduced), voters, Infinity) });
    },
  };
}

function controlsFor(
  view: HostView,
  act: (e: string, p?: unknown) => Promise<boolean>,
  skipReveal: () => void,
): SignSpec[] {
  const pause: SignSpec = {
    label: view.paused ? 'RESUME' : 'PAUSE',
    tone: view.paused ? 'amber' : 'plain',
    onClick: () => void act(view.paused ? 'game:resume' : 'game:pause'),
  };
  const end: SignSpec = {
    label: 'END',
    tone: 'red',
    title: view.match ? 'End match' : 'End round',
    onClick: () => {
      const what = view.match ? 'match' : 'round';
      if (confirm(`End this ${what} with no result and go back to check-in?`))
        void act('lobby:return');
    },
  };
  const timed = view.deadline !== null || view.pausedRemainingMs !== null;
  const more: SignSpec = {
    label: '+30 S',
    onClick: () => void act('timer:add', { seconds: 30 }),
    title: 'Add 30 seconds',
  };
  switch (view.phase) {
    case 'reveal':
      return [
        { label: 'START CLUES', tone: 'amber', onClick: () => void act('phase:continue') },
        pause,
        end,
      ];
    case 'clues':
      return [
        {
          label: view.settings.clueMode === 'spoken' ? 'NEXT' : 'SKIP TURN',
          onClick: () => void act('phase:skip'),
          title: view.settings.clueMode === 'spoken' ? 'Next passenger' : 'Skip turn',
        },
        pause,
        end,
      ];
    case 'discussion':
      return [
        {
          label: 'VOTE NOW',
          tone: 'amber',
          onClick: () => void act('phase:skip'),
          title: 'Go to vote',
        },
        ...(timed ? [more] : []),
        pause,
        end,
      ];
    case 'voting':
      return [
        {
          label: 'CLOSE VOTE',
          tone: 'amber',
          onClick: () => void act('phase:skip'),
          title: 'Close voting',
        },
        ...(timed ? [more] : []),
        pause,
        end,
      ];
    case 'voteReveal':
      return [{ label: 'SKIP', onClick: skipReveal, title: 'Skip the reveal' }];
    case 'lastChance':
      return [pause, end];
    case 'intermission':
      return [
        {
          label: 'NEXT DEPARTURE',
          tone: 'amber',
          onClick: () => void act('round:next'),
          title: 'Next round',
        },
        {
          label: 'END MATCH',
          tone: 'red',
          onClick: () => {
            if (confirm('End this match with no result and go back to check-in?'))
              void act('lobby:return');
          },
        },
      ];
    case 'result':
      return view.round?.overrideOpen
        ? [
            {
              label: 'TABLE SAYS IT COUNTS',
              tone: 'outline-amber',
              onClick: () => void act('guess:override'),
              title: 'Table says it counts',
            },
            { label: 'NEXT DEPARTURE', tone: 'amber', onClick: () => void act('round:next') },
          ]
        : [
            {
              label: 'NEXT DEPARTURE',
              tone: 'amber',
              onClick: () => void act('round:next'),
              title: 'Next round',
            },
            {
              label: 'CHECK-IN',
              onClick: () => void act('lobby:return'),
              title: 'Back to check-in',
            },
            { label: 'RESET', onClick: () => void act('scores:reset'), title: 'Reset scores' },
          ];
    default:
      return [];
  }
}

function resultHeadline(view: HostView): { text: string; tone: FlapTone } {
  const outcome = view.round!.outcome!;
  const winner =
    outcome.winner === 'civilians'
      ? 'CIVILIANS WIN'
      : outcome.winner === 'imposter'
        ? 'IMPOSTER WINS'
        : 'NO RESULT';
  return {
    text: `${winner}. ${OUTCOME_LABEL[outcome.reason].toUpperCase()}`,
    tone: outcome.winner === 'none' ? 'dim' : 'amber',
  };
}

function InRound({ view, offset, send }: HostScreenProps) {
  const grid = useBoard();
  const reduced = useReducedMotion();
  const { error, act } = useAck(send);
  const reveal = useRevealClock(view, send, reduced);
  const round = view.round!;
  const rows = boardRows(view);

  // The verdict lands on the screen after the reveal, the first moment the board knows it.
  if (view.phase === 'result' || view.phase === 'intermission') {
    const ejected = round.ballots.at(-1)?.ejectedId;
    for (const row of rows) {
      if (row.id === ejected && round.imposterId !== row.id) {
        row.status = 'CANCELLED';
        row.tone = 'red';
      }
    }
  }

  const headW = grid.cols - (hasClock(view) ? CLOCK_COLS + 1 : 0);
  let info = infoLine(view, headW);
  let head: { text: string; tone: FlapTone } = { text: headline(view), tone: 'amber' };
  if (view.phase === 'voteReveal' && reveal.beat?.announced && reveal.ballot) {
    head = {
      text: revealHeadline(reveal.ballot.result, {
        ejected: reveal.ballot.ejectedId
          ? nameOf(view, reveal.ballot.ejectedId).toUpperCase()
          : null,
        tied: reveal.ballot.tied.map((id) => nameOf(view, id).toUpperCase()),
      }),
      tone: 'amber',
    };
  }
  if (view.phase === 'lastChance') {
    head = {
      text: `${nameOf(view, round.imposterId).toUpperCase()} DEPARTED. LAST CALL: NAME THE DESTINATION?`,
      tone: 'amber',
    };
  }
  if (view.phase === 'intermission') {
    const ejected = round.ballots.at(-1)?.ejectedId;
    head = ejected
      ? { text: `${nameOf(view, ejected).toUpperCase()}: CANCELLED. NOT THE IMPOSTER`, tone: 'red' }
      : { text: 'INTERMISSION. NOBODY LEFT THE TRAIN', tone: 'amber' };
  }
  if (view.phase === 'result') {
    head = resultHeadline(view);
    const parts = [`DESTINATION: ${(round.word?.word ?? '').toUpperCase()}`];
    if (round.guess)
      parts.push(`GUESS: ${round.guess.text.toUpperCase()} ${round.guess.correct ? 'OK' : 'X'}`);
    info = fitWords(parts.join('  '), headW);
  }

  const votesShown = reveal.beat?.votesShown ?? 0;
  useEffect(() => {
    if (view.phase === 'voteReveal' && votesShown > 0) hostSfx('stamp');
  }, [view.phase, votesShown]);

  const controls = controlsFor(view, act, reveal.skip);
  const room = grid.cols - signRunWidth(controls) - 2;

  useShowpieces(view, reduced);

  return (
    <>
      <Header view={view} offset={offset} text={info} />
      <Headline
        text={head.text}
        tone={head.tone}
        w={headW}
        blink={view.phase === 'voting' ? `vote:${round.ballots.length}` : undefined}
      />
      {view.phase === 'clues' && round.lap > 1 && <LapSweep key={round.lap} />}
      <PassengerRows
        view={view}
        rows={rows}
        reveal={
          view.phase === 'voteReveal' && reveal.beat && reveal.ballot
            ? { beat: reveal.beat, ballot: reveal.ballot }
            : undefined
        }
        score={view.phase === 'result'}
      />
      {view.phase === 'voteReveal' && reveal.beat && reveal.ballot && (
        <Searchlight
          rows={rows.length}
          accused={rows.findIndex((r) => r.id === reveal.ballot!.ejectedId)}
          sweeping={reveal.beat.tally && !reveal.beat.lifted && !reduced}
          landed={reveal.beat.lifted}
        />
      )}
      {view.phase === 'voteReveal' && (
        <BoardItem col={0} row={FIRST_ROW} w={grid.cols} h={MAX_ROWS}>
          <button
            type="button"
            aria-label="Skip the reveal"
            className="absolute inset-0 cursor-pointer"
            onClick={reveal.skip}
          />
        </BoardItem>
      )}
      {view.phase === 'discussion' && <TickerSlot view={view} offset={offset} room={room} />}
      {view.phase === 'clues' && round.laps > 1 && (
        <FooterText text={`LAP ${round.lap} OF ${round.laps}`} room={room} />
      )}
      {view.phase === 'lastChance' && <Shuffle room={room} />}
      {error && <FooterText text={error} room={room} tone="red" />}
      <SignRun row={FOOTER_ROW} signs={controls} />
      {view.paused && <Paused view={view} />}
    </>
  );
}

/** A thin amber sweep across the board when a new lap starts (04 §4.6). */
function LapSweep() {
  const grid = useBoard();
  return (
    <BoardItem
      col={0}
      row={FIRST_ROW}
      w={grid.cols}
      h={MAX_ROWS}
      className="pointer-events-none overflow-hidden"
    >
      <span className="lap-sweep" aria-hidden />
    </BoardItem>
  );
}

function TickerSlot({ view, offset, room }: { view: HostView; offset: number; room: number }) {
  const seconds = useCountdown(view.deadline, view.pausedRemainingMs, offset);
  return <Ticker view={view} room={room} quiet={seconds !== null && seconds <= 15} />;
}

function Paused({ view }: { view: HostView }) {
  const grid = useBoard();
  const w = Math.min(grid.cols - 2, 30);
  const col = Math.floor((grid.cols - w) / 2);
  return (
    <>
      <BoardItem col={0} row={FIRST_ROW} w={grid.cols} h={MAX_ROWS}>
        <div className="board-veil" />
      </BoardItem>
      <BoardItem col={col} row={8} w={w} className="z-5">
        <FlapRow text="SERVICE PAUSED" width={w} tone="amber" />
      </BoardItem>
      {view.pausedReason === 'lowPlayers' && (
        <BoardItem col={col} row={9} w={w} className="z-5">
          <FlapRow text="WAITING FOR PASSENGERS" width={w} tone="dim" />
        </BoardItem>
      )}
      <p className="sr-only">
        Paused.{' '}
        {view.pausedReason === 'lowPlayers'
          ? 'Fewer than 3 passengers are connected. Wait for them, or end the round.'
          : ''}
      </p>
    </>
  );
}

/**
 * The searchlight (04 §4.14): during the tally a lit band sweeps the passenger rows,
 * faster and faster, then rests on the accused as they lift.
 */
function Searchlight({
  rows,
  accused,
  sweeping,
  landed,
}: {
  rows: number;
  accused: number;
  sweeping: boolean;
  landed: boolean;
}) {
  const grid = useBoard();
  const ref = useRef<HTMLSpanElement>(null);
  const pitch = grid.cellH + grid.gapY;
  useEffect(() => {
    const el = ref.current;
    if (!el || !sweeping || rows < 2) return;
    const span = (rows - 1) * pitch;
    const anim = el.animate(
      [{ transform: 'translateY(0)' }, { transform: `translateY(${span}px)` }],
      { duration: 700, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
    );
    let rate = 1;
    const speed = setInterval(() => {
      rate = Math.min(4, rate * 1.35);
      anim.playbackRate = rate;
    }, 250);
    return () => {
      clearInterval(speed);
      anim.cancel();
    };
  }, [sweeping, rows, pitch]);
  if (!sweeping && !(landed && accused >= 0)) return null;
  return (
    <BoardItem col={0} row={FIRST_ROW} w={grid.cols} h={MAX_ROWS} className="pointer-events-none">
      <span
        ref={ref}
        className="searchlight"
        style={
          landed && accused >= 0 ? { transform: `translateY(${accused * pitch}px)` } : undefined
        }
      />
    </BoardItem>
  );
}

/**
 * Showpiece effects as each phase arrives (04 §4.14): the departure sweep, the final-call
 * flicker, the giant verdict stamp, fireworks or the getaway train. Each fires once per
 * moment, keyed by round and ballot.
 */
function useShowpieces(view: HostView, reduced: boolean) {
  const round = view.round;
  const outcome = view.phase === 'result' ? round?.outcome : null;
  const ballot = round?.ballots.at(-1);
  const key = `${view.phase}:${round?.number}:${round?.ballots.length}:${outcome?.reason ?? ''}`;
  const imposter = round?.imposterId ?? null;
  const ejected = ballot?.result === 'eject' ? ballot.ejectedId : null;
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const stamp = (text: string, tone: 'amber' | 'red') =>
      later(250, () => {
        verdictStamp(text, tone, { reduced });
        hostSfx('boom');
      });
    switch (view.phase) {
      case 'reveal':
        sweep({ reduced });
        later(150, () => shudder({ strength: 3, reduced }));
        break;
      case 'voting':
        flicker({ reduced });
        break;
      case 'lastChance':
        stamp('Departed', 'amber');
        break;
      case 'intermission':
        if (ejected) stamp('Cancelled', 'red');
        break;
      case 'result': {
        if (!outcome) break;
        let delay = 600;
        if (outcome.reason === 'civilianVotedOut') {
          stamp('Cancelled', 'red');
          delay = 2600;
        } else if (outcome.reason === 'imposterCaught') {
          stamp('Departed', 'amber');
          delay = 2600;
        }
        if (outcome.winner === 'civilians') {
          later(delay, () => fireworks({ reduced }));
        } else if (outcome.winner === 'imposter') {
          later(delay, () => {
            getaway('Imposter escaped', { reduced });
            hostSfx('whoosh');
            const row = document.querySelector(
              `[data-row-id="${imposter}"] .board-item:nth-child(2)`,
            );
            const r = row?.getBoundingClientRect();
            if (r && !reduced) {
              burstConfetti({
                x: r.left + r.width / 2,
                y: r.top,
                angle: -90,
                spread: 25,
                count: 80,
              });
            }
          });
        }
        break;
      }
    }
    return () => timers.forEach(clearTimeout);
    // Each moment plays once, keyed by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function HostScreen({ view, offset, send }: HostScreenProps) {
  return (
    <FlapMotion.Provider value={{ reduced: view.settings.reducedMotion ? true : undefined }}>
      <BoardGrid>
        <h1 className="sr-only">Imposter Who?</h1>
        {view.phase === 'lobby' ? (
          <Lobby view={view} send={send} />
        ) : (
          <InRound view={view} offset={offset} send={send} />
        )}
      </BoardGrid>
    </FlapMotion.Provider>
  );
}
