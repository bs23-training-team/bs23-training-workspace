import { isAllowedMove } from './review-moves.js';

// PRD FR-GAM-02 / SRS FR-GRW-15:
//   PENDING -> AWARDED | HELD | REJECTED
//   HELD    -> AWARDED | REJECTED
//   AWARDED -> REVERSED
//   REJECTED and REVERSED are final.

describe('isAllowedMove', () => {
  it.each([
    ['PENDING', 'AWARDED'],
    ['PENDING', 'HELD'],
    ['PENDING', 'REJECTED'],
    ['HELD', 'AWARDED'],
    ['HELD', 'REJECTED'],
    ['AWARDED', 'REVERSED'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(isAllowedMove(from, to)).toBe(true);
  });

  it.each([
    ['PENDING', 'REVERSED'], // only awarded XP can be reversed
    ['PENDING', 'PENDING'],
    ['HELD', 'HELD'],
    ['HELD', 'REVERSED'],
    ['HELD', 'PENDING'],
    ['AWARDED', 'AWARDED'],
    ['AWARDED', 'HELD'],
    ['AWARDED', 'REJECTED'],
    ['AWARDED', 'PENDING'],
    ['REJECTED', 'AWARDED'], // final
    ['REJECTED', 'HELD'],
    ['REJECTED', 'REVERSED'],
    ['REVERSED', 'AWARDED'], // final
    ['REVERSED', 'REJECTED'],
  ] as const)('refuses %s -> %s', (from, to) => {
    expect(isAllowedMove(from, to)).toBe(false);
  });
});
