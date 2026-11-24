"use client";

import { useState } from "react";
import { useMe } from "@/features/shell";
import { adjustXp, awardBadge, grantStreakFreeze, reviewXp, streakOf, xpTotal } from "../api";
import { createQuest, verifyQuestProgress, Leaderboard } from "@/features/engagement";
import { nameOf, pmPeople } from "@/lib/mock/selectors";
import type { XpEvent } from "@/lib/mock/types";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, StatusBadge, Table, Tabs, Td, Textarea } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { addDays, formatDate, todayISO, weekStartOf } from "@/lib/utils";

type Tab = "queue" | "trainees" | "quests";

export default function PMGamificationPage() {
  const { db, user } = useMe();
  const toast = useToast();
  const trainees = pmPeople(db, user.id);
  const ids = new Set(trainees.map((t) => t.userId));
  const [tab, setTab] = useState<Tab>("queue");
  const [review, setReview] = useState<{ ev: XpEvent; status: "AWARDED" | "HELD" | "REJECTED" | "REVERSED"; reason: string } | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [adjust, setAdjust] = useState<{ tid: string; amount: number; reason: string } | null>(null);
  const [adjustError, setAdjustError] = useState("");
  const [quest, setQuest] = useState({ name: "", description: "", target: 3, reward: 20, start: weekStartOf(todayISO()), end: addDays(weekStartOf(todayISO()), 6) });
  const [questError, setQuestError] = useState("");
  const [freeze, setFreeze] = useState<{ tid: string; date: string; source: "LEAVE" | "HOLIDAY"; reason: string } | null>(null);
  const [badge, setBadge] = useState<{ tid: string; badgeId: string; evidence: string } | null>(null);
  const [miscError, setMiscError] = useState("");

  const queue = db.xpEvents.filter((e) => ids.has(e.traineeUserId) && (e.status === "PENDING" || e.status === "HELD")).sort((a, b) => (a.flag ? -1 : 1) - (b.flag ? -1 : 1));
  const awarded = db.xpEvents.filter((e) => ids.has(e.traineeUserId) && e.status === "AWARDED").sort((a, b) => b.date.localeCompare(a.date));
  const suspicious = db.kudos.filter((k) => k.suspicious && ids.has(k.toId));

  return (
    <div>
      <PageHeader title="Gamification" description="Review XP before it counts. XP is engagement only and never a performance rating." />
      <Tabs
        label="Gamification sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "queue", label: `Review queue (${queue.length})` },
          { id: "trainees", label: "Users & leaderboard" },
          { id: "quests", label: "Quests & badges" },
        ]}
      />

      {tab === "queue" && (
        <div className="space-y-6">
          {suspicious.length > 0 && (
            <Alert tone="amber" title="Suspicious exchange">
              Reciprocal kudos in the same week: {suspicious.map((k) => `${nameOf(db, k.fromId)} → ${nameOf(db, k.toId)}`).join(", ")}. The related XP is held for your review.
            </Alert>
          )}
          <Card title="Pending and held XP" description="Pending XP is excluded from level and rank. Every decision needs a reason.">
            {queue.length === 0 ? (
              <EmptyState title="You're all caught up." />
            ) : (
              <Table head={["User", "Source", "Evidence", "XP", "Date", "Status", ""]}>
                {queue.map((e) => (
                  <tr key={e.id}>
                    <Td className="font-medium">{nameOf(db, e.traineeUserId)}</Td>
                    <Td>
                      {e.source}
                      {e.flag && (
                        <Badge tone="red" className="ml-2">
                          {e.flag}
                        </Badge>
                      )}
                    </Td>
                    <Td className="max-w-xs whitespace-normal text-xs">{e.evidence}</Td>
                    <Td>{e.amount}</Td>
                    <Td>{formatDate(e.date)}</Td>
                    <Td>
                      <StatusBadge status={e.status === "HELD" ? "Held" : "Pending"} />
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button size="sm" variant="success" onClick={() => { setReviewError(""); setReview({ ev: e, status: "AWARDED", reason: "Verified" }); }}>
                          Award
                        </Button>
                        {e.status !== "HELD" && (
                          <Button size="sm" variant="secondary" onClick={() => { setReviewError(""); setReview({ ev: e, status: "HELD", reason: "" }); }}>
                            Hold
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { setReviewError(""); setReview({ ev: e, status: "REJECTED", reason: "" }); }}>
                          Reject
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Card title="Recently awarded" description="Reverse an award with a reason if it was given in error.">
            <Table head={["User", "Source", "XP", "Date", ""]}>
              {awarded.slice(0, 10).map((e) => (
                <tr key={e.id}>
                  <Td>{nameOf(db, e.traineeUserId)}</Td>
                  <Td>{e.source}</Td>
                  <Td>{e.amount}</Td>
                  <Td>{formatDate(e.date)}</Td>
                  <Td>
                    <Button size="sm" variant="ghost" onClick={() => { setReviewError(""); setReview({ ev: e, status: "REVERSED", reason: "" }); }}>
                      Reverse
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}

      {tab === "trainees" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="User XP" description="Manual adjustments never take a total below zero.">
            <Table head={["User", "XP", "Streak", ""]}>
              {trainees.map((t) => (
                <tr key={t.userId}>
                  <Td className="font-medium">{nameOf(db, t.userId)}</Td>
                  <Td>{xpTotal(db, t.userId)}</Td>
                  <Td>{streakOf(db, t.userId)} d</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="secondary" onClick={() => { setAdjustError(""); setAdjust({ tid: t.userId, amount: 0, reason: "" }); }}>
                        Adjust
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setMiscError(""); setFreeze({ tid: t.userId, date: todayISO(), source: "LEAVE", reason: "" }); }}>
                        Streak freeze
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setMiscError(""); setBadge({ tid: t.userId, badgeId: db.badges[0].id, evidence: "" }); }}>
                        Badge
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Leaderboard db={db} traineeIds={trainees.filter((t) => t.onboardDate <= todayISO()).map((t) => t.userId)} pmView />
        </div>
      )}

      {tab === "quests" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Create weekly quest">
            <div className="space-y-3">
              {questError && <Alert tone="red">{questError}</Alert>}
              <Field label="Name" htmlFor="qn">
                <Input id="qn" value={quest.name} onChange={(e) => setQuest({ ...quest, name: e.target.value })} />
              </Field>
              <Field label="Goal" htmlFor="qd">
                <Textarea id="qd" value={quest.description} onChange={(e) => setQuest({ ...quest, description: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Target" htmlFor="qt">
                  <Input id="qt" type="number" min={1} value={quest.target} onChange={(e) => setQuest({ ...quest, target: Number(e.target.value) })} />
                </Field>
                <Field label="Reward (XP)" htmlFor="qr">
                  <Input id="qr" type="number" min={0} value={quest.reward} onChange={(e) => setQuest({ ...quest, reward: Number(e.target.value) })} />
                </Field>
                <Field label="Start" htmlFor="qs">
                  <Input id="qs" type="date" value={quest.start} onChange={(e) => setQuest({ ...quest, start: e.target.value })} />
                </Field>
                <Field label="End" htmlFor="qe">
                  <Input id="qe" type="date" value={quest.end} onChange={(e) => setQuest({ ...quest, end: e.target.value })} />
                </Field>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  const r = createQuest(quest);
                  if (!r.ok) return setQuestError(r.error);
                  setQuestError("");
                  setQuest({ ...quest, name: "", description: "" });
                  toast("Quest created.");
                }}
              >
                Create quest
              </Button>
            </div>
          </Card>
          <Card className="lg:col-span-2" title="Quest progress" description="Progress counts only after you verify it.">
            {db.quests.map((q) => (
              <div key={q.id} className="mb-5">
                <p className="font-medium">
                  {q.name} <span className="text-sm font-normal text-muted">· target {q.target} · +{q.reward} XP · {formatDate(q.start)} – {formatDate(q.end)}</span>
                </p>
                <ul className="mt-2 space-y-1">
                  {trainees
                    .filter((t) => t.onboardDate <= todayISO())
                    .map((t) => {
                      const p = db.questProgress.find((x) => x.questId === q.id && x.traineeUserId === t.userId);
                      return (
                        <li key={t.userId} className="flex items-center gap-3 text-sm">
                          <span className="w-40">{nameOf(db, t.userId)}</span>
                          <Input aria-label="Verified count" type="number" min={0} className="w-20" defaultValue={p?.count ?? 0} onBlur={(e) => verifyQuestProgress(user.id, q.id, t.userId, Number(e.target.value))} />
                          <span className="text-xs text-muted">{p?.verifiedBy ? "verified" : "not verified"}</span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </Card>
          <Card className="lg:col-span-3" title="Badges">
            <Table head={["Badge", "Kind", "Criteria", "Earned by"]}>
              {db.badges.map((b) => (
                <tr key={b.id}>
                  <Td className="font-medium">
                    <span aria-hidden>{b.icon}</span> {b.name}
                  </Td>
                  <Td>
                    <Badge tone={b.kind === "SPECIAL" ? "amber" : "blue"}>{b.kind.toLowerCase()}</Badge>
                  </Td>
                  <Td className="max-w-md whitespace-normal text-sm">{b.criteria}</Td>
                  <Td>{db.badgeAwards.filter((a) => a.badgeId === b.id && ids.has(a.traineeUserId)).map((a) => nameOf(db, a.traineeUserId)).join(", ") || "—"}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}


      <Dialog
        open={!!review}
        onClose={() => setReview(null)}
        title={review ? `${review.status === "AWARDED" ? "Award" : review.status === "HELD" ? "Hold" : review.status === "REJECTED" ? "Reject" : "Reverse"} XP` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const r = reviewXp(user.id, review!.ev.id, review!.status, review!.reason);
                if (!r.ok) return setReviewError(r.error);
                setReview(null);
                toast("Decision saved. User notified.");
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        {review && (
          <>
            <p className="text-sm">
              {nameOf(db, review.ev.traineeUserId)} · {review.ev.source} · {review.ev.amount} XP
            </p>
            <p className="text-xs text-muted">Evidence: {review.ev.evidence}</p>
            <Field label="Reason" htmlFor="rr" required error={reviewError}>
              <Textarea id="rr" value={review.reason} onChange={(e) => setReview({ ...review, reason: e.target.value })} />
            </Field>
          </>
        )}
      </Dialog>

      <Dialog
        open={!!adjust}
        onClose={() => setAdjust(null)}
        title={`Adjust XP — ${adjust ? nameOf(db, adjust.tid) : ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjust(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const r = adjustXp(user.id, adjust!.tid, adjust!.amount, adjust!.reason);
                if (!r.ok) return setAdjustError(r.error);
                setAdjust(null);
                toast("Adjustment saved.");
              }}
            >
              Save adjustment
            </Button>
          </>
        }
      >
        {adjust && (
          <>
            {adjustError && <Alert tone="red">{adjustError}</Alert>}
            <p className="text-sm text-muted">Current total: {xpTotal(db, adjust.tid)} XP</p>
            <Field label="Amount (negative to deduct)" htmlFor="aa">
              <Input id="aa" type="number" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: Number(e.target.value) })} />
            </Field>
            <Field label="Reason" htmlFor="ar" required>
              <Textarea id="ar" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
            </Field>
          </>
        )}
      </Dialog>

      <Dialog
        open={!!freeze}
        onClose={() => setFreeze(null)}
        title={`Private streak freeze — ${freeze ? nameOf(db, freeze.tid) : ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFreeze(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const r = grantStreakFreeze(user.id, freeze!.tid, freeze!.date, freeze!.source, freeze!.reason);
                if (!r.ok) return setMiscError(r.error);
                setFreeze(null);
                toast("Streak freeze granted.");
              }}
            >
              Grant
            </Button>
          </>
        }
      >
        {freeze && (
          <>
            {miscError && <Alert tone="red">{miscError}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="fd">
                <Input id="fd" type="date" value={freeze.date} onChange={(e) => setFreeze({ ...freeze, date: e.target.value })} />
              </Field>
              <Field label="Source" htmlFor="fs">
                <Select id="fs" value={freeze.source} onChange={(e) => setFreeze({ ...freeze, source: e.target.value as "LEAVE" | "HOLIDAY" })}>
                  <option value="LEAVE">Approved leave</option>
                  <option value="HOLIDAY">Holiday</option>
                </Select>
              </Field>
            </div>
            <Field label="Reason (private)" htmlFor="fr" required>
              <Textarea id="fr" value={freeze.reason} onChange={(e) => setFreeze({ ...freeze, reason: e.target.value })} />
            </Field>
          </>
        )}
      </Dialog>

      <Dialog
        open={!!badge}
        onClose={() => setBadge(null)}
        title={`Award badge — ${badge ? nameOf(db, badge.tid) : ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBadge(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const r = awardBadge(user.id, badge!.badgeId, badge!.tid, badge!.evidence);
                if (!r.ok) return setMiscError(r.error);
                setBadge(null);
                toast("Badge awarded.");
              }}
            >
              Award
            </Button>
          </>
        }
      >
        {badge && (
          <>
            {miscError && <Alert tone="red">{miscError}</Alert>}
            <Field label="Badge" htmlFor="bb">
              <Select id="bb" value={badge.badgeId} onChange={(e) => setBadge({ ...badge, badgeId: e.target.value })}>
                {db.badges.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.kind.toLowerCase()})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Evidence" htmlFor="be" required>
              <Textarea id="be" value={badge.evidence} onChange={(e) => setBadge({ ...badge, evidence: e.target.value })} />
            </Field>
          </>
        )}
      </Dialog>
    </div>
  );
}
