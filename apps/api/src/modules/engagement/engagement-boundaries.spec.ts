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

  // The one exception: the kudos reader is imported BY growth-core (IF-04), so it cannot import growth-core's
  // index (that would be a file import cycle). It may import only these growth-core leaf files.
  const isKudosReader = (file: string) => /kudos[\\/]kudos-query\.(service|module)\.ts$/.test(file);
  const LEAF_FILES_FOR_KUDOS_READER = ['growth-core/paging.js', 'growth-core/ports/db.js', 'growth-core/ports/kudos.port.js'];

  it('only imports growth-core through its public index (except the kudos reader, see below)', () => {
    for (const file of files.filter((f) => !isKudosReader(f))) {
      const text = readFileSync(file, 'utf8');
      const deep = text.match(/from '[./]*growth-core\/(?!index\.js)[^']*'/g);
      expect(deep, file).toBeNull();
    }
  });

  it('the kudos reader never imports growth-core/index (file cycle) and only a short list of leaf files', () => {
    const readers = files.filter(isKudosReader);
    expect(readers.length).toBe(2);
    for (const file of readers) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/from '[./]*growth-core\/index\.js'/);
      for (const m of text.matchAll(/from '[./]*(growth-core\/[^']*)'/g)) {
        expect(LEAF_FILES_FOR_KUDOS_READER, `${file} imports ${m[1]}`).toContain(m[1]);
      }
    }
  });
});
