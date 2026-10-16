/**
 * The whole controller as a pure function of the view. Primary actions sit in the bottom
 * third (REQ-UX-5). Layout is identical for every role (REQ-GUESS-5).
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import type { Ack, PlayerView } from '@imposter-who/core';
import { formatClock } from '../net/clock.ts';
import type { Status } from '../net/connection.ts';
import { useCountdown } from '../net/useCountdown.ts';
import { Button } from '../ui/Button.tsx';
import { HoldButton } from '../ui/HoldButton.tsx';
import { OUTCOME_LABEL, PHASE_LABEL, nameOf } from '../ui/labels.ts';
import { TicketCard, type TicketMode } from './Ticket.tsx';

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
    <div className="flex items-center justify-between gap-3 rounded-lg bg-flap px-4 py-3">
      <p className="font-bold tracking-wide uppercase">{children ?? PHASE_LABEL[view.phase]}</p>
      {seconds !== null && (
        <p className={`font-mono text-xl tabular-nums ${seconds <= 5 ? 'text-amber' : ''}`}>
          {formatClock(seconds)}
        </p>
      )}
    </div>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <p className="text-center text-lg text-ink-dim">{children}</p>;
}

function Join({ send, inRound }: { send: Send; inRound: boolean }) {
  const [name, setName] = useState('');
  const { error, busy, run } = useAction(send);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run('player:join', { name });
  };
  return (
    <Shell
      strip={<p className="pt-2 text-center text-2xl font-black uppercase">Imposter Who?</p>}
      ticket={
        <form
          onSubmit={submit}
          className="grid w-full max-w-sm gap-4 rounded-xl bg-ticket p-6 text-ticket-ink"
        >
          <label className="grid gap-2">
            <span className="text-sm font-bold tracking-widest uppercase">Your name</span>
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
          {error && (
            <p role="alert" className="font-bold text-red">
              {error}
            </p>
          )}
          {inRound && <p className="text-sm">A round is running. You'll board on the next one.</p>}
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="min-h-14 rounded-md bg-ticket-ink text-xl font-bold tracking-wide text-ticket uppercase active:scale-[0.97] disabled:opacity-40"
          >
            Check in
          </button>
        </form>
      }
      actions={null}
    />
  );
}

function ClueInput({ send, spoken }: { send: Send; spoken: boolean }) {
  const [text, setText] = useState('');
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
        {error && (
          <p role="alert" className="text-center text-red">
            {error}
          </p>
        )}
      </>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run('clue:submit', { text })) setText('');
  };
  return (
    <form onSubmit={submit} className="grid gap-3">
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
          className="min-h-14 rounded-md border-2 border-amber bg-flap px-4 text-2xl font-bold uppercase focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="text-center font-bold text-red">
          {error}
        </p>
      )}
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
    <div className="grid gap-3 rounded-xl bg-flap p-4">
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
      {error && (
        <p role="alert" className="font-bold text-red">
          {error}
        </p>
      )}
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

function Voting({ view, send }: { view: PlayerView; send: Send }) {
  const { error, run } = useAction(send);
  const round = view.round!;
  const you = view.you!;
  const candidates = (round.revoteCandidates ?? round.turnOrder).filter((id) => id !== you.id);
  return (
    <>
      <p className="text-center text-lg font-bold uppercase">
        {round.revoteCandidates ? 'Revote: pick one' : 'Who is the imposter?'}
      </p>
      <ul className="grid gap-2">
        {candidates.map((id) => {
          const chosen = you.myVote === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={chosen}
                onClick={() => void run('vote:cast', { targetId: id })}
                className={`flex min-h-14 w-full items-center justify-between rounded-md px-4 text-xl font-bold uppercase active:scale-[0.98] ${
                  chosen ? 'bg-amber text-ticket-ink' : 'bg-flap text-ink'
                }`}
              >
                {nameOf(view, id)}
                {chosen && <span className="text-sm tracking-widest">Your vote</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-sm text-ink-dim">
        You can change your vote until voting closes.
      </p>
      {error && (
        <p role="alert" className="text-center text-red">
          {error}
        </p>
      )}
    </>
  );
}

function ResultActions({ view }: { view: PlayerView }) {
  const round = view.round!;
  const outcome = round.outcome!;
  const you = view.you!;
  const wasImposter = round.imposterId === you.id;
  const won = outcome.winner !== 'none' && (outcome.winner === 'imposter') === wasImposter;
  return (
    <div className="grid gap-2 text-center">
      <p
        className={`text-5xl font-black uppercase ${outcome.winner === 'none' ? '' : won ? 'text-amber' : 'text-red'}`}
      >
        {outcome.winner === 'none' ? 'No result' : won ? 'You won' : 'You lost'}
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

export function PlayScreen({ view, offset, status, kicked, send, onRejoin }: PlayScreenProps) {
  const [guessing, setGuessing] = useState(false);
  // After tearing, the face stays up on this phone until hidden, even if the game moves on.
  // Otherwise the last player to tear would skip straight to clues without seeing it.
  const [shownRound, setShownRound] = useState<number | null>(null);
  const tear = useAction(send);

  const banner =
    status === 'offline' || status === 'connecting' ? (
      <p
        role="status"
        className="fixed inset-x-0 top-0 z-10 bg-red px-4 py-2 text-center font-bold"
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
    return (
      <>
        {banner}
        <Shell
          strip={null}
          ticket={<div className="h-80 w-full max-w-sm animate-pulse rounded-xl bg-flap" />}
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
  const me = view.players.find((p) => p.id === you.id);
  const playing = !!you.ticket && view.phase !== 'lobby';
  const ready = me?.ready ?? false;

  // ── ticket mode ─────────────────────────────────────────────
  let mode: TicketMode = 'waiting';
  let caption: ReactNode = 'Waiting for departure';
  const holdingFaceUp =
    playing &&
    shownRound === round?.number &&
    ['reveal', 'clues', 'discussion'].includes(view.phase);
  if (!playing) {
    caption =
      you.standby || view.phase !== 'lobby'
        ? "You're on the next departure"
        : 'Waiting for departure';
  } else if (holdingFaceUp) {
    mode = 'faceUp';
  } else if (view.phase === 'reveal') {
    mode = ready ? 'peek' : 'faceDown';
  } else if (view.phase === 'result') {
    mode = 'faceUp';
  } else {
    mode = 'peek';
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

  const ticket = (
    <TicketCard
      name={you.name}
      seat={you.seat}
      ticket={you.ticket}
      mode={mode}
      caption={caption}
      peekFooter={peekFooter}
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
          <>
            <Button
              tone="primary"
              className="min-h-16 text-xl"
              disabled={tear.busy}
              onClick={async () => {
                if (await tear.run('ticket:torn')) setShownRound(round!.number);
              }}
            >
              Tear to reveal
            </Button>
            <Message>Make sure nobody can see your screen.</Message>
          </>
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
        actions = <Voting view={view} send={send} />;
        break;
      case 'voteReveal':
        actions = <Message>Look at the board.</Message>;
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
          <p className="text-4xl font-black uppercase">Paused</p>
        </div>
      )}
    </>
  );
}
