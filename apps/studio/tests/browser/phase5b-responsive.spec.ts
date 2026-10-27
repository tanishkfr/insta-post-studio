import { expect, test } from '@playwright/test';
import { waitForStudio } from './studio-helpers';

test('compact panels preserve canvas and restore focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForStudio(page);
  await expect(page.getByRole('heading', { name: 'Canvas workspace' })).toBeVisible();
  const tools = page.getByRole('button', { name: 'Tools', exact: true });
  await tools.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Tools' })).toBeVisible();
  await expect(page.getByTestId('tool-bend')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tools).toBeFocused();
  const layers = page.getByRole('button', { name: 'Layers', exact: true });
  await layers.click(); await expect(page.getByRole('dialog', { name: 'Layers' })).toBeVisible();
  await page.screenshot({ path: '../../docs/evidence/phase-5b/compact-layers-390.png' });
  await page.getByRole('dialog', { name: 'Layers' }).getByRole('button', { name: 'Close' }).click();
  await expect(layers).toBeFocused();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Inspector' })).toContainText('Nothing selected');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: '../../docs/evidence/phase-5b/compact-390.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('host layout at intermediate and wide sizes', async ({page}) => {
  for (const [width,height] of [[900,700],[1024,768],[1440,900]]) {
    await page.setViewportSize({width,height}); await waitForStudio(page);
    await expect(page.getByTestId('tool-bend')).toBeVisible();
    await page.screenshot({path:`../../docs/evidence/phase-5b/host-${width}.png`});
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
