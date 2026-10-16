/** The whole host display as a pure function of the view (one screen per phase). */
import { useEffect, useState } from 'react';
import type { HostView } from '@imposter-who/core';
import { formatClock } from '../net/clock.ts';
import { useCountdown } from '../net/useCountdown.ts';
import { Button } from '../ui/Button.tsx';
import { OUTCOME_LABEL, PHASE_LABEL, nameOf } from '../ui/labels.ts';
import { Board } from './Board.tsx';
import { Lobby } from './Lobby.tsx';
import type { HostScreenProps, Send } from './types.ts';

/** Fallback pacing for the vote reveal until the M5 animation reports when it is done. */
export const PLAIN_REVEAL_MS = 6000;

function Header({ view, offset }: { view: HostView; offset: number }) {
  const timed = view.phase !== 'voteReveal';
  const seconds = useCountdown(timed ? view.deadline : null, view.pausedRemainingMs, offset);
  const round = view.round;
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 px-6 py-4">
      <div className="flex items-baseline gap-4">
        <h1 className="text-3xl font-black tracking-tight uppercase">Imposter Who?</h1>
        <p className="text-xl tracking-widest text-amber uppercase">{PHASE_LABEL[view.phase]}</p>
      </div>
      {round && (
        <p className="text-lg tracking-wide uppercase">
          Round {round.number}
          <span className="text-ink-dim"> · Line: </span>
          {round.categoryName ?? 'Classified'}
          {view.phase === 'clues' && round.laps > 1 && (
            <span className="text-ink-dim">
              {' '}
              · Lap {round.lap} of {round.laps}
            </span>
          )}
        </p>
      )}
      {seconds !== null && (
        <p
          aria-label="Time left"
          className={`font-mono text-4xl tabular-nums ${seconds <= 5 ? 'text-amber' : ''}`}
        >
          {formatClock(seconds)}
        </p>
      )}
    </header>
  );
}

function useAck(send: Send) {
  const [error, setError] = useState<string | null>(null);
  const act = async (event: string, payload?: unknown) => {
    const ack = await send(event, payload);
    setError(ack.ok ? null : ack.message);
  };
  return { error, act };
}

function Controls({ view, send }: { view: HostView; send: Send }) {
  const { error, act } = useAck(send);
  const active = view.phase !== 'lobby' && view.phase !== 'result';
  const timed = view.deadline !== null || view.pausedRemainingMs !== null;
  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-ink/10 px-6 py-4">
      {view.phase === 'reveal' && (
        <Button tone="primary" onClick={() => act('phase:continue')}>
          Start clues now
        </Button>
      )}
      {view.phase === 'clues' && (
        <Button onClick={() => act('phase:skip')}>
          {view.settings.clueMode === 'spoken' ? 'Next passenger' : 'Skip turn'}
        </Button>
      )}
      {view.phase === 'discussion' && (
        <Button tone="primary" onClick={() => act('phase:skip')}>
          Go to vote
        </Button>
      )}
      {(view.phase === 'discussion' || view.phase === 'voting') && timed && (
        <Button onClick={() => act('timer:add', { seconds: 30 })}>+30 s</Button>
      )}
      {view.phase === 'voting' && <Button onClick={() => act('phase:skip')}>Close voting</Button>}
      {active && (
        <Button onClick={() => act(view.paused ? 'game:resume' : 'game:pause')}>
          {view.paused ? 'Resume' : 'Pause'}
        </Button>
      )}
      {active && (
        <Button
          tone="danger"
          className="ml-auto"
          onClick={() => {
            if (confirm('End this round with no result and go back to check-in?')) {
              void act('lobby:return');
            }
          }}
        >
          End round
        </Button>
      )}
      {error && <p className="text-red">{error}</p>}
    </footer>
  );
}

function VoteReveal({ view, send }: { view: HostView; send: Send }) {
  const ballot = view.round!.ballots.at(-1)!;
  const version = view.round!.ballots.length;
  useEffect(() => {
    const id = setTimeout(() => void send('reveal:done'), PLAIN_REVEAL_MS);
    return () => clearTimeout(id);
  }, [send, version]);

  let headline: string;
  if (ballot.result === 'eject') headline = `${nameOf(view, ballot.ejectedId)} is off the train`;
  else if (ballot.result === 'revote')
    headline = `Tie. Revote between ${ballot.tied.map((id) => nameOf(view, id)).join(' and ')}`;
  else if (ballot.result === 'doubleTie') headline = 'Tied again. Nobody leaves';
  else headline = 'Nobody voted';

  return (
    <div className="grid gap-6">
      <h2 className="text-4xl font-black uppercase">{headline}</h2>
      <Board view={view} showVotes />
      <Button
        tone="primary"
        className="justify-self-start"
        onClick={() => void send('reveal:done')}
      >
        Continue
      </Button>
    </div>
  );
}

function Result({ view, send }: { view: HostView; send: Send }) {
  const { error, act } = useAck(send);
  const round = view.round!;
  const outcome = round.outcome!;
  const winner =
    outcome.winner === 'civilians'
      ? 'Civilians win'
      : outcome.winner === 'imposter'
        ? 'Imposter wins'
        : 'No result';
  const ranked = [...view.players].sort((a, b) => b.score - a.score);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section className="grid content-start gap-6">
        <div>
          <p className="text-xl tracking-widest text-ink-dim uppercase">
            {OUTCOME_LABEL[outcome.reason]}
          </p>
          <h2 className="text-6xl font-black uppercase">{winner}</h2>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-flap p-4">
            <dt className="text-sm tracking-widest text-ink-dim uppercase">Destination</dt>
            <dd className="text-3xl font-bold uppercase">{round.word?.word}</dd>
          </div>
          <div className="rounded-lg bg-flap p-4">
            <dt className="text-sm tracking-widest text-ink-dim uppercase">Imposter</dt>
            <dd className="text-3xl font-bold uppercase">{nameOf(view, round.imposterId)}</dd>
          </div>
          {round.guess && (
            <div className="rounded-lg bg-flap p-4">
              <dt className="text-sm tracking-widest text-ink-dim uppercase">Imposter guessed</dt>
              <dd
                className={`text-3xl font-bold uppercase ${round.guess.correct ? 'text-amber' : 'text-red'}`}
              >
                {round.guess.text}
              </dd>
            </div>
          )}
        </dl>
        {view.round!.overrideOpen && (
          <Button
            tone="primary"
            className="justify-self-start"
            onClick={() => act('guess:override')}
          >
            Table says it counts
          </Button>
        )}
        {round.turnOrder.length > 0 && round.ballots.length > 0 && <Board view={view} showVotes />}
      </section>
      <aside className="grid content-start gap-4">
        <h3 className="text-xl font-bold uppercase">Scores</h3>
        <ol className="grid gap-1">
          {ranked.map((p) => (
            <li key={p.id} className="flex justify-between rounded-md bg-flap px-3 py-2">
              <span className="font-bold uppercase">{p.name}</span>
              <span className="font-mono tabular-nums">{p.score}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-2">
          <Button tone="primary" className="min-h-14 text-xl" onClick={() => act('round:next')}>
            Next round
          </Button>
          <Button onClick={() => act('lobby:return')}>Back to check-in</Button>
          <Button tone="ghost" onClick={() => act('scores:reset')}>
            Reset scores
          </Button>
        </div>
        {error && <p className="text-red">{error}</p>}
      </aside>
    </div>
  );
}

function Body({ view, send }: { view: HostView; send: Send }) {
  const round = view.round;
  switch (view.phase) {
    case 'lobby':
      return <Lobby view={view} send={send} />;
    case 'reveal':
      return (
        <div className="grid gap-6">
          <h2 className="text-4xl font-black uppercase">Check your ticket. Keep it secret.</h2>
          <Board view={view} />
        </div>
      );
    case 'clues': {
      const name = nameOf(view, round!.currentPlayerId);
      return (
        <div className="grid gap-6">
          <h2 className="text-4xl font-black uppercase">
            Now boarding: <span className="text-amber">{name}</span>
          </h2>
          <p className="text-xl text-ink-dim">
            {view.settings.clueMode === 'spoken'
              ? `${name}, say one word out loud, then tap Done.`
              : `${name}, type one word on your phone.`}
          </p>
          <Board view={view} />
        </div>
      );
    }
    case 'discussion':
      return (
        <div className="grid gap-6">
          <h2 className="text-4xl font-black uppercase">Who is the imposter? Discuss.</h2>
          <Board view={view} />
        </div>
      );
    case 'voting':
      return (
        <div className="grid gap-6">
          <h2 className="text-4xl font-black uppercase">
            Final call. Vote on your phone.{' '}
            <span className="text-ink-dim">
              {round!.votedIds.length}/
              {
                round!.turnOrder.filter((id) => view.players.find((p) => p.id === id)?.connected)
                  .length
              }{' '}
              voted
            </span>
          </h2>
          {round!.revoteCandidates && (
            <p className="text-xl text-amber">
              Revote between {round!.revoteCandidates.map((id) => nameOf(view, id)).join(' and ')}
            </p>
          )}
          <Board view={view} />
        </div>
      );
    case 'voteReveal':
      return <VoteReveal view={view} send={send} />;
    case 'lastChance':
      return (
        <div className="grid gap-6">
          <h2 className="text-5xl font-black uppercase">
            {nameOf(view, round!.imposterId)} was the imposter.
          </h2>
          <p className="text-3xl text-amber uppercase">Last call: can they name the destination?</p>
        </div>
      );
    case 'result':
      return <Result view={view} send={send} />;
  }
}

export function HostScreen({ view, offset, send }: HostScreenProps) {
  return (
    <div className="grid min-h-[100dvh] grid-rows-[auto_1fr_auto]">
      <Header view={view} offset={offset} />
      <main className="relative mx-auto w-full max-w-[1400px] px-6 py-8">
        <Body view={view} send={send} />
        {view.paused && (
          <div className="absolute inset-0 grid place-items-center bg-board/85">
            <div className="text-center">
              <p className="text-6xl font-black uppercase">Paused</p>
              {view.pausedReason === 'lowPlayers' && (
                <p className="mt-2 text-xl text-ink-dim">
                  Fewer than 3 passengers are connected. Wait for them, or end the round.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
      {view.phase !== 'lobby' && <Controls view={view} send={send} />}
    </div>
  );
}
