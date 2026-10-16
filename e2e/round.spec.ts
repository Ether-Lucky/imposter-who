/**
 * T7.3: a full Classic round with the board and three phones, through the real server.
 * Also checks REQ-SEC-2 / REQ-GUESS-5 the way a person would: the civilian's and the
 * imposter's phones look identical, pixel for pixel, once the personal bits (name, seat,
 * barcode) are masked.
 */
import { writeFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** Pixels that differ between two same-size PNG screenshots. */
function pixelsApart(a: Buffer, b: Buffer): number {
  const [x, y] = [PNG.sync.read(a), PNG.sync.read(b)];
  if (x.width !== y.width || x.height !== y.height) return Infinity;
  return pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0.1 });
}

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const NAMES = ['Ana', 'Ben', 'Cy'];

/** What the board is announcing (the headline row's screen-reader text). */
const headline = (board: Page) => board.locator('h2 .sr-only').first();

async function openPhone(browser: Browser, name: string) {
  const page = await (await browser.newContext(PHONE)).newPage();
  await page.goto(`/play?as=${name}`);
  await page.getByRole('textbox').fill(name);
  await page.getByRole('button', { name: 'Check in' }).click();
  await expect(page.getByText('Waiting for departure')).toBeVisible();
  return page;
}

/** Hold the ticket and read the destination; release. */
async function peek(phone: Page): Promise<string> {
  const ticket = phone.getByRole('button', { name: /Press and hold to see your destination/ });
  await ticket.dispatchEvent('pointerdown');
  const text = (await phone.locator('.ticket .text-4xl').textContent()) ?? '';
  await ticket.dispatchEvent('pointerup');
  return text;
}

test('a full round: check in, tear, clues, vote, reveal, arrivals', async ({ browser }) => {
  const board = await (
    await browser.newContext({ viewport: { width: 1366, height: 768 } })
  ).newPage();
  await board.goto('/host');
  await expect(headline(board)).toHaveText('CHECK IN: SCAN THE CODE');

  const phones = [];
  for (const name of NAMES) phones.push(await openPhone(browser, name));
  await expect(headline(board)).toHaveText('ALL PASSENGERS CHECKED IN');

  await board.getByRole('button', { name: 'Start round' }).click();
  await expect(headline(board)).toHaveText('TICKET CHECK. TEAR YOUR TICKET');

  // Tear with the keyboard (Enter on the stub), then hide the face again.
  for (const phone of phones) {
    await phone.locator('.tear').focus();
    await phone.keyboard.press('Enter');
    await expect(phone.getByText('Destination', { exact: true })).toBeVisible();
    await phone.getByRole('button', { name: 'Hide my ticket' }).click();
  }

  // Find the imposter by peeking each ticket.
  const faces = await Promise.all(phones.map(peek));
  const imposter = faces.findIndex((f) => /destination unknown/i.test(f));
  expect(imposter).toBeGreaterThanOrEqual(0);
  const word = faces.find((f) => !/destination unknown/i.test(f))!;
  // REQ-SEC-3: the board never shows the word before the result.
  expect((await board.content()).toLowerCase()).not.toContain(word.toLowerCase());

  await expect(headline(board)).toHaveText(/NOW BOARDING/, { timeout: 15_000 });

  // Each phone gives a clue on its turn.
  for (let turn = 0; turn < NAMES.length; turn++) {
    await expect(headline(board)).toHaveText(/NOW BOARDING: /);
    const who = ((await headline(board).textContent()) ?? '').replace('NOW BOARDING: ', '');
    const phone = phones[NAMES.findIndex((n) => n.toUpperCase() === who)]!;
    await phone.getByRole('textbox').fill(`clue${turn}`);
    await phone.getByRole('button', { name: 'Send clue' }).click();
    if (turn < NAMES.length - 1)
      await expect(headline(board)).not.toHaveText(`NOW BOARDING: ${who}`);
  }
  await expect(headline(board)).toHaveText('DELAYED: DISCUSS');

  // REQ-SEC-2 / REQ-GUESS-5: civilian and imposter phones look the same.
  const civilian = phones[(imposter + 1) % phones.length]!;
  const mask = (p: Page) => [
    p.locator('.ticket-head'),
    p.locator('.ticket .text-2xl'),
    p.locator('.barcode'),
    // The clock ticks between the two captures.
    p.locator('.phone-strip .tabular-nums'),
  ];
  // Let the peek-only footer from the earlier peeks fold away on both phones.
  await civilian.waitForTimeout(3500);
  const shotOf = (p: Page) => p.screenshot({ mask: mask(p), animations: 'disabled' });
  const [a, b] = [await shotOf(phones[imposter]!), await shotOf(civilian)];
  writeFileSync(test.info().outputPath('imposter.png'), a);
  writeFileSync(test.info().outputPath('civilian.png'), b);
  // A few pixels of slack for anti-aliasing at the edges of the masks.
  expect(pixelsApart(a, b)).toBeLessThanOrEqual(12);

  await board.getByRole('button', { name: 'Go to vote' }).click();
  await expect(headline(board)).toHaveText('FINAL CALL. CAST YOUR VOTE');
  // Everyone votes for the imposter (the imposter votes for someone else).
  for (const [i, phone] of phones.entries()) {
    const target = i === imposter ? NAMES[(imposter + 1) % NAMES.length]! : NAMES[imposter]!;
    await phone.locator('.punch-row', { hasText: target }).click();
    // The last vote closes voting at once, so only earlier voters still see their punch.
    if (i < phones.length - 1) {
      await expect(phone.locator('.punch-row[aria-pressed="true"]')).toHaveCount(1);
    }
  }

  await expect(headline(board)).toHaveText(/COUNTING VOTES|MOST VOTES/, { timeout: 10_000 });
  await expect(headline(board)).toHaveText(`MOST VOTES: ${NAMES[imposter]!.toUpperCase()}`, {
    timeout: 15_000,
  });

  // Caught: the imposter gets a last guess. Guess wrong and hold to confirm.
  const imp = phones[imposter]!;
  await expect(headline(board)).toHaveText(/DEPARTED/, { timeout: 15_000 });
  await expect(imp.getByText('Name the destination')).toBeVisible({ timeout: 15_000 });
  await imp.getByRole('textbox').fill('nothing-like-it');
  const hold = imp.getByRole('button', { name: 'Hold to guess' });
  await hold.dispatchEvent('pointerdown');
  await imp.waitForTimeout(1400);
  // The guess confirms at 1.2 s and the button goes with the phase; releasing is a formality.
  await hold.dispatchEvent('pointerup', {}, { timeout: 1000 }).catch(() => {});

  await expect(headline(board)).toHaveText(/^CIVILIANS WIN/, { timeout: 15_000 });
  await expect(civilian.getByText('You won')).toBeVisible();
  await expect(imp.getByText('You lost')).toBeVisible();
  expect((await board.content()).toLowerCase()).toContain(word.toLowerCase());
});
