/** Station-voice labels shared by both screens (04 §1.6). */
import type { Outcome, Phase, PublicView } from '@imposter-who/core';

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'Check-in',
  reveal: 'Ticket check',
  clues: 'Now boarding',
  discussion: 'Delayed: discuss',
  voting: 'Final call',
  voteReveal: 'Counting votes',
  lastChance: 'Last call',
  result: 'Arrivals',
};

export const OUTCOME_LABEL: Record<Outcome['reason'], string> = {
  civilianVotedOut: 'A civilian was voted out',
  doubleTie: 'Two ties in a row. Nobody was voted out',
  noVotes: 'Nobody voted',
  earlyGuessRight: 'The imposter named the destination',
  earlyGuessWrong: 'The imposter guessed wrong',
  lastChanceRight: 'Caught, but the imposter named the destination',
  lastChanceWrong: 'The imposter was caught',
  imposterLeft: 'The imposter left the station',
  aborted: 'Service cancelled: not enough passengers',
};

export function nameOf(view: PublicView, id: string | null | undefined): string {
  return view.players.find((p) => p.id === id)?.name ?? 'Someone';
}
