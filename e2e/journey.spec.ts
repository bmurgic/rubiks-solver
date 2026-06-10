import { expect, test } from '@playwright/test';

test('scramble → solve → play to completion → cube is solved', async ({ page }) => {
  await page.goto('/');
  const app = page.getByTestId('app');
  await expect(app).toHaveAttribute('data-phase', 'SOLVED');

  await page.getByTestId('scramble').click();
  await expect(app).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-solved', 'false');

  await page.getByTestId('solve').click();
  await page.getByTestId('speed').selectOption('2');
  await page.getByTestId('play').click();
  await expect(app).toHaveAttribute('data-phase', 'PLAYING');
  await expect(app).toHaveAttribute('data-phase', 'SOLVED', { timeout: 120_000 });
  await expect(app).toHaveAttribute('data-solved', 'true');
});

test('scramble is always available and hard-resets mid-playback', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('scramble').click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'SCRAMBLED', { timeout: 30_000 });
  await page.getByTestId('solve').click();
  await page.getByTestId('play').click();
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', 'PLAYING');
  await page.getByTestId('scramble').click(); // mid-playback reset
  await expect(page.getByTestId('app')).toHaveAttribute('data-phase', /SCRAMBLING|SCRAMBLED/, { timeout: 30_000 });
});
