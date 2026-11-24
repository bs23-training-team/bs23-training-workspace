"use client";

import { mutate, getDB } from "@/lib/mock/store";
import { type Kudos } from "@/lib/mock/types";
import { Result, fail, notify, ok } from "@/lib/mock/core";
import { weekStartOf, todayISO, addDays, uid } from "@/lib/utils";
import { traineeOf, nameOf } from "@/lib/mock/selectors";
import { addXp } from "@/features/gamification-core/api";


export function setLeaderboardHidden(userId: string, hidden: boolean) {
  mutate((d) => {
    const t = d.trainees.find((x) => x.userId === userId);
    if (t) t.hideFromLeaderboard = hidden;
  });
}

export function sendKudos(fromId: string, toId: string, category: Kudos["category"], message: string): Result {
  const db = getDB();
  if (fromId === toId) return fail("You cannot send kudos to yourself.");
  if (!message.trim()) return fail("Add a short message.");
  const ws = weekStartOf(todayISO());
  const sentThisWeek = db.kudos.filter((k) => k.fromId === fromId && k.date >= ws);
  if (sentThisWeek.length >= db.xpRules.kudosSendLimitPerWeek) return fail("Weekly limit reached");
  const recent = db.kudos.find((k) => k.fromId === fromId && k.toId === toId && k.date > addDays(todayISO(), -db.xpRules.kudosCooldownDays));
  if (recent) return fail(`You can send kudos to this person again after ${addDays(recent.date, db.xpRules.kudosCooldownDays)}.`);
  const reciprocal = db.kudos.some((k) => k.fromId === toId && k.toId === fromId && k.date >= ws);
  const receivedXp = db.xpEvents.filter((e) => e.traineeUserId === toId && e.source === "Kudos" && e.date >= ws && e.status !== "REJECTED").reduce((s, e) => s + e.amount, 0);
  const capped = receivedXp + db.xpRules.kudos > db.xpRules.kudosReceivedCapPerWeek;
  const t = traineeOf(db, toId);
  mutate((d) => {
    const id = uid("k");
    d.kudos.push({ id, fromId, toId, category, message: message.trim(), date: todayISO(), suspicious: reciprocal });
    addXp(d, {
      traineeUserId: toId,
      source: "Kudos",
      amount: capped ? 0 : d.xpRules.kudos,
      status: reciprocal ? "HELD" : "PENDING",
      key: `kudos:${id}`,
      evidence: `Kudos from ${nameOf(d, fromId)} — ${category}`,
      flag: reciprocal ? "Suspicious exchange" : capped ? "Weekly received cap reached" : undefined,
      date: todayISO(),
    });
    if (reciprocal) {
      d.kudos.filter((k) => k.fromId === toId && k.toId === fromId && k.date >= ws).forEach((k) => (k.suspicious = true));
      if (t) notify(d, t.pmId, "Suspicious kudos", "Suspicious kudos exchange", `${nameOf(d, fromId)} and ${nameOf(d, toId)} sent each other kudos this week.`, "/pm/gamification");
    }
    notify(d, toId, "Kudos received", "You received kudos", `${nameOf(d, fromId)}: ${message.trim()}`, "/trainee/gamification");
  });
  return ok();
}

export function createQuest(input: { name: string; description: string; target: number; reward: number; start: string; end: string }): Result {
  if (!input.name.trim() || !input.start || !input.end) return fail("Name and dates are required.");
  if (input.end < input.start) return fail("End date cannot precede start date");
  if (input.target < 1) return fail("Target must be at least 1.");
  mutate((d) => {
    d.quests.push({ id: uid("q"), ...input });
  });
  return ok();
}

export function verifyQuestProgress(pmId: string, questId: string, traineeUserId: string, count: number) {
  mutate((d) => {
    const p = d.questProgress.find((x) => x.questId === questId && x.traineeUserId === traineeUserId);
    if (p) Object.assign(p, { count, verifiedBy: pmId });
    else d.questProgress.push({ questId, traineeUserId, count, verifiedBy: pmId });
    const q = d.quests.find((x) => x.id === questId)!;
    if (count >= q.target) addXp(d, { traineeUserId, source: "Quest", amount: q.reward, status: "AWARDED", key: `quest:${questId}:${traineeUserId}`, evidence: `${q.name} completed`, date: todayISO() });
  });
}
