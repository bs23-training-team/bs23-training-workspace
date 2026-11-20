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

// IF-04 (engagement provides it): the badge rule KUDOS_DISTINCT_SENDERS reads kudos through it.
export { KUDOS, type KudosPort } from './ports/kudos.port.js';

// One definition of org time (Dhaka, Monday weeks) and of "now".
export { CLOCK, systemClock, type ClockPort } from './time/clock.port.js';
export { addDays, isWeekend, orgToday, parseDay, weekEnd, weekStart, type DayString } from './time/org-time.js';
