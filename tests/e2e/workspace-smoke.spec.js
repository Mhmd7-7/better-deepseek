import { test, expect } from './helpers/extension.js';

test('packaged extension starts its original UI and the task workspace', async ({ page }) => {
  await expect(page.locator('#bds-toggle')).toBeVisible();
  await expect(page.locator('.bds-qa-launcher')).toBeVisible();
  await expect(page.locator('.bds-ws-launch')).toBeVisible();
  await page.locator('.bds-ws-launch').click();
  await expect(page.locator('#bds-workspace dialog')).toBeVisible();
});
