import { test, expect } from '@playwright/test';
import { fakeVision } from './fixtures.mjs';

test('short phones keep tools, navigation, capture and restored gallery reachable', async ({ page }) => {
  await fakeVision(page);
  for (const [width, height] of [[320, 568], [568, 320]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#manual-access').click();
    await expect(page.locator('#menu-screen')).toBeVisible();
    for (const mode of ['free', 'painting', 'photobooth', 'meme']) {
      await page.locator(`#mode-nav [data-mode=${mode}]`).click();
      const bounds = await page.locator('#tool-panel').boundingBox();
      const top = await page.locator('.topbar').boundingBox();
      const bottom = await page.locator('.actions').boundingBox();
      expect(bounds.y).toBeGreaterThanOrEqual(top.y + top.height);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(bottom.y);
      await expect(page.locator('#capture')).toBeInViewport();
    }
    await page.locator('#mode-nav [data-mode=free]').click();
    await page.locator('#capture').click();
    await expect(page.locator('.photo-card')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('#photo-count')).toHaveText('1');
    await page.locator('#gallery-toggle').click();
    await expect(page.getByRole('link', { name: 'Unduh PNG' })).toBeInViewport();
    await page.getByRole('button', { name: 'Hapus', exact: true }).click();
    await page.getByRole('button', { name: 'Ya, hapus', exact: true }).click();
    await expect(page.locator('.photo-card')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
