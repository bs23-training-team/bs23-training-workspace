"use client";

import { type DB, type XpEvent, type XpRules, type Level } from "@/lib/mock/types";
import { todayISO, addDays, isWeekend, uid, isHttpsUrl } from "@/lib/utils";
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
export function streakOf(db: DB, traineeUserId: string) {
  const subs = new Set(db.sprintSubmissions.filter((s) => s.traineeUserId === traineeUserId).map((s) => s.date));
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

/** Awards a badge once. A Technical badge needs a PM-finalised assessment and a PM-reviewed project (FR-ASM-07). */
export function awardBadge(pmId: string, badgeId: string, traineeUserId: string, evidence: string, project?: { reviewed: boolean; url: string }): Result {
  const db = getDB();
  if (!inScope(db, pmId, traineeUserId)) return fail("This user is not in your scope.");
  if (db.badgeAwards.some((b) => b.badgeId === badgeId && b.traineeUserId === traineeUserId)) return fail("This badge is already earned.");
  const badge = db.badges.find((b) => b.id === badgeId);
  if (!badge) return fail("Badge not found.");
  if (!evidence.trim()) return fail("Add the evidence for this badge.");
  let fullEvidence = evidence.trim();
  if (badge.kind === "TECHNICAL") {
    const finalised = db.attempts.some((a) => a.traineeUserId === traineeUserId && a.status === "FINAL");
    if (!finalised) return fail("A Technical badge needs at least one PM-finalised assessment. This user has none yet.");
    if (!project?.url.trim() || !isHttpsUrl(project.url.trim())) return fail("Add an HTTPS link to the project you reviewed.");
    if (!project.reviewed) return fail("Confirm that you have reviewed this user's project.");
    fullEvidence += ` · Project reviewed: ${project.url.trim()}`;
  }
  mutate((d) => {
    d.badgeAwards.push({ badgeId, traineeUserId, evidence: fullEvidence, awardedBy: pmId, awardedAt: todayISO() });
    notify(d, traineeUserId, "Badge", "New badge", `You earned ${badge.name}.`, "/trainee/gamification");
  });
  return ok();
}
