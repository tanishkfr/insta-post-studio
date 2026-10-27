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
  for (const [id, ready] of tools) {
    await waitForStudio(page);
    await page.getByTestId(`tool-${id}`).click();
    await ready(page);
  }
  await waitForStudio(page);
  await page.getByTestId('tool-bend').click();
  await expect(page.getByTestId('bend-editor')).toBeVisible();
  await expect(page.frameLocator('iframe[title="BEND motion editor"]').locator('body')).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('button', { name: /Publish|Add to composition/ }).first()).toBeEnabled({ timeout: 60000 });
  expect(errors).toEqual([]);
});
