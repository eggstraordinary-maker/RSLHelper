import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

test('SeaweedFS console requires login and lists the S3 bucket', async ({ page }) => {
  const env = Object.fromEntries(readFileSync(resolve('../seaweedfs/.env.admin'), 'utf8').split(/\r?\n/)
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
  await page.goto('http://localhost:23646/');
  await expect(page).toHaveURL(/\/login/);
  await page.locator('[name="username"]').fill(env.WEED_ADMIN_USER);
  await page.locator('[name="password"]').fill(env.WEED_ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.locator('a[href*="object-store/buckets"]').first().click();
  const bucket = page.locator('a[href="/files?path=/buckets/videos"]').first();
  await expect(bucket).toBeVisible();
  await bucket.click();
  await expect(page).toHaveURL(/\/files\?path=\/buckets\/videos/);
  const fixture = JSON.parse(readFileSync(resolve('../.local-test-artifacts/e2e-fixture.json'), 'utf8')) as { run_id: string };
  await expect(page.getByRole('cell', { name: new RegExp(`e2e-${fixture.run_id}`) }).first()).toBeVisible();
});
