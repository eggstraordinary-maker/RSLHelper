import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const fixture = JSON.parse(readFileSync(resolve('../.local-test-artifacts/e2e-fixture.json'), 'utf8')) as {
  run_id: string; email: string; password: string;
};

test('real login, duplicate titles, video/S3, practice, completion, reload and camera lifecycle', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Войти', exact: true }).first().click();
  await page.getByLabel('Email').fill(fixture.email);
  await page.getByLabel('Пароль', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).last().click();
  await page.getByRole('button', { name: 'Обучение', exact: true }).click();
  await page.getByRole('button', { name: `E2E practice ${fixture.run_id}`, exact: true }).nth(1).click();
  const video = page.getByLabel('Эталонный жест');
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('Камера выключена.', { exact: true })).toBeVisible();
  await expect(page.getByText('Автоматическое распознавание сейчас недоступно.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Я повторил(а) жест', exact: true }).click();
  await expect(page.getByText('Самостоятельная практика сохранена.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отметить урок пройденным', exact: true }).click();
  await expect(page.getByText('Урок отмечен пройденным.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Включить камеру', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Выключить камеру', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Выключить камеру', exact: true }).click();
  await expect(page.getByText('Камера выключена.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Обучение', exact: true }).click();
  await page.getByRole('button', { name: `E2E practice ${fixture.run_id}`, exact: true }).nth(1).click();
  await expect(page.getByText('Урок пройден по вашей отметке.', { exact: true })).toBeVisible();
  await expect(page.getByText('Повторений сохранено: 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отметить урок пройденным', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Я повторил(а) жест', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
