import {
  finalAssessmentKey,
  kudosKey,
  manualKey,
  moduleKey,
  questKey,
  sprintKey,
} from './xp-keys.js';

// A key makes awarding idempotent: XpEvent is unique on (workspaceId, key),
// so the same fact reported twice must always produce the same key.

describe('XP event keys', () => {
  it('builds the sprint key from the trainee and the day', () => {
    expect(sprintKey('BS23001', '2026-11-18')).toBe('sprint:BS23001:2026-11-18');
  });

  it('builds the verified-module key from the trainee and the topic', () => {
    expect(moduleKey('BS23001', 'topic-1')).toBe('module:BS23001:topic-1');
  });

  it('builds the final-assessment key from the trainee and the question set', () => {
    expect(finalAssessmentKey('BS23001', 'set-9')).toBe('final:BS23001:set-9');
  });

  it('builds the kudos key from the kudos id only', () => {
    expect(kudosKey('k-1')).toBe('kudos:k-1');
  });

  it('builds the quest key from the quest then the trainee', () => {
    expect(questKey('q-1', 'BS23002')).toBe('quest:q-1:BS23002');
  });

  it('builds the manual-adjustment key from a uuid', () => {
    const id = '3f2b8c1e-9d4a-4e6b-8a1c-0b7d5e2f9a10';
    expect(manualKey(id)).toBe(`manual:${id}`);
  });

  it('gives the same key for the same fact reported twice', () => {
    expect(sprintKey('BS23001', '2026-11-18')).toBe(sprintKey('BS23001', '2026-11-18'));
  });

  it('gives different keys for different days, people or sources', () => {
    expect(sprintKey('BS23001', '2026-11-18')).not.toBe(sprintKey('BS23001', '2026-11-19'));
    expect(sprintKey('BS23001', '2026-11-18')).not.toBe(sprintKey('BS23002', '2026-11-18'));
    expect(moduleKey('BS23001', 'x')).not.toBe(finalAssessmentKey('BS23001', 'x'));
  });

  it('rejects an invalid sprint day', () => {
    expect(() => sprintKey('BS23001', '2026-02-30')).toThrow();
    expect(() => sprintKey('BS23001', '18-11-2026')).toThrow();
  });

  it('rejects an empty segment', () => {
    expect(() => sprintKey('', '2026-11-18')).toThrow();
    expect(() => moduleKey('BS23001', '  ')).toThrow();
    expect(() => kudosKey('')).toThrow();
    expect(() => questKey('q-1', '')).toThrow();
  });

  it('rejects a segment that contains the ":" separator', () => {
    // "a:b" + "c" and "a" + "b:c" would otherwise collide.
    expect(() => moduleKey('a:b', 'c')).toThrow();
    expect(() => moduleKey('a', 'b:c')).toThrow();
  });

  it('rejects a manual key that is not a uuid', () => {
    expect(() => manualKey('not-a-uuid')).toThrow();
    expect(() => manualKey('')).toThrow();
  });
});
