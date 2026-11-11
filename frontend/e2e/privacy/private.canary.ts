import { test } from '../safeTest';
import { writeFileSync } from 'node:fs';

test('controlled failure', async ({ page }) => {
  const sentinel = process.env.RSL_REPORTER_CANARY;
  if (!sentinel) throw new Error('Canary setup missing');
  await page.setContent('<input type="password" aria-label="Password"/>');
  await page.getByLabel('Password').fill(sentinel);
  writeFileSync('../.local-test-artifacts/browser-canary-entered', 'entered');
  console.log(sentinel);
  console.error(sentinel);
  throw new Error('Intentionally private failure: ' + sentinel);
});
