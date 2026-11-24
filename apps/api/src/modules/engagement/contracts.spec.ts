import type * as C from '@bs23/contracts';
import type { KudosController } from './kudos.controller.js';
import type { KudosLimits } from './kudos/kudos-limits.service.js';
import type { KudosQueryService, KudosView, PmKudosView } from './kudos/kudos-query.service.js';
import type { PeerRow, PmRow } from './leaderboard/leaderboard-rank.js';
import type { ProgressView, QuestView, VerifyResult } from './quests/quests.service.js';

// The types in packages/contracts (engagement) must describe what the routes really return. This file is checked by
// `pnpm typecheck`: if a service result and its contract type drift apart, it stops compiling.

/** true only when both types are exactly the same (same fields, same types). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** true when everything the API returns fits the contract type (the API may use a narrower type, for example a day string). */
type Fits<Api, Contract> = [Api] extends [Contract] ? true : false;

// Every entry must be `true`: a `false` is a compile error.
const checks: [
  Same<PeerRow, C.PeerLeaderboardRow>,
  Same<PmRow, C.PmLeaderboardRow>,
  Fits<QuestView, C.QuestView>,
  Fits<C.QuestView, QuestView>,
  Fits<ProgressView, C.QuestProgressView>,
  Fits<C.QuestProgressView, ProgressView>,
  Same<VerifyResult, C.VerifyQuestResponse>,
  // Privacy: a user's kudos has no `suspicious` flag, a PM's has it; the sender of a kudos only gets its id.
  Same<KudosView, C.KudosView>,
  Same<PmKudosView, C.PmKudosView>,
  Same<Awaited<ReturnType<KudosQueryService['page']>>['kudos'], C.KudosView[] | C.PmKudosView[]>,
  Same<Awaited<ReturnType<KudosController['send']>>, C.SendKudosResponse>,
  Same<KudosLimits, C.KudosLimits>,
] = [true, true, true, true, true, true, true, true, true, true, true, true];

describe('engagement contract types match the services', () => {
  it('every response type in packages/contracts equals or fits the service result (compile-time)', () => {
    expect(checks.every(Boolean)).toBe(true);
  });
});
