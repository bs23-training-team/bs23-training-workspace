"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { updateLevels, updateXpRules } from "@/lib/api";
import type { DB, Level, XpRules } from "@/lib/types";
import { Alert, Button, Card, Field, Input } from "@/components/ui/ui";

const RULE_LABELS: [keyof XpRules, string][] = [
  ["verifiedModule", "Verified module XP"],
  ["verifiedModuleDailyCap", "Verified module daily cap"],
  ["onTimeSprint", "On-time sprint XP"],
  ["finalAssessment", "Final assessment XP"],
  ["kudos", "Kudos XP"],
  ["kudosSendLimitPerWeek", "Kudos send limit / week"],
  ["kudosCooldownDays", "Same-recipient cooldown (days)"],
  ["kudosReceivedCapPerWeek", "Kudos received cap (XP / week)"],
  ["streakMilestone", "Streak milestone XP"],
  ["pmReviewMultiplier", "PM review multiplier"],
  ["engagementDropAlertPct", "Engagement-drop alert (%)"],
  ["sprintCutoff", "Sprint cutoff (HH:MM)"],
];

/** XP rules and levels form (PM Settings). */
export function XpRulesForm({ db, pmId }: { db: DB; pmId: string }) {
  const [rules, setRules] = useState<XpRules>(db.xpRules);
  const [levels, setLevels] = useState<Level[]>(db.levels);
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="XP rules">
        <div className="grid gap-3 sm:grid-cols-2">
          {RULE_LABELS.map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`r-${k}`}>
              <Input id={`r-${k}`} type={k === "sprintCutoff" ? "time" : "number"} min={0} value={String(rules[k])} onChange={(e) => setRules({ ...rules, [k]: k === "sprintCutoff" ? e.target.value : Number(e.target.value) })} />
            </Field>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => {
              const r = updateXpRules(pmId, rules);
              setMsg(r.ok ? { tone: "green", text: "XP rules saved." } : { tone: "red", text: r.error });
            }}
          >
            Save rules
          </Button>
        </div>
      </Card>
      <Card title="Levels" description="Thresholds must start at 0 and increase.">
        <ul className="space-y-2">
          {levels.map((l, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input aria-label={`Level ${i + 1} name`} value={l.name} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input aria-label={`Level ${i + 1} minimum XP`} type="number" min={0} className="w-32" value={l.minXp} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, minXp: Number(e.target.value) } : x)))} />
              <Button size="sm" variant="ghost" aria-label="Remove level" disabled={levels.length <= 1} onClick={() => setLevels(levels.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between">
          <Button size="sm" variant="secondary" onClick={() => setLevels([...levels, { name: "", minXp: (levels[levels.length - 1]?.minXp ?? 0) + 500 }])}>
            <Plus className="h-4 w-4" /> Add level
          </Button>
          <Button
            onClick={() => {
              const r = updateLevels(pmId, levels);
              setMsg(r.ok ? { tone: "green", text: "Levels saved." } : { tone: "red", text: r.error });
            }}
          >
            Save levels
          </Button>
        </div>
      </Card>
      {msg && (
        <div className="lg:col-span-2">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}
      <div className="lg:col-span-2">
        <Alert tone="blue">No XP for raw commits, line counts, self-marked topics, provisional grades or disconnected integrations. No season resets.</Alert>
      </div>
    </div>
  );
}
