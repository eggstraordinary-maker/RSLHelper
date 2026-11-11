import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult,
} from '@playwright/test/reporter';

type SafeCase = {
  id: number;
  file: string;
  line: number;
  status: TestResult['status'];
  expected: boolean;
  retry: number;
  duration_ms: number;
};

/** No error text, steps, stdout, request metadata or attachment is published. */
export default class SafeReporter implements Reporter {
  private readonly ids = new Map<TestCase, number>();
  private readonly latest = new Map<TestCase, SafeCase>();
  private runtimeErrors = 0;
  private reportPath = '';

  printsToStdio(): boolean { return true; }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.ids.clear();
    this.latest.clear();
    this.runtimeErrors = 0;
    suite.allTests().forEach((test, index) => this.ids.set(test, index + 1));
    this.reportPath = resolve(process.cwd(), '../.local-test-artifacts/browser-e2e-summary.json');
    process.stdout.write(`Browser checks discovered: ${this.ids.size}\n`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const name = basename(test.location.file);
    const item: SafeCase = {
      id: this.ids.get(test) ?? 0,
      file: /^[a-z0-9_-]+\.e2e\.ts$/i.test(name) ? name : 'browser-check',
      line: Math.max(0, Math.trunc(test.location.line)),
      status: result.status,
      expected: result.status === test.expectedStatus || result.status === 'skipped',
      retry: Math.max(0, Math.trunc(result.retry)),
      duration_ms: Math.max(0, Math.trunc(result.duration)),
    };
    this.latest.set(test, item);
    process.stdout.write(`Browser check ${item.id}: ${item.status}\n`);
  }

  onError(): void {
    this.runtimeErrors += 1;
    process.stdout.write('Browser runner error; private details suppressed\n');
  }

  onStdOut(): void { /* Worker output can contain credentials. */ }
  onStdErr(): void { /* Worker output can contain credentials. */ }

  async onEnd(result: FullResult): Promise<{ status: FullResult['status'] }> {
    const cases = [...this.latest.values()].sort((left, right) => left.id - right.id);
    const status = this.runtimeErrors > 0 && result.status === 'passed' ? 'failed' : result.status;
    const summary = {
      schema_version: 1,
      status,
      discovered: this.ids.size,
      finished: cases.length,
      passed: cases.filter(item => item.status === 'passed').length,
      skipped: cases.filter(item => item.status === 'skipped').length,
      unexpected: cases.filter(item => !item.expected).length,
      runner_errors: this.runtimeErrors,
      cases,
    };
    try {
      mkdirSync(resolve(this.reportPath, '..'), { recursive: true });
      writeFileSync(this.reportPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
      process.stdout.write(`Browser result: ${status}; passed=${summary.passed}; unexpected=${summary.unexpected}\n`);
      return { status };
    } catch {
      // Reporter exceptions are otherwise swallowed by Playwright.
      process.stdout.write('Browser report could not be saved\n');
      return { status: 'failed' };
    }
  }
}
