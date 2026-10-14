import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  reporter: 'list',
  outputDir: '../.local-test-artifacts/playwright',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    locale: 'ru-RU',
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
    screenshot: 'only-on-failure',
  },
});
