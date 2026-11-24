"use client";

import { useState } from "react";
import type { DB } from "@/lib/types";
import { levelFor, nameOf, xpTotal } from "@/lib/api";
import { Badge, Card, Table, Tabs, Td } from "@/components/ui/ui";
import { addDays, cn, todayISO, weekStartOf } from "@/lib/utils";

type Period = "weekly" | "monthly" | "all";

/** Leaderboard (FR-GAM-08). Pending XP is excluded; opted-out names are hidden from other trainees. */
export function Leaderboard({ db, traineeIds, viewerId, pmView }: { db: DB; traineeIds: string[]; viewerId?: string; pmView?: boolean }) {
  const [period, setPeriod] = useState<Period>("weekly");
  const today = todayISO();
  const since = period === "weekly" ? weekStartOf(today) : period === "monthly" ? addDays(today, -29) : undefined;
  const rows = traineeIds
    .map((id) => ({ id, xp: xpTotal(db, id, since), total: xpTotal(db, id), hidden: db.trainees.find((t) => t.userId === id)?.hideFromLeaderboard }))
    .sort((a, b) => b.xp - a.xp || b.total - a.total);
  return (
    <Card title="Leaderboard" description="Engagement only — never a performance rating. Pending XP is not counted.">
      <Tabs label="Leaderboard period" value={period} onChange={setPeriod} tabs={[{ id: "weekly", label: "Weekly" }, { id: "monthly", label: "Monthly" }, { id: "all", label: "All-time" }]} />
      <Table head={["Rank", "User", "Level", "XP"]}>
        {rows.map((r, i) => {
          const me = r.id === viewerId;
          const showName = pmView || me || !r.hidden;
          return (
            <tr key={r.id} className={cn(me && "bg-brand-50")}>
              <Td className="font-semibold">#{i + 1}</Td>
              <Td>
                {showName ? nameOf(db, r.id) : <span className="text-muted">Hidden user</span>}
                {me && <Badge tone="blue" className="ml-2">You</Badge>}
                {pmView && r.hidden && <Badge tone="gray" className="ml-2">Hidden from peers</Badge>}
              </Td>
              <Td>{levelFor(db, r.total).level.name}</Td>
              <Td className="font-medium">{r.xp}</Td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}
