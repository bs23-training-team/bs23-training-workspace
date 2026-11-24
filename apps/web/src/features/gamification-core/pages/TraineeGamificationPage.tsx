"use client";

import { useState } from "react";
import { Flame, Gift, Heart, Trophy } from "lucide-react";
import { useMe } from "@/features/shell";
import { levelFor, streakOf, xpTotal } from "../api";
import { nameOf, pmTrainees, traineeOf } from "@/lib/mock/selectors";
import { sendKudos, setLeaderboardHidden, Leaderboard } from "@/features/engagement";
import type { Kudos } from "@/lib/mock/types";
import { Alert, Badge, Button, Card, Checkbox, Field, PageHeader, ProgressBar, Select, StatusBadge, Table, Td, Textarea } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, todayISO, weekStartOf } from "@/lib/utils";

export default function TraineeGamificationPage() {
  const { db, user } = useMe();
  const toast = useToast();
  const me = traineeOf(db, user.id)!;
  const peers = pmTrainees(db, me.pmId).filter((t) => t.userId !== user.id && t.onboardDate <= todayISO());
  const xp = xpTotal(db, user.id);
  const lv = levelFor(db, xp);
  const pending = db.xpEvents.filter((e) => e.traineeUserId === user.id && (e.status === "PENDING" || e.status === "HELD")).reduce((s, e) => s + e.amount, 0);
  const events = db.xpEvents.filter((e) => e.traineeUserId === user.id).sort((a, b) => b.date.localeCompare(a.date));
  const ws = weekStartOf(todayISO());
  const sent = db.kudos.filter((k) => k.fromId === user.id && k.date >= ws).length;
  const received = db.kudos.filter((k) => k.toId === user.id).sort((a, b) => b.date.localeCompare(a.date));
  const [kudos, setKudos] = useState({ toId: "", category: "Helpful" as Kudos["category"], message: "" });
  const [kudosError, setKudosError] = useState("");

  return (
    <div>
      <PageHeader title="Gamification" description="XP is an engagement signal only. It is never shown or used as a performance rating." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Trophy className="h-4 w-4" /> Level
          </p>
          <p className="mt-1 text-2xl font-semibold">{lv.level.name}</p>
          <div className="mt-2">
            <ProgressBar value={lv.progress} label="Level progress" />
          </div>
          <p className="mt-1 text-xs text-muted">{lv.next ? `${lv.next.minXp - xp} XP to ${lv.next.name}` : "Top level reached"}</p>
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Gift className="h-4 w-4" /> Awarded XP
          </p>
          <p className="mt-1 text-2xl font-semibold">{xp}</p>
          <p className="mt-1 text-xs text-muted">{pending} XP pending or held (not counted until your PM reviews it)</p>
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Flame className="h-4 w-4" /> Daily streak
          </p>
          <p className="mt-1 text-2xl font-semibold">{streakOf(db, user.id)} days</p>
          <p className="mt-1 text-xs text-muted">Consecutive sprint-submission days. Approved leave can be frozen by your PM.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Weekly quests">
          <ul className="space-y-4">
            {db.quests.map((q) => {
              const p = db.questProgress.find((x) => x.questId === q.id && x.traineeUserId === user.id);
              const pct = Math.min(100, Math.round(((p?.count ?? 0) / q.target) * 100));
              return (
                <li key={q.id}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{q.name}</span>
                    <span className="text-muted">
                      {p?.count ?? 0}/{q.target} · +{q.reward} XP
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {q.description} {formatDate(q.start)} – {formatDate(q.end)}
                  </p>
                  <ProgressBar value={pct} label={q.name} />
                  <p className="mt-0.5 text-xs text-muted">{p?.verifiedBy ? `Verified by ${nameOf(db, p.verifiedBy)}` : "Awaiting PM verification"}</p>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Badges">
          <ul className="grid grid-cols-2 gap-3">
            {db.badges.map((b) => {
              const earned = db.badgeAwards.find((a) => a.badgeId === b.id && a.traineeUserId === user.id);
              return (
                <li key={b.id} className={earned ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3" : "rounded-xl border border-line p-3 opacity-70"}>
                  <p className="text-sm font-medium">
                    <span aria-hidden>{b.icon}</span> {b.name}
                  </p>
                  <p className="text-xs text-muted">{b.criteria}</p>
                  {earned && <Badge tone="green" className="mt-1">Earned {formatDate(earned.awardedAt)}</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-3">
          <Leaderboard db={db} traineeIds={pmTrainees(db, me.pmId).filter((t) => t.onboardDate <= todayISO()).map((t) => t.userId)} viewerId={user.id} />
          <Checkbox label="Hide my name from the leaderboard (I still see my own rank)" checked={me.hideFromLeaderboard} onChange={(v) => setLeaderboardHidden(user.id, v)} />
        </div>

        <Card title="Send kudos" description={`${sent}/${db.xpRules.kudosSendLimitPerWeek} sent this week · ${db.xpRules.kudosCooldownDays}-day cooldown per person`}>
          <div className="space-y-3">
            {kudosError && <Alert tone="red">{kudosError}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="To" htmlFor="kt">
                <Select id="kt" value={kudos.toId} onChange={(e) => setKudos({ ...kudos, toId: e.target.value })}>
                  <option value="">Choose a peer</option>
                  {peers.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {nameOf(db, p.userId)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Category" htmlFor="kc">
                <Select id="kc" value={kudos.category} onChange={(e) => setKudos({ ...kudos, category: e.target.value as Kudos["category"] })}>
                  <option>Helpful</option>
                  <option>Great explanation</option>
                  <option>Teamwork</option>
                </Select>
              </Field>
            </div>
            <Field label="Message" htmlFor="km">
              <Textarea id="km" value={kudos.message} onChange={(e) => setKudos({ ...kudos, message: e.target.value })} />
            </Field>
            <Button
              onClick={() => {
                if (!kudos.toId) return setKudosError("Choose a peer.");
                const r = sendKudos(user.id, kudos.toId, kudos.category, kudos.message);
                if (!r.ok) return setKudosError(r.error);
                setKudosError("");
                setKudos({ toId: "", category: "Helpful", message: "" });
                toast("Kudos sent. The XP stays pending until PM review.");
              }}
            >
              <Heart className="h-4 w-4" /> Send kudos
            </Button>
            {received.length > 0 && (
              <div className="pt-2">
                <p className="mb-2 text-sm font-medium">Kudos received</p>
                <ul className="space-y-2 text-sm">
                  {received.slice(0, 5).map((k) => (
                    <li key={k.id} className="rounded-lg bg-slate-50 p-2">
                      <span className="font-medium">{nameOf(db, k.fromId)}</span> · {k.category}
                      <span className="block text-muted">{k.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        <Card title="My XP history" className="lg:col-span-2">
          <Table head={["Date", "Source", "Evidence", "XP", "Status", "Note"]}>
            {events.map((e) => (
              <tr key={e.id}>
                <Td>{formatDate(e.date)}</Td>
                <Td>{e.source}</Td>
                <Td className="max-w-xs truncate">{e.evidence}</Td>
                <Td>{e.amount > 0 ? `+${e.amount}` : e.amount}</Td>
                <Td>
                  <StatusBadge status={e.status.charAt(0) + e.status.slice(1).toLowerCase()} />
                </Td>
                <Td className="text-xs text-muted">{e.reason ?? (e.flag ? "Under review" : "")}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
