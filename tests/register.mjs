import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
registerHooks({
 resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL) {
   const url = new URL(specifier, context.parentURL);
   if (!url.pathname.endsWith('.ts') && existsSync(fileURLToPath(url) + '.ts')) return { url: url.href + '.ts', shortCircuit: true };
  }
  return next(specifier, context);
 },
 load(url, context, next) {
  if (url.endsWith('.ts')) return { format: 'module', source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, shortCircuit: true };
  return next(url, context);
 }
});
