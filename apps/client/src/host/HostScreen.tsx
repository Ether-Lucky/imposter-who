/**
 * The host display: one departure board, a pure function of the view (04 §4). Rows 0 and
 * 1 are the header and the headline, rows 2 to 16 hold up to 15 passengers, and row 17 is
 * the host's row of signs.
 */
import { useEffect, useRef, useState } from 'react';
import type { HostView } from '@imposter-who/core';
import { BoardGrid, BoardItem, useBoard } from '../flap/BoardGrid.tsx';
import { FlapMotion, FlapRow, type FlapTone } from '../flap/Flap.tsx';
import { formatClock } from '../net/clock.ts';
import { useCountdown } from '../net/useCountdown.ts';
import { OUTCOME_LABEL, nameOf } from '../ui/labels.ts';
import { useReducedMotion } from '../ui/motion.ts';
import { burstConfetti } from '../fx/confetti.ts';
import { hostSfx } from './audio.ts';
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

function Clock({ view, offset }: { view: HostView; offset: number }) {
  const timed = view.phase !== 'voteReveal' && view.phase !== 'result';
  const seconds = useCountdown(timed ? view.deadline : null, view.pausedRemainingMs, offset);
  if (seconds === null) return null;
  const urgent = view.phase === 'discussion' ? seconds <= 15 : seconds <= 5;
  return (
    <BoardItem col={-1} row={0} w={5}>
      <span aria-label="Time left">
        <FlapRow text={formatClock(seconds)} width={5} tone={urgent ? 'amber' : 'ink'} />
      </span>
    </BoardItem>
  );
}

/** Row 0: what this round is, plus the clock. */
function Header({ view, offset, text }: { view: HostView; offset: number; text: string }) {
  const grid = useBoard();
  return (
    <>
      <BoardItem col={0} row={0} w={grid.cols - 7}>
        <FlapRow text={fitWords(text, grid.cols - 7)} width={grid.cols - 7} />
      </BoardItem>
      <Clock view={view} offset={offset} />
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

  let info = infoLine(view, grid.cols - 7);
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
    info = fitWords(parts.join('  '), grid.cols - 7);
  }

  const votesShown = reveal.beat?.votesShown ?? 0;
  useEffect(() => {
    if (view.phase === 'voteReveal' && votesShown > 0) hostSfx('stamp');
  }, [view.phase, votesShown]);

  const controls = controlsFor(view, act, reveal.skip);
  const room = grid.cols - signRunWidth(controls) - 2;

  useConfetti(view, reduced);

  return (
    <>
      <Header view={view} offset={offset} text={info} />
      <Headline
        text={head.text}
        tone={head.tone}
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

/** Chad confetti on a win (04 §4.11). */
function useConfetti(view: HostView, reduced: boolean) {
  const outcome = view.phase === 'result' ? view.round?.outcome : null;
  const key = outcome ? `${view.round!.number}:${outcome.reason}` : null;
  const imposter = view.round?.imposterId ?? null;
  useEffect(() => {
    if (!key || reduced || !outcome || outcome.winner === 'none') return;
    const id = setTimeout(() => {
      if (outcome.winner === 'civilians') {
        burstConfetti({ x: 0, y: innerHeight * 0.85, angle: -60, spread: 35, count: 90 });
        burstConfetti({ x: innerWidth, y: innerHeight * 0.85, angle: -120, spread: 35, count: 90 });
      } else {
        const el = document.querySelector(`[data-row-id="${imposter}"] .board-item:nth-child(2)`);
        const rect = el?.getBoundingClientRect();
        burstConfetti({
          x: rect ? rect.left + rect.width / 2 : innerWidth / 2,
          y: rect ? rect.top : innerHeight / 2,
          angle: -90,
          spread: 25,
          count: 120,
        });
      }
    }, 600);
    return () => clearTimeout(id);
  }, [key, reduced, outcome, imposter]);
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
