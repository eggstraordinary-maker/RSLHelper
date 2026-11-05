import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const api = 'http://localhost:8000';
const inbox = process.env.RSL_E2E_MAILPIT_URL ?? 'http://localhost:18025';
const fixture = JSON.parse(readFileSync(resolve('../.local-test-artifacts/e2e-fixture.json'), 'utf8')) as { run_id: string };
const fixturePassword = process.env.RSL_E2E_PASSWORD;
if (!fixturePassword) throw new Error('RSL_E2E_PASSWORD is required for browser login');
type Mail = { ID: string; To: { Address: string }[] };

async function mailToken(request: APIRequestContext, email: string, path: string) {
  let credential = '';
  await expect.poll(async () => {
    const messages = (await (await request.get(`${inbox}/api/v1/messages`)).json()).messages as Mail[];
    for (const message of messages.filter(item => item.To.some(to => to.Address === email))) {
      const body = await (await request.get(`${inbox}/api/v1/message/${message.ID}`)).json();
      const match = (body.HTML as string).match(new RegExp(`/${path}#([A-Za-z0-9_-]+)`));
      if (match) { credential = match[1]; return true; }
    }
    return false;
  }).toBe(true);
  return credential;
}

async function openCredential(page: Page, path: string, credential: string) {
  // Do not put tokenized URLs in Playwright navigation/error logs or traces.
  await page.goto('/');
  await page.evaluate(({ path, credential }) => {
    history.replaceState(null, '', `/${path}#${credential}`);
    location.reload();
  }, { path, credential });
}

test('real browser registration, SMTP verification/reset, profile and deletion', async ({ page, request }) => {
  const name = 'browser_' + randomUUID().replaceAll('-', '');
  const email = `${name}@example.com`;
  const password = 'BrowserTest8';
  const newPassword = 'NewBrowserTest8';
  await page.addInitScript(() => { localStorage.setItem('lang', 'ru'); document.cookie = 'lang=ru; path=/'; });
  try {
    await page.goto('/register');
    await page.getByLabel('Имя пользователя', { exact: true }).fill(name);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByLabel('Подтвердите пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
    await expect(page.getByText('Регистрация успешна. Проверьте почту для подтверждения email.', { exact: true })).toBeVisible();
    const verify = await mailToken(request, email, 'verify-email');
    await openCredential(page, 'verify-email', verify);
    await expect(page.getByText('Email подтверждён. Теперь можно войти в систему.', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
    await page.getByRole('link', { name: 'На главную', exact: true }).click();
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).last().click();
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Профиль', exact: true }).first()).toBeVisible();
    await page.getByLabel('Имя пользователя', { exact: true }).fill(name + '_new');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Профиль успешно обновлён.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByRole('button', { name: 'Забыли пароль?', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Отправить ссылку для восстановления', exact: true }).click();
    await expect(page.getByText(/Если аккаунт с таким email существует/)).toBeVisible();
    const reset = await mailToken(request, email, 'reset-password');
    await openCredential(page, 'reset-password', reset);
    await page.getByLabel('Новый пароль', { exact: true }).fill(newPassword);
    await page.getByLabel('Повторите новый пароль', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Изменить пароль', exact: true }).click();
    await expect(page.getByText('Пароль изменён. Теперь можно войти с новым паролем.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'На главную', exact: true }).click();
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Войти', exact: true }).last().click();
    await page.getByRole('link', { name: name + '_new', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить аккаунт', exact: true }).click();
    await page.getByLabel('Введите пароль для подтверждения удаления', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  } finally {
    // The trusted test fixture owns this temporary account; no working users.
    const admin = await request.post(`${api}/auth/login`, { form: { username: `e2e_${fixture.run_id}@example.com`, password: fixturePassword } });
    if (admin.ok()) {
      const authorization = { Authorization: 'Bearer ' + (await admin.json()).access_token };
      const users = await (await request.get(`${api}/admin/users`, { headers: authorization })).json();
      for (const user of users.filter((value: { email: string }) => value.email === email)) {
        await request.delete(`${api}/admin/users/${user.id}`, { headers: authorization });
      }
    }
    const messages = (await (await request.get(`${inbox}/api/v1/messages`)).json()).messages as Mail[];
    const ids = messages.filter(message => message.To.some(to => to.Address === email)).map(message => message.ID);
    if (ids.length) await request.delete(`${inbox}/api/v1/messages`, { data: { IDs: ids } });
  }
});

test('guest mode survives reload and an anonymous profile returns to the entry screen', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('lang', 'ru'); document.cookie = 'lang=ru; path=/'; });
  await page.goto('/profile');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить без регистрации →', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Словарь жестов', exact: true })).toBeVisible();
  await expect(page.getByText('Вы в гостевом режиме. Доступен только словарь.', { exact: true })).toBeVisible();
});

test('logout propagates to another open profile tab', async ({ page, context }) => {
  await context.addInitScript(() => { localStorage.setItem('lang', 'ru'); document.cookie = 'lang=ru; path=/'; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(`e2e_${fixture.run_id}@example.com`);
  await page.getByLabel('Пароль', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Войти', exact: true }).last().click();
  await page.getByRole('link', { name: `e2e_${fixture.run_id}`, exact: true }).click();
  const other = await context.newPage();
  await other.goto('/profile');
  await expect(other.getByRole('heading', { name: 'Профиль', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
  await expect(other).toHaveURL('/');
  await expect(other.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  await expect(other.getByRole('heading', { name: 'Профиль', exact: true })).toHaveCount(0);
});
