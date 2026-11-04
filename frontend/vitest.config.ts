import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**', 'e2e/**'],
      reporter: ['text', 'json-summary', 'lcov', 'html'],
      reportsDirectory: '../.local-test-artifacts/coverage/frontend',
    },
  },
}));
