import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './privacy',
  testMatch: '**/*.canary.ts',
  workers: 1,
  retries: 0,
  reporter: [['./safeReporter.ts']],
  outputDir: '../../.local-test-artifacts/browser-privacy',
  preserveOutput: 'always',
  use: { headless: true, screenshot: 'off', trace: 'off', video: 'off' },
});
