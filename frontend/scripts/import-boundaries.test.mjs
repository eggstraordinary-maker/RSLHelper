import { test } from 'node:test';
import assert from 'node:assert/strict';
import { violation, check } from './import-boundaries.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('pages and other features use public entry points', () => {
  assert.equal(violation('pages/Dictionary.tsx', 'features/catalog/index.ts'), false);
  assert.equal(violation('pages/Dictionary.tsx', 'features/catalog/private.ts'), true);
  assert.equal(violation('features/learning/api.ts', 'features/catalog/private.ts'), true);
  assert.equal(violation('features/catalog/ui.tsx', 'features/catalog/private.ts'), false);
});
test('lower layers do not import screens or features', () => {
  assert.equal(violation('features/auth/ui.tsx', 'pages/Profile.tsx'), true);
  assert.equal(violation('shared/client.ts', 'features/auth/index.ts'), true);
  assert.equal(violation('entities/user.ts', 'pages/Profile.tsx'), true);
  assert.equal(violation('features/auth/api.ts', 'shared/client.ts'), false);
});

test('resolver checks aliases and literal dynamic imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'rsl-imports-'));
  try {
    mkdirSync(join(root, 'src/features/auth'), { recursive: true });
    mkdirSync(join(root, 'src/pages'), { recursive: true });
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      moduleResolution: 'bundler', module: 'esnext', paths: { '@/*': ['./src/*'] } } }));
    writeFileSync(join(root, 'src/features/auth/index.ts'), 'export {};');
    writeFileSync(join(root, 'src/features/auth/private.ts'), 'export {};');
    const page = join(root, 'src/pages/Login.ts');
    writeFileSync(page, "import '@/features/auth';");
    assert.equal(check(root), 0);
    writeFileSync(page, "import('@/features/auth/private');");
    assert.equal(check(root), 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
