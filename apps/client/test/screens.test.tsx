import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hostView, playerView } from '@imposter-who/core';
import { HostScreen } from '../src/host/HostScreen.tsx';
import { PlayScreen } from '../src/play/PlayScreen.tsx';
import { Script, noSend } from './fixtures.ts';

const host = (s: Script) =>
  renderToString(<HostScreen view={hostView(s.state)} offset={0} send={noSend} />);

const phone = (s: Script, id: string) =>
  renderToString(
    <PlayScreen
      view={playerView(s.state, id)}
      offset={0}
      status="online"
      kicked={false}
      send={noSend}
      onRejoin={() => {}}
    />,
  );

/**
 * Markup with text removed: tags, classes and attributes only. Inline widths are dropped
 * because the barcode is drawn from the seat number, which differs per player, not per role.
 */
const skeleton = (html: string) =>
  html
    .replace(/>[^<]*</g, '><')
    .replace(/<!-- -->/g, '')
    .replace(/ style="width:\d+px"/g, '');

describe('host display renders every phase', () => {
  const phases: [string, (s: Script) => Script][] = [
    ['lobby', (s) => s],
    ['reveal', (s) => s.start()],
    ['clues', (s) => s.start().toClues()],
    ['discussion', (s) => s.start().toClues().clueAll()],
    ['voting', (s) => s.start().toVoting()],
    ['voteReveal', (s) => s.start().toVoting().voteOut(s.civilian)],
    ['lastChance', (s) => s.start().toVoting().voteOut(s.imposter).act({ type: 'reveal:done' })],
  ];

  it.each(phases)('%s, without the secret word (REQ-SEC-3)', (phase, to) => {
    const s = to(new Script().join(4));
    expect(s.state.phase).toBe(phase);
    const html = host(s);
    expect(html).toContain('Imposter Who?');
    expect(html.toLowerCase()).not.toContain('zucchini');
  });

  it('result after a wrong last-chance guess', () => {
    const s = new Script().join(4).start();
    s.toVoting().voteOut(s.imposter).act({ type: 'reveal:done' });
    s.act({ type: 'guess:submit', playerId: s.imposter, text: 'cucumber' });
    const html = host(s);
    expect(html).toContain('Civilians win');
    expect(html).toContain('zucchini');
    expect(html).toContain('Table says it counts');
  });

  it('shows the category as Classified when hidden from the imposter', () => {
    const s = new Script({ showCategoryToImposter: false }).join(4).start();
    expect(host(s)).toContain('Classified');
  });
});

describe('controller', () => {
  it('shows the join form before checking in', () => {
    const s = new Script().join(3);
    expect(phone(s, 'stranger')).toContain('Check in');
  });

  it('keeps the destination off screen until the player tears or holds the ticket', () => {
    const s = new Script().join(4).start();
    expect(phone(s, s.civilian).toLowerCase()).not.toContain('zucchini');
    expect(phone(s, s.civilian)).toContain('Tear to reveal');
    // Torn (e.g. on another load of the page): hidden behind hold-to-peek, for both roles.
    s.act({ type: 'ticket:torn', playerId: s.civilian });
    s.act({ type: 'ticket:torn', playerId: s.imposter });
    expect(phone(s, s.civilian).toLowerCase()).not.toContain('zucchini');
    expect(phone(s, s.civilian)).toContain('Hold to see your destination');
    expect(phone(s, s.imposter)).toContain('Hold to see your destination');
    expect(phone(s, s.imposter).toLowerCase()).not.toContain('zucchini');
  });

  describe('REQ-GUESS-5 / REQ-SEC-2 identical layout for both roles', () => {
    const cases: [string, (s: Script) => Script][] = [
      ['face-down ticket', (s) => s.start()],
      [
        'clues, not your turn',
        (s) => {
          s.start().toClues();
          // Move the turn off the imposter so both compared players are waiting.
          while (s.round.turnOrder[s.round.turnIndex] === s.imposter) {
            s.act({ type: 'clue:submit', playerId: s.imposter, text: 'hintz' });
          }
          return s;
        },
      ],
      ['discussion', (s) => s.start().toClues().clueAll()],
      ['voting', (s) => s.start().toVoting()],
      ['vote reveal', (s) => s.start().toVoting().voteOut(s.round.turnOrder[3]!)],
    ];

    it.each(cases)('%s', (_, to) => {
      const s = to(new Script().join(4));
      // Compare a civilian and the imposter who are both not the current clue giver.
      const current = s.state.phase === 'clues' ? s.round.turnOrder[s.round.turnIndex] : null;
      const civilian = s.round.turnOrder.find((id) => id !== s.imposter && id !== current)!;
      expect(current).not.toBe(s.imposter);
      expect(skeleton(phone(s, s.imposter))).toBe(skeleton(phone(s, civilian)));
    });
  });

  it('gives the clue giver the input, typed or spoken', () => {
    const typed = new Script().join(3).start().toClues();
    const current = typed.round.turnOrder[0]!;
    expect(phone(typed, current)).toContain('Send clue');

    const spoken = new Script({ clueMode: 'spoken' }).join(3).start().toClues();
    expect(phone(spoken, spoken.round.turnOrder[0]!)).toContain('Done');
  });

  it('offers the imposter a last-chance guess', () => {
    const s = new Script().join(4).start();
    s.toVoting().voteOut(s.imposter).act({ type: 'reveal:done' });
    expect(phone(s, s.imposter)).toContain('Hold to guess');
    expect(phone(s, s.civilian)).toContain('imposter is guessing');
  });

  it('tells each player whether they won', () => {
    const s = new Script().join(4).start();
    s.toVoting().voteOut(s.imposter).act({ type: 'reveal:done' });
    s.act({ type: 'guess:submit', playerId: s.imposter, text: 'cucumber' });
    expect(phone(s, s.civilian)).toContain('You won');
    expect(phone(s, s.imposter)).toContain('You lost');
  });

  it('shows the offline banner while reconnecting', () => {
    const s = new Script().join(3);
    const html = renderToString(
      <PlayScreen
        view={playerView(s.state, 'p0')}
        offset={0}
        status="offline"
        kicked={false}
        send={noSend}
        onRejoin={() => {}}
      />,
    );
    expect(html).toContain('Reconnecting');
  });
});
