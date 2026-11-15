import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from './safeTest';

const fixture = JSON.parse(readFileSync(resolve('../.local-test-artifacts/e2e-fixture.json'), 'utf8')) as { run_id: string };
const password = process.env.RSL_E2E_PASSWORD;
if (!password) throw new Error('RSL_E2E_PASSWORD is required for browser login');

test('deep link login, reload, navigation history, admin, 404 and logout guards', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('lang', 'ru'); document.cookie = 'lang=ru; path=/'; });
  await page.goto('/learning');
  await expect(page).toHaveURL('/login');
  await page.getByLabel('Email', { exact: true }).fill(`e2e_${fixture.run_id}@example.com`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL('/learning');
  await expect(page.getByText('Автоматическое распознавание сейчас недоступно.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL('/learning');
  await expect(page.getByRole('link', { name: 'Обучение', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Словарь', exact: true }).click();
  await expect(page).toHaveURL('/dictionary');
  await page.goBack();
  await expect(page).toHaveURL('/learning');
  await page.goForward();
  await expect(page).toHaveURL('/dictionary');
  await page.getByRole('link', { name: 'Админка', exact: true }).click();
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Список пользователей', exact: true })).toBeVisible();
  await page.goto('/missing-route');
  await expect(page.getByRole('heading', { name: '404 — Страница не найдена', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Словарь', exact: true }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page.goto('/admin');
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { name: 'Список пользователей', exact: true })).toHaveCount(0);
});
