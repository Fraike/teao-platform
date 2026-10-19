// Node 24+: node --import ./test/standard-frontend-loader.js --test test/standard-input.test.ts test/standard-table.test.ts test/standard-page.test.ts
// Optional external jsdom: FRONTEND_TEST_DEPS=/path/to/node_modules (leaves repository dependencies untouched).
import { registerHooks, createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const extra = process.env.FRONTEND_TEST_DEPS;
const requireExtra = extra ? createRequire(`${extra}/package.json`) : null;
const jsdomUrl = requireExtra ? pathToFileURL(requireExtra.resolve('jsdom')).href : import.meta.resolve('jsdom');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'jsdom') {
      return { url: jsdomUrl, shortCircuit: true };
    }
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/')) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/.test(url.pathname)) {
        for (const suffix of ['.ts', '.tsx']) {
          if (existsSync(fileURLToPath(url) + suffix)) return { url: url.href + suffix, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.module.css')) return { format: 'module', source: 'export default new Proxy({}, {get: (_, key) => key});', shortCircuit: true };
    if (/\.(ts|tsx)$/.test(url)) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX }, fileName: fileURLToPath(url),
      }).outputText;
      return { format: 'module', source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
