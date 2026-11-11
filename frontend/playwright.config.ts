import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  globalTimeout: 5 * 60_000,
  reporter: [['./e2e/safeReporter.ts']],
  outputDir: '../.local-test-artifacts/playwright',
  preserveOutput: 'never',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    locale: 'ru-RU',
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
