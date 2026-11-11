import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const directory = resolve('../.local-test-artifacts/browser-privacy');
const summary = resolve('../.local-test-artifacts/browser-e2e-summary.json');
const entered = resolve('../.local-test-artifacts/browser-canary-entered');
const sentinel = `private-canary-${randomUUID()}`;
rmSync(directory, { recursive: true, force: true });
rmSync(summary, { force: true });
rmSync(entered, { force: true });
const child = spawnSync(process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', '--config=e2e/privacy.config.ts'],
  { encoding: 'utf8', env: { ...process.env, RSL_REPORTER_CANARY: sentinel } });
const files = [];
function walk(path) {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) walk(file); else files.push(file);
  }
}
walk(directory);
if (existsSync(summary)) files.push(summary);
const leaked = [child.stdout ?? '', child.stderr ?? '', ...files.map(file => readFileSync(file).toString())]
  .some(value => value.includes(sentinel));
const result = existsSync(summary) ? JSON.parse(readFileSync(summary, 'utf8')) : null;
if (child.status !== 1 || !existsSync(entered) || leaked || result?.unexpected !== 1 || result?.status !== 'failed') {
  console.error('Browser privacy regression failed');
  process.exitCode = 1;
} else {
  console.log('Controlled browser failure stays nonzero and produces no private payload');
}
rmSync(directory, { recursive: true, force: true });
rmSync(summary, { force: true });
rmSync(entered, { force: true });
