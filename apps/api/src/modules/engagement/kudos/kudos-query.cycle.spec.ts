import 'reflect-metadata';

// The kudos reader is imported by growth-core (IF-04), and the kudos reader must not import growth-core's
// index, or the files form a cycle: growth-core/index -> growth-core.module -> kudos-query.module ->
// kudos-query.service -> growth-core/index. The Nest module graph has no cycle, but a file cycle makes
// KudosQueryModule undefined when growth-core's @Module(...) runs, if the reader is loaded first.
// This test loads the reader FIRST, on purpose, and checks that growth-core still sees it.
//
// The first dynamic import loads the whole growth-core module graph cold. On a busy machine (a full
// `pnpm test` run on Windows) that can take longer than the default 5 s, so the tests get a longer limit.
// The limit only gives the import more time; it does not change what the test checks.
const COLD_IMPORT_TIMEOUT_MS = 30_000;

describe('kudos reader and growth-core load in any order (no file import cycle)', { timeout: COLD_IMPORT_TIMEOUT_MS }, () => {
  it('growth-core imports a defined KudosQueryModule even when the reader is loaded first', async () => {
    const { KudosQueryModule } = await import('./kudos-query.module.js');
    const { GrowthCoreModule } = await import('../../growth-core/growth-core.module.js');

    const imports = Reflect.getMetadata('imports', GrowthCoreModule) as unknown[];
    expect(KudosQueryModule).toBeDefined();
    expect(imports.every((m) => m !== undefined)).toBe(true);
    expect(imports).toContain(KudosQueryModule);
  });

  it('the kudos reader service is defined when its module is built', async () => {
    const { KudosQueryModule } = await import('./kudos-query.module.js');
    const { KudosQueryService } = await import('./kudos-query.service.js');

    const providers = Reflect.getMetadata('providers', KudosQueryModule) as unknown[];
    expect(KudosQueryService).toBeDefined();
    expect(providers).toEqual([KudosQueryService]);
  });
});
