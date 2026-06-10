import { expect, test, type Page } from '@playwright/test';

/** Press-and-hold the play button past the 600 ms threshold → continuous playback. */
async function holdPlay(page: Page): Promise<void> {
  await page.getByTestId('play').hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

test('scramble → solve → play to completion → cube is solved', async ({ page }) => {
  await page.goto('/');
  const app = page.getByTestId('app');
  await expect(app).toHaveAttribute('data-phase', 'SOLVED');

  await page.getByTestId('scramble').click();
  await expect(app).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-solved', 'false');

  await page.getByTestId('solve').click();
  await page.getByTestId('speed').selectOption('2');
  await page.getByTestId('auto-continue').check(); // play through stage pauses
  await holdPlay(page);
  await expect(app).toHaveAttribute('data-phase', 'PLAYING');
  await expect(app).toHaveAttribute('data-phase', 'SOLVED', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-solved', 'true');
});

test('playback pauses at each stage boundary unless auto-continue is on', async ({ page }) => {
  await page.goto('/');
  const app = page.getByTestId('app');
  await page.getByTestId('scramble').click();
  await expect(app).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await page.getByTestId('solve').click();
  await page.getByTestId('speed').selectOption('2');

  // Auto is off by default: one held Play stops at the first stage boundary,
  // not at the end of the solve.
  await holdPlay(page);
  await expect(app).toHaveAttribute('data-phase', 'PLAYING');
  await expect(app).toHaveAttribute('data-phase', 'PAUSED', { timeout: 60_000 });
  await expect(app).toHaveAttribute('data-solved', 'false');

  // Play resumes from the pause and stops at the next boundary.
  await holdPlay(page);
  await expect(app).toHaveAttribute('data-phase', 'PLAYING');
  await expect(app).toHaveAttribute('data-phase', 'PAUSED', { timeout: 60_000 });
});

test('scramble is always available and hard-resets mid-playback', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('scramble').click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await page.getByTestId('solve').click();
  await holdPlay(page);
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'PLAYING');
  await page.getByTestId('scramble').click(); // mid-playback reset
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', /SCRAMBLING|SCRAMBLED/, { timeout: 30_000 });
});

test('teaching rail highlights the stage being viewed and moves with seeking', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('scramble').click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await page.getByTestId('solve').click();

  // Default Playwright viewport (1280x720) is >= lg, so the desktop rail renders.
  const firstRow = page.getByTestId('stage-roadmap-0');
  const lastRow = page.getByTestId('stage-roadmap-5');
  await expect(firstRow).toBeVisible();

  // Seek to the first stage: its row is active (font-semibold), the last is not.
  await page.getByTestId('stage-seg-0').click();
  await expect(firstRow).toHaveClass(/font-semibold/);
  await expect(lastRow).not.toHaveClass(/font-semibold/);

  // Seek to the last stage: the highlight moves.
  await page.getByTestId('stage-seg-5').click();
  await expect(lastRow).toHaveClass(/font-semibold/);
  await expect(firstRow).not.toHaveClass(/font-semibold/);
});

test('teaching card is visible on mobile after a solve', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // < lg → mobile card, not the rail
  await page.goto('/');
  await page.getByTestId('scramble').click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await page.getByTestId('solve').click();
  await expect(page.getByTestId('teaching-panel')).toBeVisible();
});

test('teaching panel narrates the current action after a solve', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('scramble').click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await page.getByTestId('solve').click();

  // Seek to the start: the first action's why is showing in the desktop rail.
  await page.getByTestId('stage-seg-0').click();
  const why = page.getByTestId('teaching-rail').getByTestId('action-why');
  await expect(why).toBeVisible();
  await expect(why).toHaveText(/.{20,}/); // real narration copy, not a placeholder glyph
});

test('app exposes the upcoming move face as a layer cue while paused', async ({ page }) => {
  await page.goto('/');
  const app = page.getByTestId('app');
  await page.getByTestId('scramble').click();
  await expect(app).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });

  // No solve yet: no cue.
  await expect(app).not.toHaveAttribute('data-cue-face', /./);

  await page.getByTestId('solve').click();
  await page.getByTestId('stage-seg-0').click(); // paused at the start, first move pending
  await expect(app).toHaveAttribute('data-cue-face', /^[UDRLFB]$/);
});

test('tapping play advances exactly one move then pauses', async ({ page }) => {
  await page.goto('/');
  const app = page.getByTestId('app');
  await page.getByTestId('scramble').click();
  await expect(app).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await page.getByTestId('solve').click();
  await expect(page.getByTestId('scrub')).toHaveValue('0');

  // Quick tap: press is well under the 600 ms hold threshold.
  await page.getByTestId('play').click();
  // Assert the move committed BEFORE asserting PAUSED — PAUSED is also the
  // pre-tap state, so checking it first would race the turn animation.
  await expect(page.getByTestId('scrub')).toHaveValue('1', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-phase', 'PAUSED');

  // A second tap advances exactly one more move.
  await page.getByTestId('play').click();
  await expect(page.getByTestId('scrub')).toHaveValue('2', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-phase', 'PAUSED');
});
