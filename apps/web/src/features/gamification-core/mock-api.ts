"use client";

import { type Badge, type BadgeRuleType, type DB, type XpEvent, type XpRules, type Level } from "@/lib/mock/types";
import { todayISO, addDays, isWeekend, uid } from "@/lib/utils";
import { Result, fail, notify, ok } from "@/lib/mock/core";
import { getDB, mutate } from "@/lib/mock/store";
import { inScope } from "@/lib/mock/selectors";


export function xpTotal(db: DB, traineeUserId: string, since?: string) {
  return db.xpEvents
    .filter((e) => e.traineeUserId === traineeUserId && e.status === "AWARDED" && (!since || e.date >= since))
    .reduce((s, e) => s + e.amount, 0);
}

export function levelFor(db: DB, xp: number) {
  const sorted = [...db.levels].sort((a, b) => a.minXp - b.minXp);
  let idx = 0;
  sorted.forEach((l, i) => {
    if (xp >= l.minXp) idx = i;
  });
  const next = sorted[idx + 1];
  return { level: sorted[idx], next, progress: next ? Math.round(((xp - sorted[idx].minXp) / (next.minXp - sorted[idx].minXp)) * 100) : 100 };
}

/** Consecutive working days with a sprint submission; leave/holiday freezes keep the streak (FR-GAM-05). */
/** Working-day streak of sprint submissions. `onTimeOnly` counts only submissions made before the cutoff. */
function sprintStreak(db: DB, traineeUserId: string, onTimeOnly: boolean) {
  const subs = new Set(db.sprintSubmissions.filter((s) => s.traineeUserId === traineeUserId && (!onTimeOnly || s.onTime)).map((s) => s.date));
  const frozen = new Set(db.streakFreezes.filter((s) => s.traineeUserId === traineeUserId).map((s) => s.date));
  let d = todayISO();
  if (!subs.has(d)) d = addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 120; i++) {
    if (isWeekend(d) || frozen.has(d)) {
      d = addDays(d, -1);
      continue;
    }
    if (!subs.has(d)) break;
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export const streakOf = (db: DB, traineeUserId: string) => sprintStreak(db, traineeUserId, false);

export function addXp(d: DB, e: Omit<XpEvent, "id">) {
  if (d.xpEvents.some((x) => x.key === e.key)) return; // idempotent by unique key (FR-GAM-04)
  d.xpEvents.push({ id: uid("xp"), ...e });
}

export function reviewXp(pmId: string, id: string, status: "AWARDED" | "HELD" | "REJECTED" | "REVERSED", reason: string): Result {
  if (!reason.trim()) return fail("A reason is required.");
  const db = getDB();
  const ev = db.xpEvents.find((e) => e.id === id);
  if (!ev) return fail("This XP event no longer exists.");
  if (!inScope(db, pmId, ev.traineeUserId)) return fail("This user is not in your scope.");
  if (ev.status === status) return fail(`This XP is already ${status.toLowerCase()}.`);
  if (status === "REVERSED" && ev.status !== "AWARDED") return fail("Only awarded XP can be reversed.");
  if (status !== "REVERSED" && (ev.status === "REJECTED" || ev.status === "REVERSED")) return fail("This XP was already decided.");
  const before = xpTotal(db, db.xpEvents.find((e) => e.id === id)!.traineeUserId);
  mutate((d) => {
    const e = d.xpEvents.find((x) => x.id === id)!;
    e.status = status;
    e.reason = reason.trim();
    notify(d, e.traineeUserId, "XP decisions", `XP ${status.toLowerCase()}`, `${e.source} (${e.amount} XP): ${reason.trim()}`, "/trainee/gamification");
    const lvBefore = levelFor(d, before).level.name;
    const lvAfter = levelFor(d, xpTotal(d, e.traineeUserId)).level.name;
    if (lvAfter !== lvBefore && status === "AWARDED") notify(d, e.traineeUserId, "Level up", "Level up!", `You reached ${lvAfter}.`, "/trainee/gamification");
  });
  return ok();
}

export function adjustXp(pmId: string, traineeUserId: string, amount: number, reason: string): Result {
  if (!reason.trim()) return fail("A reason is required.");
  if (!inScope(getDB(), pmId, traineeUserId)) return fail("This user is not in your scope.");
  if (!amount) return fail("Enter a non-zero amount.");
  const total = xpTotal(getDB(), traineeUserId);
  if (total + amount < 0) return fail("Adjustment cannot reduce total XP below zero");
  mutate((d) => {
    const key = `manual:${uid("m")}`;
    d.xpEvents.push({ id: uid("xp"), traineeUserId, source: "Manual adjustment", amount, status: "AWARDED", key, evidence: "PM adjustment", reason: reason.trim(), date: todayISO() });
  });
  return ok();
}

export function updateXpRules(pmId: string, rules: XpRules): Result {
  if (Object.entries(rules).some(([k, v]) => k !== "sprintCutoff" && (typeof v !== "number" || v < 0))) return fail("Rule values must be zero or more.");
  if (!/^\d{2}:\d{2}$/.test(rules.sprintCutoff)) return fail("Cutoff must be HH:MM.");
  mutate((d) => {
    d.xpRules = rules;
  });
  return ok();
}

export function updateLevels(pmId: string, levels: Level[]): Result {
  if (!levels.length || levels[0].minXp !== 0) return fail("Thresholds must start at 0.");
  for (let i = 1; i < levels.length; i++) if (levels[i].minXp <= levels[i - 1].minXp) return fail("Thresholds must increase.");
  if (levels.some((l) => !l.name.trim())) return fail("Every level needs a name.");
  mutate((d) => {
    d.levels = levels;
  });
  return ok();
}

export function grantStreakFreeze(pmId: string, traineeUserId: string, date: string, source: "LEAVE" | "HOLIDAY", reason: string): Result {
  if (!date || !reason.trim()) return fail("Date and reason are required.");
  if (!inScope(getDB(), pmId, traineeUserId)) return fail("This user is not in your scope.");
  mutate((d) => {
    d.streakFreezes.push({ traineeUserId, date, source, reason: reason.trim() });
  });
  return ok();
}

export const BADGE_RULE_LABEL: Record<BadgeRuleType, string> = {
  ON_TIME_SPRINT_STREAK: "On-time sprint streak (days)",
  SPRINT_STREAK: "Sprint streak (days)",
  KUDOS_DISTINCT_SENDERS: "Kudos from different people",
};

/** Where a user stands on a badge's rule, in the rule's own unit. Manual badges have none. */
export function badgeRuleValue(db: DB, badge: Badge, traineeUserId: string): number | null {
  switch (badge.rule?.type) {
    case "ON_TIME_SPRINT_STREAK":
      return sprintStreak(db, traineeUserId, true);
    case "SPRINT_STREAK":
      return sprintStreak(db, traineeUserId, false);
    case "KUDOS_DISTINCT_SENDERS":
      return new Set(db.kudos.filter((k) => k.toId === traineeUserId && !k.suspicious).map((k) => k.fromId)).size;
    default:
      return null;
  }
}

/** The award a user holds for a badge, revoked or not. A user earns a badge once. */
export const awardOf = (db: DB, badgeId: string, traineeUserId: string) => db.badgeAwards.find((a) => a.badgeId === badgeId && a.traineeUserId === traineeUserId);

/**
 * Awards every automatic badge whose rule the user now meets. Runs inside the same mutation as the event
 * that may have changed the count (a sprint submission, kudos). A revoked award is never given again, and
 * an automatic award has no awarding PM.
 */
export function runBadgeRules(d: DB, traineeUserId: string) {
  for (const b of d.badges) {
    if (!b.rule || b.retiredAt || awardOf(d, b.id, traineeUserId)) continue;
    const value = badgeRuleValue(d, b, traineeUserId);
    if (value == null || value < b.rule.threshold) continue;
    d.badgeAwards.push({ badgeId: b.id, traineeUserId, evidence: `${BADGE_RULE_LABEL[b.rule.type]}: ${value} (needs ${b.rule.threshold})`, source: "AUTOMATIC", awardedAt: todayISO() });
    notify(d, traineeUserId, "Badge", "New badge", `You earned ${b.name}.`, "/trainee/gamification");
  }
}

/** A PM awards a MANUAL badge once. Automatic and retired badges cannot be awarded by hand. */
export function awardBadge(pmId: string, badgeId: string, traineeUserId: string, evidence: string): Result {
  const db = getDB();
  if (!inScope(db, pmId, traineeUserId)) return fail("This user is not in your scope.");
  const badge = db.badges.find((b) => b.id === badgeId);
  if (!badge) return fail("Badge not found.");
  if (badge.rule) return fail("This badge is awarded automatically when the rule is met.");
  if (badge.retiredAt) return fail("This badge is retired and cannot be awarded.");
  const held = awardOf(db, badgeId, traineeUserId);
  if (held) return fail(held.revokedAt ? "This badge was revoked for this user and is not awarded again." : "This badge is already earned.");
  if (!evidence.trim()) return fail("Add the evidence for this badge.");
  mutate((d) => {
    d.badgeAwards.push({ badgeId, traineeUserId, evidence: evidence.trim(), source: "MANUAL", awardedBy: pmId, awardedAt: todayISO() });
    notify(d, traineeUserId, "Badge", "New badge", `You earned ${badge.name}.`, "/trainee/gamification");
  });
  return ok();
}

/** A PM revokes an award with a reason. The award stays on record and the badge is not given again. */
export function revokeBadge(pmId: string, badgeId: string, traineeUserId: string, reason: string): Result {
  const db = getDB();
  if (!inScope(db, pmId, traineeUserId)) return fail("This user is not in your scope.");
  const award = awardOf(db, badgeId, traineeUserId);
  if (!award) return fail("This user has not earned this badge.");
  if (award.revokedAt) return fail("This award is already revoked.");
  if (!reason.trim()) return fail("Give a reason for revoking this badge.");
  const badge = db.badges.find((b) => b.id === badgeId);
  mutate((d) => {
    const a = awardOf(d, badgeId, traineeUserId)!;
    a.revokedAt = todayISO();
    a.revokedBy = pmId;
    a.revokeReason = reason.trim();
    notify(d, traineeUserId, "Badge", "Badge revoked", `${badge?.name ?? "A badge"} was revoked: ${reason.trim()}`, "/trainee/gamification");
  });
  return ok();
}

export interface BadgeInput {
  name: string;
  icon: string;
  criteria: string;
  rule?: { type: BadgeRuleType; threshold: number };
}

/** Create a badge. With a rule it is awarded automatically; without one a PM awards it. */
export function createBadge(pmId: string, input: BadgeInput): Result {
  const db = getDB();
  if (!db.users.some((u) => u.id === pmId && u.role === "PM")) return fail("Only a PM can create a badge.");
  if (!input.name.trim() || !input.criteria.trim()) return fail("Enter a name and the criteria.");
  if (db.badges.some((b) => b.name.toLowerCase() === input.name.trim().toLowerCase())) return fail("A badge with this name already exists.");
  if (input.rule && (!Number.isInteger(input.rule.threshold) || input.rule.threshold < 1 || input.rule.threshold > 365)) return fail("The threshold must be a whole number from 1 to 365.");
  mutate((d) => {
    d.badges.push({ id: uid("b"), name: input.name.trim(), icon: input.icon.trim() || "🏅", criteria: input.criteria.trim(), ...(input.rule ? { rule: { type: input.rule.type, threshold: input.rule.threshold } } : {}) });
  });
  return ok();
}

/** Retire a badge: it is no longer awarded. Awards already given stay. */
export function retireBadge(pmId: string, badgeId: string): Result {
  const db = getDB();
  if (!db.users.some((u) => u.id === pmId && u.role === "PM")) return fail("Only a PM can retire a badge.");
  const badge = db.badges.find((b) => b.id === badgeId);
  if (!badge) return fail("Badge not found.");
  if (badge.retiredAt) return fail("This badge is already retired.");
  mutate((d) => {
    d.badges.find((b) => b.id === badgeId)!.retiredAt = todayISO();
  });
  return ok();
}
