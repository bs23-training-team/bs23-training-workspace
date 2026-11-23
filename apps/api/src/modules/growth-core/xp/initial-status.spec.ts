import { initialStatus } from './initial-status.js';

// PRD FR-GAM-01: new XP is pending until the PM reviews it, except quest XP (awarded when
// the PM verifies) and manual adjustments (the PM made them).

describe('initialStatus', () => {
  it('awards quest XP at once', () => {
    expect(initialStatus('QUEST')).toBe('AWARDED');
  });

  it('awards a manual adjustment at once', () => {
    expect(initialStatus('MANUAL_ADJUSTMENT')).toBe('AWARDED');
  });

  it.each(['ON_TIME_SPRINT', 'VERIFIED_MODULE', 'FINAL_ASSESSMENT', 'KUDOS'] as const)(
    'keeps %s pending until a PM reviews it',
    (source) => {
      expect(initialStatus(source)).toBe('PENDING');
    },
  );
});
