import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Engagement may only change XP through growth-core's exported services (IF-01 to IF-03).
// This guard fails if any engagement source file touches the XpEvent or Level tables directly.

const root = dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    const isTest = /\.(spec|e2e-spec)\.ts$/.test(name) || path.includes(`${join('engagement', 'testing')}`);
    return name.endsWith('.ts') && !isTest ? [path] : [];
  });
}

describe('engagement module boundaries', () => {
  const files = sourceFiles(root);

  it('finds the engagement source files', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(['xpEvent', 'xpReview', 'level', 'xpRule'])('no engagement source file reads or writes the %s table directly', (table) => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(new RegExp(`\\.${table}\\.(find|create|update|delete|upsert|aggregate|groupBy|count)`));
    }
  });

  it('only imports growth-core through its public index', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const deep = text.match(/from '[./]*growth-core\/(?!index\.js)[^']*'/g);
      expect(deep, file).toBeNull();
    }
  });
});
