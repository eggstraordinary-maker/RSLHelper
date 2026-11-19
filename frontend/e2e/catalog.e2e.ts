import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from './safeTest';

const fixture = JSON.parse(readFileSync(resolve('../.local-test-artifacts/e2e-fixture.json'), 'utf8')) as {
  run_id: string;
  lesson_ids: string[];
};
const password = process.env.RSL_E2E_PASSWORD;
if (!password) throw new Error('RSL_E2E_PASSWORD is required for browser login');

test('publish an alphabet lesson, find it in the dictionary and retain progress after archive', async ({ page }) => {
  const api = 'http://localhost:8000';
  const title = `E2E catalog ${fixture.run_id}`;
  const name = `e2e_${fixture.run_id}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { localStorage.setItem('lang', 'ru'); document.cookie = 'lang=ru; path=/'; });
  await page.goto('/admin/catalog?new=1');
  await page.getByLabel('Email', { exact: true }).fill(`${name}@example.com`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).last().click();
  await expect(page).toHaveURL(/\/admin\/catalog\?new=1$/);
  await page.getByLabel('Название жеста').fill(title);
  await page.getByLabel('Описание и инструкция').fill('Repeat the synthetic example');
  await page.getByLabel('Категория', { exact: true }).fill('Тестовые буквы');
  await page.getByLabel('Учебный раздел').selectOption('alphabet');
  await expect(page.getByRole('button', { name: 'Создать черновик' })).toBeDisabled();
  await page.getByLabel('Буква алфавита').selectOption('Ё');
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await expect(page).toHaveURL(/\/admin\/catalog\?gesture=[0-9a-f-]+$/);
  const editor = page.url();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Одобрить версию' }).click();
  await expect(page.getByRole('alert')).toContainText('Видеопример');

  const source = await page.request.get(`${api}/videos/lessons/${fixture.lesson_ids[0]}/content`);
  expect(source.status()).toBe(200);
  await page.getByLabel('Выбрать MP4').setInputFiles({
    name: `e2e-${fixture.run_id}-catalog.mp4`, mimeType: 'video/mp4', buffer: await source.body(),
  });
  await page.getByRole('button', { name: 'Загрузить видео' }).click();
  await expect(page.getByText('Видео сохранено в черновике.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Смотреть текущий видеопример' }).click();
  const preview = page.getByRole('region', { name: 'Смотреть видео версии 2' }).getByLabel('Видеопример');
  await expect(preview).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Закрыть просмотр' }).click();
  await expect(preview).toHaveCount(0);

  await page.getByLabel('Источник видео').fill('Synthetic test clip');
  await page.getByLabel('Подтверждение согласия').fill('Test fixture');
  await page.getByRole('button', { name: 'Сохранить версию' }).click();
  await expect(page.getByText('Версия сохранена.', { exact: true })).toBeVisible();
  await page.getByLabel('Комментарий', { exact: true }).fill('Synthetic example checked');
  await page.getByRole('button', { name: 'Одобрить версию' }).click();
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.getByText('Опубликовано · Версия 5', { exact: true })).toBeVisible();

  await page.getByLabel('Название жеста').fill(`${title} draft`);
  await page.getByRole('button', { name: 'Сохранить версию' }).click();
  await expect(page.getByText('В словаре доступна версия 5.', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Словарь', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Поиск по названию или категории' });
  await search.fill('тестовые буквы');
  const dictionary = page.getByRole('complementary', { name: 'Оглавление' });
  await expect(dictionary.getByRole('button')).toHaveCount(1);
  await expect(dictionary.getByRole('button', { name: title, exact: true })).toBeVisible();
  await search.fill('публикация отсутствует');
  await expect(page.getByText('По вашему запросу жесты не найдены.')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить поиск и фильтры' }).click();
  await search.fill(title.toUpperCase());
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByText('Категория · Тестовые буквы', { exact: true })).toBeVisible();
  await expect(page.getByText('Учебный материал', { exact: true })).toBeVisible();
  const publicVideo = page.getByLabel('Эталонный жест');
  await expect(publicVideo).toHaveAttribute('src', /\/videos\/lessons\/[0-9a-f-]+\/content$/);
  const publicUrl = (await publicVideo.getAttribute('src'))!;
  await page.getByRole('link', { name: 'Обучение', exact: true }).click();
  const sectionNav = page.getByRole('navigation', { name: 'Разделы обучения' });
  await expect(sectionNav.getByRole('link', { name: 'Базовые жесты' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: `E2E practice ${fixture.run_id}`, exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: `Ё · ${title}`, exact: true })).toHaveCount(0);
  await sectionNav.getByRole('link', { name: 'Алфавит' }).click();
  await page.getByRole('button', { name: `Ё · ${title}`, exact: true }).click();
  await expect(page).toHaveURL(/\/learning\?section=alphabet&lesson=[0-9a-f-]+$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: `Ё · ${title}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Я повторил(а) жест', exact: true }).click();
  await expect(page.getByText('Самостоятельная практика сохранена.', { exact: true })).toBeVisible();

  await page.goto(editor);
  await page.getByRole('button', { name: 'В архив', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(page.getByText('В архиве · Версия 7', { exact: true })).toBeVisible();
  expect((await page.request.get(publicUrl)).status()).toBe(404);
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Прогресс по недоступным урокам' })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
  await page.goto(editor);
  await page.getByRole('button', { name: 'Восстановить черновик' }).click();
  await expect(page.getByText('Черновик · Версия 8', { exact: true })).toBeVisible();
  expect((await page.request.get(publicUrl)).status()).toBe(404);
  await page.locator('summary').filter({ hasText: 'Версия 8 ·' }).click();
  await page.getByRole('button', { name: 'Отозвать согласие для видео версии 8' }).click();
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(page.getByText('Черновик · Версия 9', { exact: true })).toBeVisible();
});
