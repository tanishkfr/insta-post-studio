import { expect, test } from '@playwright/test';
import { waitForStudio, waitForImageReady, waitForVectorReady, waitForTypeReady, waitForShapesReady, waitForGenerateReady } from './studio-helpers';

test('all six tools open from the integrated navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const tools = [
    ['image', waitForImageReady], ['vector', waitForVectorReady],
    ['typography', waitForTypeReady], ['shapes', waitForShapesReady],
    ['generate', waitForGenerateReady],
  ] as const;
  await waitForStudio(page);
  for (const [id, ready] of tools) {
    await page.getByTestId(`tool-${id}`).click();
    await ready(page);
    await page.locator('.tool-session').getByRole('button', { name: 'Canvas', exact: true }).click();
    await expect(page.getByTestId('artboard')).toBeVisible();
  }
  await page.getByTestId('tool-bend').click();
  await expect(page.getByTestId('bend-editor')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Video editor"]').locator('body')).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('button', { name: /Publish|Add to composition/ }).first()).toBeEnabled({ timeout: 60000 });
  expect(errors).toEqual([]);
});
