// The public surface of growth-core. Other modules (engagement) import from here only, never
// from a deeper file, so growth-core can reorganise its insides freely.

export { GrowthCoreModule } from './growth-core.module.js';
export { GrowthError } from './errors.js';
export { lockUser } from './locks.js';

// IF-01: the XP ledger. IF-03: XP rules. IF-02: levels.
export { XpLedgerService } from './xp/xp-ledger.service.js';
export type { CreateEventResult, NewXpEvent, SumXpQuery, XpLedger } from './xp/xp-ledger.types.js';
export { XpRulesService } from './xp/xp-rules.service.js';
export type { XpRulesAll } from './xp/xp-rules.types.js';
export { kudosKey, questKey } from './xp/xp-keys.js';
export { LEVELS, type LevelsPort } from './ports/levels.port.js';
export type { Db, Tx } from './ports/db.js';
export type { ActiveLevel } from './levels/level-set.js';

// The reward core other squads CALL (sprint, learning, assessment report a fact; growth-core decides
// the amount, the day and the key) and the streak refresh.
export { RewardService, type RewardOutcome, type RewardSkipReason } from './xp/reward.service.js';
export { StreakService } from './streak/streak.service.js';
// Re-checks streaks and automatic badges. Sprint (E06) calls afterSprint once its sprint is saved;
// the platform scheduler calls nightly at the day change.
export { GrowthTriggersService, type NightlyResult } from './triggers/growth-triggers.service.js';
// The read side for screens (a user's growth, a PM's review queue): the snapshot facade (IF-07) composes it.
export { XpQueryService, type MyGrowth, type XpEventView } from './xp/xp-query.service.js';
// Which users a PM may READ (the directory's rule, FR-GRW-59): other modules' PM lists use the same one.
export { pmVisibleUsers } from './visibility/pm-visible-users.js';

// Ports other squads IMPLEMENT or are called through: IF-06 (sprint and calendar sources, E06/E07)
// and IF-05 (the notice layer, E01). Provide a class under the token to replace the default.
export { SPRINT_SOURCE, type SprintSourcePort, type SprintSubmissionFact } from './ports/sprint-source.port.js';
export { CALENDAR_SOURCE, type CalendarSourcePort } from './ports/calendar-source.port.js';
export { NOTIFICATIONS, type GrowthNoticeCategory, type NoticeInput, type NotificationPort } from './ports/notification.port.js';

// IF-04 (engagement provides it): the badge rule KUDOS_DISTINCT_SENDERS reads kudos through it.
export { KUDOS, type KudosPort } from './ports/kudos.port.js';

// One definition of org time (Dhaka, Monday weeks) and of "now".
export { CLOCK, systemClock, type ClockPort } from './time/clock.port.js';
export { addDays, isWeekend, orgToday, parseDay, weekEnd, weekStart, type DayString } from './time/org-time.js';

// Shared HTTP building blocks (the caller, the guard, the error filter, request readers) and paging.
export { MAX_PAGE, paginate, parseCursor } from './paging.js';
export { actorFromRequestUser, pmIdOf, userIdOf, type Actor, type RequestUser, type RequestWithActor, type Role } from './http/actor.js';
export { ActorGuard, CurrentActor, GamificationHttp, Roles } from './http/actor.guard.js';
export { GrowthErrorFilter } from './http/growth-error.filter.js';
export { bodyOf, bool, list, num, oneOf, optNum, optStr, query, str, type Body } from './http/parse.js';
