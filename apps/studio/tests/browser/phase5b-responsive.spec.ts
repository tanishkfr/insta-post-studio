import { expect, test } from '@playwright/test';
import { layerIds, openVector, publishVector, waitForStudio } from './studio-helpers';

test('compact host keeps the top tool navigation, canvas and panel focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForStudio(page);
  await expect(page.getByRole('heading', { name: 'Canvas workspace' })).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'Studio tools' });
  await expect(navigation).toBeVisible();
  for (const id of ['image', 'vector', 'typography', 'shapes', 'bend', 'generate']) {
    await expect(page.getByTestId(`tool-${id}`)).toHaveCount(1);
  }
  await expect(page.getByTestId('tool-canvas')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('tool-generate').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('tool-generate')).toBeVisible();
  await page.getByTestId('tool-canvas').click();
  await expect(page.getByTestId('tool-canvas')).toHaveAttribute('aria-current', 'page');

  const layers = page.getByRole('button', { name: 'Layers', exact: true });
  await layers.click(); await expect(page.getByRole('dialog', { name: 'Layers' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Layers' }).getByRole('button', { name: 'Close' }).click();
  await expect(layers).toBeFocused();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Inspector' })).toContainText('Nothing selected');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('compact Layers and Inspector operate on real artwork and expose all six tools', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForStudio(page);
  await openVector(page);
  await publishVector(page);
  const layerId = (await layerIds(page))[0];
  const layerName = await page.locator(`[data-testid="layer-row-${layerId}"] .layer-name-text`).innerText();

  await page.setViewportSize({ width: 390, height: 844 });
  const layers = page.getByRole('button', { name: 'Layers', exact: true });
  await expect(layers).toBeVisible();
  await layers.click();
  const layersDialog = page.getByRole('dialog', { name: 'Layers' });
  await expect(layersDialog.getByTestId(`layer-row-${layerId}`)).toBeVisible();
  await layersDialog.locator(`[data-testid="layer-row-${layerId}"] .layer-name-button`).click();
  await expect(layersDialog.locator(`[data-testid="layer-row-${layerId}"]`)).toHaveClass(/is-selected/);
  await layersDialog.getByRole('button', { name: 'Close' }).click();
  await expect(layers).toBeFocused();

  const inspector = page.getByRole('button', { name: 'Inspector', exact: true });
  await inspector.click();
  const inspectorDialog = page.getByRole('dialog', { name: 'Inspector' });
  await expect(inspectorDialog.getByTestId('inspector-edit-vector')).toBeVisible();
  await expect(inspectorDialog.getByLabel('Layer name')).toHaveValue(layerName);
  const continueTrigger = inspectorDialog.getByRole('button', { name: 'Continue in…' });
  await expect(continueTrigger).toBeVisible();
  await continueTrigger.click();
  await expect(page.getByTestId('animate-in-bend')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(continueTrigger).toBeFocused();
  await expect(inspectorDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(inspector).toBeFocused();

  const tools = page.getByRole('navigation', { name: 'Studio tools' });
  for (const id of ['image', 'vector', 'typography', 'shapes', 'bend', 'generate']) {
    await expect(tools.getByTestId(`tool-${id}`)).toHaveCount(1);
  }
  await expect(page.getByTestId('tool-canvas')).toHaveAttribute('aria-current', 'page');

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('host layout at intermediate and wide sizes', async ({page}) => {
  for (const [width,height] of [[900,700],[1024,768],[1440,900]]) {
    await page.setViewportSize({width,height}); await waitForStudio(page);
    await expect(page.getByTestId('tool-bend')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
