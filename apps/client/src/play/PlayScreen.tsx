/**
 * The whole controller as a pure function of the view (04 §5). One ticket on a dark
 * ground; primary actions sit in the bottom third (REQ-UX-5). Layout is identical for
 * every role (REQ-GUESS-5).
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Ack, PlayerView } from '@imposter-who/core';
import { FlapMotion } from '../flap/Flap.tsx';
import { burstConfetti } from '../fx/confetti.ts';
import { formatClock } from '../net/clock.ts';
import type { Status } from '../net/connection.ts';
import { useCountdown } from '../net/useCountdown.ts';
import { Button } from '../ui/Button.tsx';
import { HoldButton } from '../ui/HoldButton.tsx';
import { OUTCOME_LABEL, PHASE_LABEL, livesLabel, nameOf } from '../ui/labels.ts';
import { ErrorText } from '../ui/ErrorText.tsx';
import { useReducedMotion } from '../ui/motion.ts';
import { FeedbackToggle, feedback } from './feedback.tsx';
import { Barcode, Stamp, TicketCard, type TicketMode } from './Ticket.tsx';

export type Send = (event: string, payload?: unknown) => Promise<Ack>;

export interface PlayScreenProps {
  view: PlayerView | null;
  offset: number;
  status: Status;
  kicked: boolean;
  send: Send;
  onRejoin: () => void;
}

function useAction(send: Send) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (event: string, payload?: unknown) => {
    setBusy(true);
    const ack = await send(event, payload);
    setBusy(false);
    setError(ack.ok ? null : ack.message);
    return ack.ok;
  };
  return { error, busy, run };
}

function Shell({
  strip,
  ticket,
  actions,
}: {
  strip: ReactNode;
  ticket: ReactNode;
  actions: ReactNode;
}) {
  return (
    <main className="grid min-h-[100dvh] grid-rows-[auto_1fr_auto] gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="min-h-12">{strip}</div>
      <div className="grid place-items-center">{ticket}</div>
      <div className="mx-auto grid w-full max-w-sm gap-3">{actions}</div>
    </main>
  );
}

function Strip({
  view,
  offset,
  children,
}: {
  view: PlayerView;
  offset: number;
  children?: ReactNode;
}) {
  // The vote reveal's timer is only a server fallback; players should not watch it.
  const timed = view.phase !== 'voteReveal';
  const seconds = useCountdown(timed ? view.deadline : null, view.pausedRemainingMs, offset);
  return (
    <div className="phone-strip flex min-h-12 items-center justify-between gap-3 rounded-lg bg-flap px-4 py-2">
      <p className="text-lg tracking-wide">{children ?? PHASE_LABEL[view.phase]}</p>
      <div className="flex items-center gap-2">
        {seconds !== null && (
          <p className={`text-2xl tabular-nums ${seconds <= 5 ? 'text-amber' : ''}`}>
            {formatClock(seconds)}
          </p>
        )}
        <FeedbackToggle />
      </div>
    </div>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <p className="text-center text-lg text-ink-dim">{children}</p>;
}

function Join({ send, inRound }: { send: Send; inRound: boolean }) {
  const [name, setName] = useState('');
  const { error, busy, run } = useAction(send);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run('player:join', { name })) feedback('join');
  };
  return (
    <Shell
      strip={
        <p className="phone-strip pt-2 text-center text-3xl tracking-[0.12em]">Imposter Who?</p>
      }
      ticket={
        <form onSubmit={submit} className="ticket ticket-print">
          <header className="ticket-head">
            <span className="font-bold">Check-in</span>
            <span>Boarding pass</span>
          </header>
          <div className="grid gap-4 px-5 py-6">
            <label className="grid gap-2">
              <span className="ticket-label">Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={12}
                autoComplete="nickname"
                enterKeyHint="go"
                className="min-h-12 rounded-md border-2 border-ticket-ink/40 bg-white/60 px-3 text-xl font-bold uppercase focus:border-ticket-ink focus:outline-none"
              />
              <span className="text-sm opacity-70">
                Up to 12 characters. Others will see it on the board.
              </span>
            </label>
            {error && <ErrorText>{error}</ErrorText>}
            {inRound && (
              <p className="text-sm">A round is running. You'll board on the next one.</p>
            )}
          </div>
          <div className="ticket-perf" aria-hidden />
          <div className="ticket-stub">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="min-h-14 rounded-md bg-ticket-ink font-[family-name:var(--font-flap)] text-2xl font-bold tracking-[0.1em] text-ticket uppercase active:scale-[0.97] disabled:opacity-40"
            >
              Check in
            </button>
          </div>
        </form>
      }
      actions={null}
    />
  );
}

function ClueInput({ send, spoken }: { send: Send; spoken: boolean }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState<{ text: string; n: number } | null>(null);
  const { error, busy, run } = useAction(send);
  if (spoken) {
    return (
      <>
        <p className="text-center text-xl font-bold uppercase">Your turn: say your clue out loud</p>
        <Button
          tone="primary"
          className="min-h-[72px] text-2xl"
          disabled={busy}
          onClick={() => void run('turn:done')}
        >
          Done
        </Button>
        {error && <ErrorText>{error}</ErrorText>}
      </>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clue = text;
    if (await run('clue:submit', { text: clue })) {
      setSent({ text: clue, n: (sent?.n ?? 0) + 1 });
      setText('');
    }
  };
  return (
    <form onSubmit={submit} className="relative grid gap-3">
      {sent && (
        <p key={sent.n} className="print-out" aria-hidden>
          {sent.text}
        </p>
      )}
      <label className="grid gap-2">
        <span className="text-center text-xl font-bold uppercase">Your turn: one word</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\s/g, ''))}
          maxLength={24}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          autoFocus
          className={`min-h-14 rounded-md border-2 bg-flap px-4 text-2xl font-bold uppercase focus:outline-none ${text ? 'border-amber' : 'border-ink/30'}`}
        />
      </label>
      {error && <ErrorText>{error}</ErrorText>}
      <Button type="submit" tone="primary" className="min-h-14 text-xl" disabled={busy || !text}>
        Send clue
      </Button>
    </form>
  );
}

function GuessForm({ send, onCancel }: { send: Send; onCancel?: () => void }) {
  const [text, setText] = useState('');
  const { error, run } = useAction(send);
  return (
    <div className="sheet grid gap-3 rounded-t-xl rounded-b-lg bg-flap p-4">
      <label className="grid gap-2">
        <span className="font-bold uppercase">Name the destination</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={40}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-12 rounded-md border-2 border-amber bg-board px-3 text-xl font-bold uppercase focus:outline-none"
        />
      </label>
      <p className="text-sm text-ink-dim">One guess. Right wins it for you, wrong loses it.</p>
      {error && <ErrorText>{error}</ErrorText>}
      <HoldButton disabled={!text.trim()} onConfirm={() => void run('guess:submit', { text })}>
        Hold to guess
      </HoldButton>
      {onCancel && (
        <Button tone="ghost" onClick={onCancel}>
          Never mind
        </Button>
      )}
    </div>
  );
}

/** The passenger list printed on the ticket for the vote (04 §5.6). */
function PunchList({ view, send }: { view: PlayerView; send: Send }) {
  const { error, run } = useAction(send);
  const round = view.round!;
  const you = view.you!;
  const candidates = (round.revoteCandidates ?? round.turnOrder).filter((id) => id !== you.id);
  return (
    <div className="grid gap-2">
      <p className="ticket-label">
        {round.revoteCandidates ? 'Revote: punch one' : 'Punch the imposter'}
      </p>
      <ul className="grid gap-2">
        {candidates.map((id) => {
          const chosen = you.myVote === id;
          const seat = view.players.find((p) => p.id === id)?.seat ?? 0;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={chosen}
                onClick={async () => {
                  if (chosen) return;
                  if (await run('vote:cast', { targetId: id })) feedback('vote');
                }}
                className="punch-row"
              >
                <span className="flex items-baseline gap-3">
                  <span className="text-sm tabular-nums opacity-70">
                    {String(seat + 1).padStart(2, '0')}
                  </span>
                  {nameOf(view, id)}
                </span>
                <span className="punch-hole" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function didWin(view: PlayerView): boolean | null {
  const outcome = view.round?.outcome;
  if (!outcome || outcome.winner === 'none' || !view.you) return null;
  const wasImposter = view.round!.imposterId === view.you.id;
  return (outcome.winner === 'imposter') === wasImposter;
}

function ResultActions({ view }: { view: PlayerView }) {
  const round = view.round!;
  const outcome = round.outcome!;
  const you = view.you!;
  const wasImposter = round.imposterId === you.id;
  const won = didWin(view);
  return (
    <div className="grid gap-2 text-center">
      <p className={`phone-strip text-5xl ${won === null ? '' : won ? 'text-amber' : 'text-red'}`}>
        {won === null ? 'No result' : won ? 'You won' : 'You lost'}
      </p>
      <p className="text-ink-dim">{OUTCOME_LABEL[outcome.reason]}</p>
      <p className="text-lg">
        The destination was <strong className="uppercase">{round.word?.word}</strong>.{' '}
        {wasImposter
          ? 'You were the imposter.'
          : `${nameOf(view, round.imposterId)} was the imposter.`}
      </p>
    </div>
  );
}

/** REQ-MODE-7: a voted-out player's ghost pass. The secrets sit behind a hold, like a ticket. */
function GhostPass({ view }: { view: PlayerView }) {
  const you = view.you!;
  const ghost = you.ghost!;
  const [holding, setHolding] = useState(false);
  return (
    <article className="ticket ticket-ghost">
      <header className="ticket-head">
        <span className="font-bold">Ghost pass</span>
        <span>Seat {String(you.seat + 1).padStart(2, '0')}</span>
      </header>
      <Stamp text="Cancelled" tone="red" />
      <div
        role="button"
        tabIndex={0}
        aria-label="Press and hold to see the imposter and the destination"
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
        onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), setHolding(true))}
        onKeyUp={() => setHolding(false)}
        onContextMenu={(e) => e.preventDefault()}
        className="grid min-h-56 cursor-pointer content-center gap-2 px-5 py-6 select-none touch-none"
      >
        <p className="ticket-label">Passenger</p>
        <p className="text-2xl font-bold uppercase">{you.name}</p>
        {holding ? (
          <div className="shutter-open mt-3 grid gap-1">
            <p className="ticket-label">The imposter is</p>
            <p className="text-4xl font-black text-red uppercase">
              {nameOf(view, ghost.imposterId)}
            </p>
            {ghost.word && (
              <>
                <p className="ticket-label mt-2">Destination</p>
                <p className="text-3xl font-black uppercase">{ghost.word}</p>
              </>
            )}
          </div>
        ) : (
          <p className="mt-3 text-lg font-bold uppercase opacity-80">Hold to see the imposter</p>
        )}
      </div>
    </article>
  );
}

/** Win: chads burst from the top of the ticket (04 §5.8). */
function useResultFeedback(view: PlayerView | null) {
  const reduced = useReducedMotion();
  const won = view?.phase === 'result' ? didWin(view) : null;
  const key =
    view?.phase === 'result' ? `${view.round?.number}:${view.round?.outcome?.reason}` : null;
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!key || last.current === key || won === null) return;
    last.current = key;
    feedback(won ? 'win' : 'loss');
    if (won && !reduced) {
      const ticket = document.querySelector('.ticket')?.getBoundingClientRect();
      burstConfetti({
        x: ticket ? ticket.left + ticket.width / 2 : innerWidth / 2,
        y: ticket ? ticket.top : 80,
        angle: -90,
        spread: 50,
        count: 60,
        speed: 700,
        size: 4,
      });
    }
  }, [key, won, reduced]);
}

/** The host's "Reduce motion" setting reaches every phone too (REQ-UX-2). */
export function PlayScreen(props: PlayScreenProps) {
  const reduced = props.view?.settings.reducedMotion ? true : undefined;
  return (
    <FlapMotion.Provider value={{ reduced }}>
      <div data-reduced={reduced}>
        <Controller {...props} />
      </div>
    </FlapMotion.Provider>
  );
}

function Controller({ view, offset, status, kicked, send, onRejoin }: PlayScreenProps) {
  const [guessing, setGuessing] = useState(false);
  // After tearing, the face stays up on this phone until hidden, even if the game moves on.
  // Otherwise the last player to tear would skip straight to clues without seeing it.
  const [shownRound, setShownRound] = useState<number | null>(null);
  const tear = useAction(send);
  useResultFeedback(view);

  const banner =
    status === 'offline' || status === 'connecting' ? (
      <p
        role="status"
        className="fixed inset-x-0 top-0 z-10 bg-red px-4 py-2 text-center text-xl font-bold"
      >
        {status === 'connecting' ? 'Finding the board…' : 'Reconnecting to the board…'}
      </p>
    ) : null;

  if (kicked) {
    return (
      <Shell
        strip={null}
        ticket={<Message>You were taken off the board by the host.</Message>}
        actions={
          <Button tone="primary" onClick={onRejoin}>
            Check in again
          </Button>
        }
      />
    );
  }

  if (!view) {
    // Reconnecting: a blank ticket in the ticket's exact shape, no spinner (04 §6).
    return (
      <>
        {banner}
        <Shell
          strip={null}
          ticket={
            <div className="ticket opacity-40" aria-hidden>
              <div className="ticket-head">&nbsp;</div>
              <div className="min-h-48" />
              <div className="ticket-perf" />
              <div className="ticket-stub">
                <Barcode seed={0} />
              </div>
            </div>
          }
          actions={null}
        />
      </>
    );
  }

  const you = view.you;
  if (!you) {
    return (
      <>
        {banner}
        <Join send={send} inRound={view.phase !== 'lobby' && view.phase !== 'result'} />
      </>
    );
  }

  const round = view.round;

  // REQ-MODE-7: voted out of a Manhunt match. Watch, knowing who the imposter is.
  if (you.ghost && view.phase !== 'result') {
    return (
      <>
        {banner}
        <Shell
          strip={
            <Strip view={view} offset={offset}>
              You're off the train
            </Strip>
          }
          ticket={<GhostPass view={view} />}
          actions={
            <Message>
              You're out, but keep watching. Keep a straight face and don't help anyone.
            </Message>
          }
        />
      </>
    );
  }

  const me = view.players.find((p) => p.id === you.id);
  const playing = !!you.ticket && view.phase !== 'lobby';
  const ready = me?.ready ?? false;

  // ── ticket mode ─────────────────────────────────────────────
  let mode: TicketMode = 'waiting';
  let caption: ReactNode = 'Waiting for departure';
  let stamp: { text: string; tone: 'amber' | 'red' | 'ink' } | null = null;
  const holdingFaceUp =
    playing &&
    shownRound === round?.number &&
    ['reveal', 'clues', 'discussion'].includes(view.phase);
  if (!playing) {
    const standby = you.standby || view.phase !== 'lobby';
    caption = standby ? 'Boarding after this service' : 'Waiting for departure';
    if (standby) stamp = { text: 'Standby', tone: 'ink' };
  } else if (holdingFaceUp) {
    mode = 'faceUp';
  } else if (view.phase === 'reveal') {
    mode = ready ? 'peek' : 'faceDown';
  } else if (view.phase === 'result') {
    mode = 'faceUp';
  } else {
    mode = 'peek';
  }
  if (playing && view.phase === 'clues' && you.isTurn)
    stamp = { text: 'Now boarding', tone: 'amber' };
  if (playing && view.phase === 'result') {
    const won = didWin(view);
    if (won !== null)
      stamp = won ? { text: 'Arrived', tone: 'amber' } : { text: 'Cancelled', tone: 'red' };
  }

  // REQ-GUESS-5: both roles get a footer of the same size in the same place.
  const peekFooter =
    you.canGuess && view.phase !== 'lastChance' ? (
      <button
        type="button"
        onClick={() => setGuessing(true)}
        className="min-h-10 text-left font-bold tracking-wide uppercase underline underline-offset-4"
      >
        Guess the destination
      </button>
    ) : (
      <p className="min-h-10 content-center font-bold tracking-wide uppercase opacity-70">
        One word clues only
      </p>
    );

  let body: ReactNode = null;
  if (playing && view.phase === 'voting' && !guessing) body = <PunchList view={view} send={send} />;
  if (playing && view.phase === 'intermission') {
    const ballot = round!.ballots.at(-1);
    const ejected = ballot?.result === 'eject' ? ballot.ejectedId : null;
    body = (
      <div className="grid gap-1">
        <p className="ticket-label">Intermission</p>
        <p className="text-2xl font-black uppercase">
          {ejected ? `${nameOf(view, ejected)} was not the imposter` : 'Nobody left the train'}
        </p>
        <p className="text-sm tracking-widest uppercase">
          Lives left: {view.match ? livesLabel(view.match) : '-'}. A new word is coming.
        </p>
      </div>
    );
  }

  const ticket = (
    <TicketCard
      name={you.name}
      seat={you.seat}
      ticket={you.ticket}
      mode={mode}
      caption={caption}
      peekFooter={peekFooter}
      stamp={stamp}
      body={body}
      tearDisabled={tear.busy}
      onTear={async () => {
        feedback('torn');
        if (await tear.run('ticket:torn')) setShownRound(round!.number);
      }}
    />
  );

  // ── strip and actions per phase ────────────────────────────
  let strip: ReactNode = <Strip view={view} offset={offset} />;
  let actions: ReactNode = null;

  if (!playing) {
    actions = (
      <Message>
        {view.players.length} passenger{view.players.length === 1 ? '' : 's'} checked in.
      </Message>
    );
  } else if (guessing && you.canGuess && view.phase !== 'lastChance') {
    actions = <GuessForm send={send} onCancel={() => setGuessing(false)} />;
  } else {
    switch (view.phase) {
      case 'reveal':
        actions = ready ? (
          <Message>Remember it. Keep it to yourself.</Message>
        ) : (
          <Message>Make sure nobody can see your screen, then tear the stub.</Message>
        );
        break;
      case 'clues':
        strip = (
          <Strip view={view} offset={offset}>
            {you.isTurn
              ? 'Now boarding: you'
              : `Now boarding: ${nameOf(view, round!.currentPlayerId)}`}
          </Strip>
        );
        actions = you.isTurn ? (
          <ClueInput send={send} spoken={view.settings.clueMode === 'spoken'} />
        ) : (
          <Message>Listen to the clues. Hold your ticket to check your destination.</Message>
        );
        break;
      case 'discussion':
        actions = <Message>Discuss. Who doesn't know the destination?</Message>;
        break;
      case 'voting':
        actions = <Message>You can change your vote until voting closes.</Message>;
        break;
      case 'voteReveal':
        actions = <Message>Look at the board.</Message>;
        break;
      case 'intermission':
        actions = <Message>Look at the board. The next departure is coming.</Message>;
        break;
      case 'lastChance':
        actions = you.canGuess ? (
          <GuessForm send={send} />
        ) : (
          <Message>Last call: the imposter is guessing the destination.</Message>
        );
        break;
      case 'result':
        actions = <ResultActions view={view} />;
        break;
    }
  }

  if (holdingFaceUp && !guessing) {
    actions = (
      <>
        <Button onClick={() => setShownRound(null)}>Hide my ticket</Button>
        {actions}
      </>
    );
  }

  return (
    <>
      {banner}
      <Shell strip={strip} ticket={ticket} actions={actions} />
      {view.paused && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-board/90">
          <p className="phone-strip text-4xl">Paused</p>
        </div>
      )}
    </>
  );
}
