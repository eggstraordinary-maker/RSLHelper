import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const fixture = JSON.parse(readFileSync(resolve('../.local-test-artifacts/e2e-fixture.json'), 'utf8')) as {
  run_id: string; lesson_ids: string[];
};
const api = 'http://localhost:8000';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'ru');
    document.cookie = 'lang=ru; path=/';
  });
});

test('guest dictionary uses real UUID media, keyboard selection, seeking, RU/EN and a narrow screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Продолжить без регистрации →', exact: true }).click();
  const toc = page.getByRole('complementary', { name: 'Оглавление' });
  const choices = toc.getByRole('button', { name: `E2E practice ${fixture.run_id}`, exact: true });
  await expect(choices).toHaveCount(2);
  await choices.first().focus();
  await page.keyboard.press('Tab');
  await expect(choices.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(choices.nth(1)).toHaveAttribute('aria-current', 'true');
  const media = page.getByLabel('Эталонный жест');
  await expect(media).toHaveAttribute('src', `${api}/videos/lessons/${fixture.lesson_ids[1]}/content`);
  await expect.poll(() => media.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('Загрузка видео…', { exact: true })).toHaveCount(0);
  const range = await page.request.get((await media.getAttribute('src'))!, { headers: { Range: 'bytes=0-15' } });
  expect(range.status()).toBe(206);
  expect((await range.body()).byteLength).toBe(16);
  await media.evaluate((element: HTMLVideoElement) => { element.currentTime = Math.min(0.1, element.duration / 2); });
  await expect.poll(() => media.evaluate((element: HTMLVideoElement) =>
    !element.seeking && element.readyState >= 2 && element.currentTime > 0,
  )).toBe(true);
  await expect(page.getByRole('region', { name: 'Описание жеста' })).toContainText(`E2E practice ${fixture.run_id}`);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: /Русский/ }).click();
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('heading', { name: 'Sign dictionary' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Contents' })).toBeVisible();
  await expect(page.getByLabel('Reference sign')).toHaveAttribute('src', `${api}/videos/lessons/${fixture.lesson_ids[1]}/content`);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('button', { name: 'Refresh sign list', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '../.local-test-artifacts/FE-011-mobile.png', fullPage: true });
});

test('catalog and media failures recover independently against the real API and S3', async ({ page }) => {
  let failCatalog = true;
  let failMedia = true;
  let catalogRequests = 0;
  await page.route(`${api}/videos/lessons`, async route => {
    catalogRequests += 1;
    if (failCatalog) await route.fulfill({ status: 503, json: { detail: 'Injected catalog outage' } });
    else await route.continue();
  });
  await page.route(`${api}/videos/lessons/*/content`, async route => {
    if (failMedia) await route.fulfill({ status: 503, body: '' });
    else await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Продолжить без регистрации →', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить список жестов.');
  await expect(page.getByText('В словаре пока нет видео', { exact: true })).toHaveCount(0);
  failCatalog = false;
  const listRetry = page.getByRole('button', { name: 'Повторить загрузку списка', exact: true });
  await listRetry.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить видео.');
  const catalogCount = catalogRequests;
  const selectedSrc = await page.getByLabel('Эталонный жест').getAttribute('src');
  failMedia = false;
  const mediaRetry = page.getByRole('button', { name: 'Повторить загрузку видео', exact: true });
  await mediaRetry.focus();
  await page.keyboard.press('Enter');
  const media = page.getByLabel('Эталонный жест');
  await expect(media).toBeFocused();
  await expect(media).toHaveAttribute('src', selectedSrc!);
  await expect.poll(() => media.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(catalogRequests).toBe(catalogCount);
  failCatalog = true;
  await page.getByRole('button', { name: 'Обновить список жестов', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить список жестов.');
  await expect(media).toHaveAttribute('src', selectedSrc!);
  await expect.poll(() => media.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
});

test('empty and missing-metadata states remain readable on mobile in English', async ({ page }) => {
  let empty = true;
  await page.route(`${api}/videos/lessons`, async route => {
    if (empty) return route.fulfill({ json: [] });
    const response = await route.fetch();
    const lessons = await response.json();
    // Only metadata is varied; the media still comes from the real isolated S3.
    lessons[0].description = null;
    lessons[1].description = 'LongUnbrokenSignDescription'.repeat(12);
    await route.fulfill({ response, json: lessons });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Продолжить без регистрации →', exact: true }).click();
  await expect(page.getByText('В словаре пока нет видео', { exact: true })).toBeVisible();
  // The mobile language button displays the flag; its expanded menu is labelled.
  await page.locator('button[aria-haspopup="true"]').click();
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByText('There are no videos in the dictionary yet', { exact: true })).toBeVisible();
  empty = false;
  await page.getByRole('button', { name: 'Refresh sign list', exact: true }).click();
  await expect(page.getByText('A description is not available for this sign yet. Refer to the video.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Selected sign', exact: true })).toHaveValue(`e2e-${fixture.run_id}-0.mp4`);
  await page.getByRole('complementary', { name: 'Contents' }).getByRole('button').nth(1).click();
  await expect(page.getByRole('region', { name: 'Sign description' })).toContainText('LongUnbrokenSignDescription');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
