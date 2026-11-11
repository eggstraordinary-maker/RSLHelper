import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

export function violation(source, target) {
  const from = source.replaceAll('\\', '/').split('/');
  const to = target.replaceAll('\\', '/').split('/');
  const targetFeature = to[0] === 'features' ? to[1] : null;
  if (['shared', 'entities'].includes(from[0]) && ['features', 'pages', 'App.tsx', 'main.tsx'].includes(to[0])) return true;
  if (from[0] === 'features' && ['pages', 'App.tsx', 'main.tsx'].includes(to[0])) return true;
  return Boolean(targetFeature && !(from[0] === 'features' && from[1] === targetFeature)
    && to.slice(2).join('/') !== 'index.ts');
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

export function check(root) {
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  const src = path.join(root, 'src');
  let failed = 0;
  for (const file of files(src)) {
    const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : null;
      if (specifier && ts.isStringLiteral(specifier)) {
        const resolved = ts.resolveModuleName(specifier.text, file, options, ts.sys).resolvedModule?.resolvedFileName;
        const relative = resolved ? path.relative(src, resolved) : null;
        if (relative && !path.isAbsolute(relative) && !relative.startsWith('..' + path.sep)
            && violation(path.relative(src, file), relative)) {
          console.error(`Forbidden module dependency: ${path.relative(src, file)} -> ${path.relative(src, resolved)}`);
          failed += 1;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return failed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failed = check(path.resolve('.'));
  if (failed) process.exitCode = 1; else console.log('Frontend module boundaries verified');
}
