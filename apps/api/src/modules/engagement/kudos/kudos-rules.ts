import { addDays, weekStart, type DayString } from '../../growth-core/index.js';

export const FLAG_SUSPICIOUS = 'Suspicious exchange';
export const FLAG_CAP = 'Weekly received cap reached';

export interface KudosOutcome {
  /** XP the receiver gets: the rule amount, or 0 when over the weekly cap (never partial). */
  amount: number;
  flag: string | null;
  /** A mutual kudos starts HELD; everything else starts PENDING. */
  held: boolean;
}

/**
 * What a new kudos is worth. A mutual exchange is held and flagged "Suspicious exchange"; a
 * kudos that would take the receiver over the weekly cap is still created but pays 0 and is
 * flagged "Weekly received cap reached". Both at once: the flag is "Suspicious exchange".
 */
export function kudosOutcome(input: {
  baseAmount: number;
  /** XP the receiver already got from kudos this week (PENDING, HELD and AWARDED). */
  receivedThisWeek: number;
  weeklyCap: number;
  mutual: boolean;
}): KudosOutcome {
  const overCap = input.receivedThisWeek + input.baseAmount > input.weeklyCap;
  return {
    amount: overCap ? 0 : input.baseAmount,
    flag: input.mutual ? FLAG_SUSPICIOUS : overCap ? FLAG_CAP : null,
    held: input.mutual,
  };
}

/**
 * True when the sender must still wait before sending to the same person again. A kudos sent
 * exactly `cooldownDays` days ago no longer blocks (7 days later on the same weekday is fine).
 */
export function cooldownActive(lastSentOn: DayString | null, today: DayString, cooldownDays: number): boolean {
  if (lastSentOn === null || cooldownDays <= 0) {
    return false;
  }
  return lastSentOn > addDays(today, -cooldownDays);
}

/** Two days are in the same Monday-to-Sunday week. */
export function sameWeek(a: DayString, b: DayString): boolean {
  return weekStart(a) === weekStart(b);
}
