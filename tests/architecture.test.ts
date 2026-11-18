import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));
const sources = ts.sys.readDirectory(sourceRoot, ['.ts', '.tsx']).map(path => resolve(path));
const files = new Set(sources);
const runtimeDependencies = new Map<string, string[]>();
const imports: Array<{ file: string; specifier: string; target?: string }> = [];

for (const file of sources) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const runtime: string[] = [];
  runtimeDependencies.set(file, runtime);

  const addImport = (specifier: string, typeOnly: boolean) => {
    const absolute = resolve(dirname(file), specifier);
    const target = specifier.startsWith('.')
      ? [absolute, `${absolute}.ts`, `${absolute}.tsx`].find(candidate => files.has(candidate))
      : undefined;
    imports.push({ file, specifier, target });
    if (target && !typeOnly) runtime.push(target);
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const { importClause } = node;
      const named = importClause?.namedBindings;
      const typeOnly = importClause?.isTypeOnly || Boolean(!importClause?.name && named
        && ts.isNamedImports(named) && named.elements.length && named.elements.every(item => item.isTypeOnly));
      addImport(node.moduleSpecifier.text, typeOnly);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      addImport(node.moduleSpecifier.text, node.isTypeOnly);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) addImport(argument.text, false);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      addImport(node.argument.literal.text, true);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const relativeFile = (file: string) => relative(sourceRoot, file).split(sep).join('/');

test('domain and application stay independent of UI and infrastructure', () => {
  const invalid = imports.filter(({ file, target }) => {
    const area = relativeFile(file).split('/')[0];
    const dependency = target && relativeFile(target).split('/')[0];
    if (area === 'domain') return dependency !== 'domain';
    if (area === 'application') return dependency !== 'domain' && dependency !== 'application';
    return false;
  });
  assert.deepEqual(invalid.map(({ file, specifier }) => `${relativeFile(file)} -> ${specifier}`), []);
});

test('presentation accesses external services through application contracts', () => {
  const invalid = imports.filter(({ file, specifier, target }) => relativeFile(file).startsWith('presentation/')
    && (specifier === '@supabase/supabase-js' || specifier === '@google/genai'
      || Boolean(target && /^infrastructure\/(?!browser\/)/.test(relativeFile(target)))));
  assert.deepEqual(invalid.map(({ file, specifier }) => `${relativeFile(file)} -> ${specifier}`), []);
});

test('production modules have no runtime dependency cycles', () => {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (file: string) => {
    if (visited.has(file)) return;
    assert.ok(!visiting.has(file), [...visiting, file].map(relativeFile).join(' -> '));
    visiting.add(file);
    for (const dependency of runtimeDependencies.get(file) || []) visit(dependency);
    visiting.delete(file);
    visited.add(file);
  };
  sources.forEach(visit);
});
