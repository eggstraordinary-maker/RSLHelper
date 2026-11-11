import { test as base, expect } from '@playwright/test';

// In the pinned Playwright build this disables page snapshots used in
// error-context.md. The canary failure test guards this implementation detail.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

export const test = base.extend<{ _privateFailure: void }>({
  _privateFailure: [async ({ context }, use, testInfo) => {
    // Depend on context so teardown runs before context/artifact teardown.
    void context;
    try {
      await use();
    } finally {
      // Preserve error count and failure status. No error payload is persisted.
      for (let index = 0; index < testInfo.errors.length; index += 1) {
        testInfo.errors[index] = { message: 'Browser check failed; private details suppressed' };
      }
    }
  }, { auto: true }],
});

export { expect };
export type { APIRequestContext, Page } from '@playwright/test';
