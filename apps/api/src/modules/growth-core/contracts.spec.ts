import type * as C from '@bs23/contracts';
import type { ActiveLevel } from './levels/level-set.js';
import type { FreezeForPm, FreezeForUser } from './streak/streak.service.js';
import type { AdjustResult } from './xp/xp-adjustment.service.js';
import type { MyGrowth, XpEventView } from './xp/xp-query.service.js';
import type { DecideResult } from './xp/xp-review.service.js';
import type { XpRulesAll } from './xp/xp-rules.types.js';

// The types in packages/contracts (growth-core) must describe what the routes really return. This file is checked by
// `pnpm typecheck`: if a service result and its contract type drift apart, it stops compiling.

/** true only when both types are exactly the same (same fields, same types). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** true when everything the API returns fits the contract type (the API may use a narrower type, for example a day string). */
type Fits<Api, Contract> = [Api] extends [Contract] ? true : false;

// Every entry must be `true`: a `false` is a compile error.
const checks: [
  Same<XpEventView, C.XpEventView>,
  Same<MyGrowth, C.MyGrowth>,
  Same<DecideResult, C.DecideXpResponse>,
  Same<AdjustResult, C.AdjustXpResponse>,
  Same<XpRulesAll, C.XpRules>,
  Same<ActiveLevel, C.Level>,
  Fits<FreezeForPm, C.PmStreakFreeze>,
  Fits<FreezeForUser, C.MyStreakFreeze>,
  Fits<C.PmStreakFreeze, FreezeForPm>,
  Fits<C.MyStreakFreeze, FreezeForUser>,
] = [true, true, true, true, true, true, true, true, true, true];

describe('growth-core contract types match the services', () => {
  it('every response type in packages/contracts equals or fits the service result (compile-time)', () => {
    expect(checks.every(Boolean)).toBe(true);
  });
});
