import { describe, expect, it } from 'vitest';
import { hostView } from '@imposter-who/core';
import { boardRows, fitWords, headline, infoLine, livesText } from '../src/host/model.ts';
import { beatAt, revealHeadline, revealPlan } from '../src/host/revealTimeline.ts';
import { Script } from './fixtures.ts';

const view = (s: Script) => hostView(s.state);

describe('UX-1 board rows (04 §4)', () => {
  it('check-in rows show seat, name and CHECKED IN', () => {
    const rows = boardRows(view(new Script().join(3)));
    expect(rows.map((r) => [r.seat, r.name, r.status])).toEqual([
      ['01', 'PAX0', 'CHECKED IN'],
      ['02', 'PAX1', 'CHECKED IN'],
      ['03', 'PAX2', 'CHECKED IN'],
    ]);
  });

  it('ticket check shows ISSUED, then READY once torn, with no hint of content', () => {
    const s = new Script().join(3).start();
    s.act({ type: 'ticket:torn', playerId: s.imposter });
    const rows = boardRows(view(s));
    expect(rows.find((r) => r.id === s.imposter)!.status).toBe('READY');
    expect(rows.filter((r) => r.status === 'ISSUED')).toHaveLength(2);
  });

  it('marks the clue giver NOW BOARDING in amber with the live bar, and lands clues', () => {
    const s = new Script().join(3).start().toClues();
    const first = s.round.turnOrder[0]!;
    let rows = boardRows(view(s));
    expect(rows[0]).toMatchObject({ id: first, status: 'NOW BOARDING', tone: 'amber', live: true });
    s.act({ type: 'clue:submit', playerId: first, text: 'courgette' });
    rows = boardRows(view(s));
    expect(rows[0]).toMatchObject({ clue: 'courgette', status: 'CLUE GIVEN', live: false });
  });

  it('final call: VOTED without the target, FINAL CALL for the rest', () => {
    const s = new Script().join(3).start().toVoting();
    const [a, b] = s.round.turnOrder;
    s.act({ type: 'vote:cast', playerId: a!, targetId: b! });
    const rows = boardRows(view(s));
    expect(rows.find((r) => r.id === a)!.status).toBe('VOTED');
    expect(rows.filter((r) => r.status === 'FINAL CALL')).toHaveLength(2);
  });

  it('REQ-SEC-3: never names the imposter before the last call or result', () => {
    const s = new Script().join(4).start().toVoting();
    for (const row of boardRows(view(s))) expect(row.status).not.toBe('IMPOSTER');
    s.voteOut(s.civilian);
    for (const row of boardRows(view(s))) expect(row.status).not.toBe('IMPOSTER');
  });

  it('REQ-MODE: out passengers sink below the live ones, CANCELLED in red and dimmed', () => {
    const s = new Script({ mode: 'manhunt', lives: 2 }).join(5).start();
    const victim = s.civilian;
    s.toVoting().voteOut(victim).act({ type: 'reveal:done' }).act({ type: 'round:next' });
    const rows = boardRows(view(s));
    expect(rows.at(-1)).toMatchObject({ id: victim, status: 'CANCELLED', tone: 'red', dim: true });
  });
});

describe('UX-1 board header (04 §4.4, §4.12)', () => {
  it('reads ROUND n  LINE: X, or CLASSIFIED when the category is hidden', () => {
    expect(infoLine(view(new Script().join(3).start()), 40)).toBe('ROUND 1  LINE: FOOD');
    const hidden = new Script({ showCategoryToImposter: false }).join(3).start();
    expect(infoLine(view(hidden), 40)).toBe('ROUND 1  LINE: CLASSIFIED');
  });

  it('puts lives right after the round in Manhunt, and drops what does not fit', () => {
    const s = new Script({ mode: 'manhunt', lives: 2 }).join(4).start();
    expect(infoLine(view(s), 40)).toBe('ROUND 1  LIVES 2  LINE: FOOD');
    expect(infoLine(view(s), 18)).toBe('ROUND 1  LIVES 2');
    const endless = new Script({ mode: 'manhunt', lives: 0 }).join(4).start();
    expect(livesText(view(endless))).toBe('LIVES: NO LIMIT');
  });

  it('announces each phase in the station voice', () => {
    expect(headline(view(new Script().join(1)))).toBe('CHECKING IN. 2 MORE TO DEPART');
    expect(headline(view(new Script().join(3)))).toBe('ALL PASSENGERS CHECKED IN');
    const s = new Script().join(3).start().toClues();
    expect(headline(view(s))).toMatch(/^NOW BOARDING: PAX\d$/);
    expect(headline(view(s.clueAll()))).toBe('DELAYED: DISCUSS');
  });

  it('fits text to a column at a word boundary when it can', () => {
    expect(fitWords('PLEASE KEEP YOUR SUSPICIONS', 16)).toBe('PLEASE KEEP YOUR');
    expect(fitWords('SUPERCALIFRAGILISTIC', 8)).toBe('SUPERCAL');
  });
});

describe('UX vote reveal timeline (04 §4.9)', () => {
  it('lands votes one row at a time, then the tally, then lifts the accused', () => {
    const plan = revealPlan(4, 'eject', false);
    expect(beatAt(plan, 4, 0).votesShown).toBe(0);
    expect(beatAt(plan, 4, 300).votesShown).toBe(1);
    expect(beatAt(plan, 4, 300 + 450).votesShown).toBe(2);
    expect(beatAt(plan, 4, plan.tallyAt)).toMatchObject({
      votesShown: 4,
      tally: true,
      collapsed: false,
    });
    expect(beatAt(plan, 4, plan.liftAt)).toMatchObject({ collapsed: true, lifted: true });
    expect(beatAt(plan, 4, plan.doneAt).done).toBe(true);
  });

  it('finishes before the server fallback of 12 s, even with 15 passengers', () => {
    expect(revealPlan(15, 'eject', false).doneAt).toBeLessThan(12_000);
  });

  it('keeps every beat under reduced motion, in about 4 s', () => {
    const plan = revealPlan(8, 'eject', true);
    expect(plan.doneAt).toBeLessThanOrEqual(4500);
    expect(plan.liftAt).toBeLessThan(plan.doneAt);
  });

  it('ties never collapse or lift a row', () => {
    const plan = revealPlan(4, 'revote', false);
    expect(beatAt(plan, 4, plan.doneAt)).toMatchObject({
      collapsed: false,
      lifted: false,
      done: true,
    });
  });

  it('skipping (time = Infinity) jumps straight to the end', () => {
    expect(beatAt(revealPlan(6, 'eject', false), 6, Infinity)).toMatchObject({
      votesShown: 6,
      done: true,
    });
  });

  it('headlines the count without naming a role', () => {
    expect(revealHeadline('eject', { ejected: 'MARCO', tied: [] })).toBe('MOST VOTES: MARCO');
    expect(revealHeadline('revote', { ejected: null, tied: ['A', 'B'] })).toBe(
      'TIE. REVOTE: A OR B',
    );
    expect(revealHeadline('noEject', { ejected: null, tied: [] })).toBe(
      'TIE. NOBODY LEAVES THE TRAIN',
    );
  });
});
