import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from './safeTest';

const api = 'http://localhost:8000';
const inbox = process.env.RSL_E2E_MAILPIT_URL ?? 'http://localhost:18025';
const fixture = JSON.parse(readFileSync(resolve('../.local-test-artifacts/e2e-fixture.json'), 'utf8')) as { run_id: string; lesson_ids: string[] };
const password = process.env.RSL_E2E_PASSWORD;
if (!password) throw new Error('RSL_E2E_PASSWORD is required');
type Mail = { ID: string; To: { Address: string }[] };

test('admin user retry, native confirmation and deletion preserve another learner progress', async ({ page, request }) => {
  const owned: { id: number; name: string; email: string; access: string }[] = [];
  const administrator = await request.post(`${api}/auth/login`, { form: { username: `e2e_${fixture.run_id}@example.com`, password } });
  expect(administrator.status()).toBe(200);
  const adminHeaders = { Authorization: 'Bearer ' + (await administrator.json()).access_token };
  const messageIds = new Set<string>();
  try {
    for (let index = 0; index < 2; index += 1) {
      const name = 'users_' + randomUUID().replaceAll('-', '');
      const email = `${name}@example.com`;
      const row = { id: 0, name, email, access: '' };
      owned.push(row);
      const registered = await request.post(`${api}/auth/register`, { data: { username: name, email, password } });
      expect(registered.status()).toBe(200);
      row.id = (await registered.json()).id;
      const messages = (await (await request.get(`${inbox}/api/v1/messages`)).json()).messages as Mail[];
      const message = messages.find(item => item.To.some(to => to.Address === email));
      expect(Boolean(message)).toBe(true);
      messageIds.add(message!.ID);
      const body = await (await request.get(`${inbox}/api/v1/message/${message!.ID}`)).json();
      const token = (body.HTML as string).match(/\/verify-email#([A-Za-z0-9_-]+)/)?.[1];
      expect(Boolean(token)).toBe(true);
      expect((await request.post(`${api}/auth/verify-email`, { data: { token } })).status()).toBe(200);
      const loggedIn = await request.post(`${api}/auth/login`, { form: { username: email, password } });
      expect(loggedIn.status()).toBe(200);
      row.access = (await loggedIn.json()).access_token;
      expect((await request.post(`${api}/progress/lessons/${fixture.lesson_ids[0]}/attempts`, {
        headers: { Authorization: 'Bearer ' + row.access }, data: { completed: false },
      })).status()).toBe(200);
    }
    expect((await request.delete(`${api}/admin/users/${owned[1].id}`, {
      headers: { Authorization: 'Bearer ' + owned[0].access },
    })).status()).toBe(403);

    await page.addInitScript(() => { localStorage.setItem('lang', 'ru'); document.cookie = 'lang=ru; path=/'; });
    await page.goto('/');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(`e2e_${fixture.run_id}@example.com`);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).last().click();
    let listFails = true;
    await page.route(`${api}/admin/users?*`, async route => {
      if (listFails) await route.fulfill({ status: 503, json: { detail: 'Injected failure' } });
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Админка', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Не удалось загрузить пользователей.');
    await expect(page.getByText('На этой странице нет пользователей', { exact: true })).toHaveCount(0);
    listFails = false;
    await page.getByRole('button', { name: 'Повторить загрузку пользователей', exact: true }).click();
    const users = page.getByRole('region', { name: 'Пользователи и действия', exact: true });
    await expect(users).toContainText(owned[0].email);
    await expect(page.getByRole('button', { name: `Удалить пользователя e2e_${fixture.run_id}`, exact: true })).toBeDisabled();
    const remove = page.getByRole('button', { name: `Удалить пользователя ${owned[0].name}`, exact: true });
    await remove.click();
    const dialog = page.getByRole('dialog', { name: 'Удалить пользователя?', exact: true });
    await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeFocused();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await remove.click();
    await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Подтвердить удаление', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Обновить пользователей', exact: true }).focus();
    await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
    await page.screenshot({ path: '../.local-test-artifacts/admin-users-mobile.png', fullPage: true });

    let failDelete = true;
    await page.route(`${api}/admin/users/${owned[0].id}`, async route => {
      if (failDelete) await route.fulfill({ status: 503, json: {} });
      else await route.continue();
    });
    await dialog.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Не удалось подтвердить удаление.');
    await expect(users).toContainText(owned[0].email);
    failDelete = false;
    await dialog.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click();
    await expect(page.getByText('Пользователь удалён.', { exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Список пользователей', exact: true })).toBeFocused();
    await expect(users).not.toContainText(owned[0].email);
    expect((await request.get(`${api}/users/me`, { headers: { Authorization: 'Bearer ' + owned[0].access } })).status()).toBe(404);
    const progress = await request.get(`${api}/progress/lessons`, { headers: { Authorization: 'Bearer ' + owned[1].access } });
    expect(progress.status()).toBe(200);
    expect((await progress.json())[0].attempts).toBe(1);
  } finally {
    const remaining = await (await request.get(`${api}/admin/users?limit=1000`, { headers: adminHeaders })).json();
    for (const user of owned) {
      const id = user.id || remaining.find((value: { email: string; username: string }) => value.email === user.email && value.username === user.name)?.id;
      if (id) {
        const response = await request.delete(`${api}/admin/users/${id}`, { headers: adminHeaders });
        expect([204, 404].includes(response.status())).toBe(true);
      }
    }
    const messages = (await (await request.get(`${inbox}/api/v1/messages`)).json()).messages as Mail[];
    for (const message of messages) if (message.To.some(to => owned.some(user => user.email === to.Address))) messageIds.add(message.ID);
    if (messageIds.size) await request.delete(`${inbox}/api/v1/messages`, { data: { IDs: [...messageIds] } });
  }
});
