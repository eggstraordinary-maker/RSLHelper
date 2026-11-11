import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import openapiTS, { astToString } from 'openapi-typescript';
import { URL } from 'node:url';

const schema = new URL('../../.local-test-artifacts/openapi.json', import.meta.url);
const target = new URL('../src/types/openapi.d.ts', import.meta.url);
const content = '// Generated from FastAPI OpenAPI. Run npm run api:generate.\n' + astToString(await openapiTS(schema));
if (process.argv.includes('--check')) {
  if (!existsSync(target) || readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== content) {
    console.error('OpenAPI types drifted. Export the backend schema and run npm run api:generate.');
    process.exitCode = 1;
  } else console.log('OpenAPI DTO types match the current backend');
} else {
  writeFileSync(target, content);
  console.log('OpenAPI DTO types generated');
}
