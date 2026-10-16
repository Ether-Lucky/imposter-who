import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hostView } from '@imposter-who/core';
import { HostScreen } from '../src/host/HostScreen.tsx';
import { boardRows } from '../src/host/model.ts';
import { RUBBER_FROM, releaseTears, rubberBand } from '../src/play/Ticket.tsx';
import { Script, noSend } from './fixtures.ts';

/** 15 passengers with 12-character names: the most the board ever holds. */
function fullTable() {
  const s = new Script();
  for (let i = 0; i < 15; i++) {
    const name = `Passenger${String(i).padStart(3, '0')}`;
    s.act({ type: 'player:join', playerId: `p${i}`, tokenHash: `t${i}`, name });
  }
  return s;
}

const host = (s: Script) =>
  renderToString(<HostScreen view={hostView(s.state)} offset={0} send={noSend} />);

describe('T7.2 edge cases on the board', () => {
  it('fits 15 passengers with 12-character names, uncut, in check-in and in a round', () => {
    const s = fullTable();
    for (const html of [host(s), host(s.start().toClues())]) {
      for (let i = 0; i < 15; i++) {
        expect(html).toContain(`sr-only">PASSENGER${String(i).padStart(3, '0')}<`);
      }
    }
  });

  it('keeps every row of a full table on the 15 passenger rows', () => {
    expect(boardRows(hostView(fullTable().start().state))).toHaveLength(15);
  });

  it('a removed passenger leaves the board straight away', () => {
    const s = fullTable();
    s.act({ type: 'player:remove', id: 'p3' });
    expect(host(s)).not.toContain('PASSENGER003');
  });
});

describe('T7.2 tear strip gesture (04 §5.3)', () => {
  it('follows the finger up to 30%, then resists', () => {
    expect(rubberBand(60, 300)).toBe(60);
    expect(rubberBand(90, 300)).toBe(90);
    const past = rubberBand(200, 300);
    expect(past).toBeGreaterThan(300 * RUBBER_FROM);
    expect(past).toBeLessThan(200);
    expect(rubberBand(-40, 300)).toBe(0);
  });

  it('tears past 40% or on a fast flick, and springs back otherwise', () => {
    expect(releaseTears(130, 300, 0)).toBe(true);
    expect(releaseTears(60, 300, 0.2)).toBe(true);
    expect(releaseTears(60, 300, 0.05)).toBe(false);
  });
});
