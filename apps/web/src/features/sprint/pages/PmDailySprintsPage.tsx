"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Save } from "lucide-react";
import { useMe, useUnsavedWarning } from "@/features/shell";
import { addSprintWeek, dsCell, saveDSCell, simulateTraineeEdit, weekIdFor } from "../mock-api";
import { nameOf, pmTrainees } from "@/lib/mock/selectors";
import type { DSCell, DSColumn } from "@/lib/mock/types";
import { DS_DAY_COLS, ExcelSheet, dayBandLabel, weekTabLabel } from "../components/excel-sheet";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { addDays, formatDate, formatDateTime, isWeekend, toISODate, todayISO, weekStartOf } from "@/lib/utils";

type Key = string; // `${traineeUserId}|${date}|${column}`
type ReportKind = "daily" | "weekly" | "biweekly" | "monthly";
const REPORT_LABEL: Record<ReportKind, string> = { daily: "Daily", weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly" };
interface Conflict {
  key: Key;
  mine: string;
  theirs: DSCell;
}

export default function DailySprintsPage() {
  const { db, user } = useMe();
  const toast = useToast();
  const teams = db.teams.filter((t) => t.pmId === user.id);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const weeks = db.sprintWeeks.filter((w) => w.teamId === teamId).map((w) => w.weekStart).sort();
  const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()));
  const [dirty, setDirty] = useState<Record<Key, { value: string; base?: string }>>({});
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [historyOf, setHistoryOf] = useState<DSCell | null>(null);
  const [report, setReport] = useState<ReportKind | null>(null);
  const [reportDay, setReportDay] = useState(todayISO());
  useUnsavedWarning(Object.keys(dirty).length > 0);

  const weekId = weekIdFor(teamId, weekStart);
  const hasSprint = weeks.includes(weekStart);
  const members = pmTrainees(db, user.id).filter((t) => t.teamIds.includes(teamId) && t.onboardDate <= addDays(weekStart, 6));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => !isWeekend(d));
  const teamName = teams.find((t) => t.id === teamId)?.name ?? "Team";
  const rangeLabel = weekTabLabel(weekStart, addDays);

  const valueOf = (tid: string, date: string, col: DSColumn) => {
    const k = `${tid}|${date}|${col}`;
    return dirty[k]?.value ?? dsCell(db, weekId, tid, date, col)?.value ?? "";
  };
  /** Saved value of any day's cell (the report can span several weeks). */
  const savedValue = (tid: string, date: string, col: DSColumn) => {
    const ws = weekStartOf(date);
    return ws === weekStart ? valueOf(tid, date, col) : dsCell(db, weekIdFor(teamId, ws), tid, date, col)?.value ?? "";
  };
  const reportRange = (kind: ReportKind): [string, string] => {
    if (kind === "daily") return [reportDay, reportDay];
    if (kind === "weekly") return [weekStart, addDays(weekStart, 6)];
    if (kind === "biweekly") return [addDays(weekStart, -7), addDays(weekStart, 6)];
    const [y, m] = weekStart.split("-").map(Number);
    return [toISODate(new Date(y, m - 1, 1)), toISODate(new Date(y, m, 0))];
  };
  const edit = (tid: string, date: string, col: DSColumn, value: string) => {
    const k = `${tid}|${date}|${col}`;
    const base = dirty[k]?.base ?? dsCell(db, weekId, tid, date, col)?.updatedAt;
    setDirty({ ...dirty, [k]: { value, base } });
  };

  const save = () => {
    const found: Conflict[] = [];
    for (const [k, d] of Object.entries(dirty)) {
      const [tid, date, col] = k.split("|") as [string, string, DSColumn];
      const r = saveDSCell(user.id, weekId, tid, date, col, d.value, d.base);
      if (!r.ok) found.push({ key: k, mine: d.value, theirs: r.conflict });
    }
    setDirty(Object.fromEntries(found.map((c) => [c.key, dirty[c.key]])));
    if (found.length) setConflicts(found);
    else toast("Sheet saved. Each cell keeps its original author and edit history.");
  };

  const resolve = (c: Conflict, keepMine: boolean) => {
    const [tid, date, col] = c.key.split("|") as [string, string, DSColumn];
    if (keepMine) saveDSCell(user.id, weekId, tid, date, col, c.mine);
    const rest = { ...dirty };
    delete rest[c.key];
    setDirty(rest);
    setConflicts(conflicts.filter((x) => x.key !== c.key));
  };

  const goto = (ws: string) => {
    if (Object.keys(dirty).length && !confirm("You have unsaved edits. Leave this week without saving?")) return;
    setDirty({});
    setWeekStart(ws);
  };

  const addSprint = () => {
    const r = addSprintWeek(user.id, teamId);
    if (r.ok) {
      setDirty({});
      setWeekStart(r.data!);
      toast(`Sprint added for the week of ${formatDate(r.data!)}.`);
    }
  };

  /** Same layout as the on-screen sheet: day band row, then a label row + value row per trainee. */
  const exportXlsx = async () => {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    const border = { borderColor: "#c3cbd3" };
    const blue = { ...border, backgroundColor: "#0074b7", textColor: "#ffffff", fontWeight: "bold" as const, alignVertical: "center" as const };
    const header = [
      { value: "Name", ...blue },
      { value: "Sprint Plan Tasks", ...blue },
      ...days.flatMap((d) => [{ value: dayBandLabel(d), columnSpan: 4, align: "center" as const, ...border, backgroundColor: "#fff000", textColor: "#152340", fontWeight: "bold" as const }, null, null, null]),
    ];
    const text = (value: string, extra: object = {}) => ({ value, wrap: true, alignVertical: "top" as const, ...border, ...extra });
    const body = members.flatMap((m) => {
      const labels = [{ ...blue, value: "" }, { ...blue, value: "" }, ...days.flatMap(() => DS_DAY_COLS.map((c) => ({ ...blue, value: c.label, wrap: true })))];
      const values = [
        text(nameOf(db, m.userId), { backgroundColor: "#c0e7f2", alignVertical: "center" as const }),
        text(valueOf(m.userId, weekStart, "PLAN")),
        ...days.flatMap((d) =>
          DS_DAY_COLS.map((c) => {
            const v = valueOf(m.userId, d, c.col);
            if (c.col === "HOURS") return v.trim() !== "" && Number.isFinite(Number(v)) ? { value: Number(v), ...border, alignVertical: "center" as const, align: "center" as const, fontWeight: "bold" as const } : text(v, { align: "center" as const });
            return text(v, c.col === "BLOCKERS" ? { textColor: "#cf4661" } : {});
          }),
        ),
      ];
      return [labels, values];
    });
    const columns = [{ width: 24 }, { width: 38 }, ...days.flatMap(() => [{ width: 40 }, { width: 12 }, { width: 40 }, { width: 22 }])];
    await writeXlsxFile([header, ...body], { columns, sheet: "SPRINT PLAN & DAILY SCRUM", stickyColumnsCount: 2 }).toFile(`${teamName.replace(/\s+/g, "_")}_DS_${weekStart}.xlsx`);
  };

  const dirtyCount = Object.keys(dirty).length;

  return (
    <div>
      <PageHeader
        title="Daily Sprints"
        description="One shared sheet per team per week (Monday start)."
        actions={
          hasSprint ? (
            <>
              <Select
                aria-label="Report"
                className="w-40"
                value=""
                onChange={(e) => {
                  if (e.target.value) setReport(e.target.value as ReportKind);
                }}
              >
                <option value="">Report</option>
                {Object.entries(REPORT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={exportXlsx}>
                <Download className="h-4 w-4" /> Download XLSX
              </Button>
              <Button onClick={save} disabled={dirtyCount === 0}>
                <Save className="h-4 w-4" /> Save changes
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Team" value={teamId} onChange={(e) => { setDirty({}); setTeamId(e.target.value); }} className="w-48">
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" aria-label="Previous week" disabled={!weeks.some((w) => w < weekStart)} onClick={() => goto(weeks.filter((w) => w < weekStart).pop()!)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-48 text-center text-sm font-medium">Week of {formatDate(weekStart)}</span>
          <Button size="sm" variant="secondary" aria-label="Next week" disabled={!weeks.some((w) => w > weekStart)} onClick={() => goto(weeks.find((w) => w > weekStart)!)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted">
          Go to date
          <Input type="date" className="w-40" value={weekStart} onChange={(e) => e.target.value && goto(weekStartOf(e.target.value))} />
        </label>
      </div>

      {!hasSprint ? (
        <EmptyState
          title="No sprint for this date. Use Add Sprint to add the next week."
          action={
            <Button variant="secondary" onClick={addSprint}>
              + Add Sprint
            </Button>
          }
        />
      ) : members.length === 0 ? (
        <EmptyState title="No onboarded users in this team for this week." />
      ) : (
        <>
          {dirtyCount > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              {dirtyCount} unsaved cell(s)
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const [k] = Object.keys(dirty);
                  const [tid, date, col] = k.split("|") as [string, string, DSColumn];
                  simulateTraineeEdit(weekId, tid, date, col, `${dsCell(db, weekId, tid, date, col)?.value ?? ""} (edited by user)`.trim());
                  toast("Simulated a user editing the same cell. Save to see the conflict dialog.", "info");
                }}
              >
                Simulate concurrent edit (demo)
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDirty({})}>
                Discard
              </Button>
              <Button size="sm" onClick={save}>
                Save changes
              </Button>
            </div>
          )}
          <ExcelSheet
            teamName={teamName}
            members={members.map((m) => ({ userId: m.userId, name: nameOf(db, m.userId), traineeId: m.traineeId }))}
            days={days}
            weekStart={weekStart}
            today={todayISO()}
            stateOf={(tid, date, col) => ({
              value: valueOf(tid, date, col),
              cell: dsCell(db, weekId, tid, date, col),
              dirty: !!dirty[`${tid}|${date}|${col}`],
              disabled: false,
            })}
            onEdit={edit}
            onHistory={setHistoryOf}
            weekTabs={weeks.map((w) => ({ weekStart: w, label: weekTabLabel(w, addDays) }))}
            onSelectWeek={goto}
            onAddSprint={addSprint}
            rangeLabel={rangeLabel}
            statusLabel={`${members.length} user${members.length === 1 ? "" : "s"}`}
          />
          <p className="mt-2 text-xs text-muted">Click a cell to edit it, then Save changes. Scroll horizontally to see every day.</p>
        </>
      )}

      <Dialog open={conflicts.length > 0} onClose={() => {}} title="Someone else edited this cell">
        {conflicts[0] && (
          <>
            <p className="text-sm text-muted">
              {nameOf(db, conflicts[0].theirs.updatedBy)} changed this cell at {formatDateTime(conflicts[0].theirs.updatedAt)} while you were editing. Both versions stay in the history.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs font-medium text-muted">PM version (yours)</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{conflicts[0].mine || "(empty)"}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs font-medium text-muted">Their version</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{conflicts[0].theirs.value || "(empty)"}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => resolve(conflicts[0], false)}>
                Keep their version
              </Button>
              <Button onClick={() => resolve(conflicts[0], true)}>Keep PM version</Button>
            </div>
          </>
        )}
      </Dialog>

      <Dialog open={!!historyOf} onClose={() => setHistoryOf(null)} title="Cell history">
        {historyOf && (
          <>
            <p className="text-sm">
              Original author: <strong>{nameOf(db, historyOf.authorId)}</strong> · {formatDateTime(historyOf.createdAt)}
            </p>
            <ol className="space-y-2">
              {[...historyOf.history, { value: historyOf.value, by: historyOf.updatedBy, at: historyOf.updatedAt }].reverse().map((h, i) => (
                <li key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="text-xs text-muted">
                    {i === 0 ? "Current · " : ""}
                    {nameOf(db, h.by)} · {formatDateTime(h.at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{h.value || "(empty)"}</p>
                </li>
              ))}
            </ol>
          </>
        )}
      </Dialog>

      <Dialog open={!!report} onClose={() => setReport(null)} title={report ? `${REPORT_LABEL[report]} DS report — ${reportRange(report).map(formatDate).filter((x, i, arr) => i === 0 || x !== arr[0]).join(" – ")}` : ""} wide>
        {report && (() => {
          const [from, to] = reportRange(report);
          const rangeDays = Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 }, (_, i) => addDays(from, i)).filter((d) => !isWeekend(d));
          return (
            <>
              <Alert tone="blue">PM-only. Aggregated from the team sheet.</Alert>
              {report === "daily" && (
                <Field label="Day" htmlFor="rday">
                  <Input id="rday" type="date" className="w-48" value={reportDay} onChange={(e) => e.target.value && setReportDay(e.target.value)} />
                </Field>
              )}
              <Table head={["User", "Days reported", "Hours", "Blockers"]}>
                {members.map((m) => {
                  const reported = rangeDays.filter((d) => savedValue(m.userId, d, "TODAY"));
                  const hours = rangeDays.reduce((sum, d) => sum + (Number(savedValue(m.userId, d, "HOURS")) || 0), 0);
                  const blockers = rangeDays.map((d) => savedValue(m.userId, d, "BLOCKERS")).filter(Boolean);
                  return (
                    <tr key={m.userId}>
                      <Td className="font-medium">{nameOf(db, m.userId)}</Td>
                      <Td>
                        {reported.length}/{rangeDays.filter((d) => d <= todayISO()).length}
                      </Td>
                      <Td>{hours} h</Td>
                      <Td className="max-w-sm whitespace-normal text-red-700">{blockers.join("; ") || <span className="text-muted">None</span>}</Td>
                    </tr>
                  );
                })}
              </Table>
            </>
          );
        })()}
      </Dialog>

      {!teams.length && <Card><EmptyState title="Create a team first" description="Daily sprint sheets are per team." /></Card>}
    </div>
  );
}
