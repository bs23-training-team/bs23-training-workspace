"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DB } from "@/lib/mock/types";
import { Badge, Input, Table, Td } from "@/components/ui/ui";
import { addDays, cn, isWeekend, todayISO } from "@/lib/utils";

/** Reconciliation requests store their dates in `recordRef` as "dates:YYYY-MM-DD,YYYY-MM-DD". */
export const reconRef = (dates: string[]) => `dates:${[...dates].sort().join(",")}`;
export const reconDates = (ref: string): string[] | null => (ref.startsWith("dates:") ? ref.slice(6).split(",").filter(Boolean) : null);
export const dmy = (iso: string) => iso.split("-").reverse().join("/");

const hhmm = (hours?: number) => {
  const m = Math.round((hours ?? 0) * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

type Status = "Working Day" | "Holiday" | "Leave";
interface Row {
  key: string;
  name: string;
  employeeId: string;
  date: string;
  signIn?: string;
  signOut?: string;
  hours?: number;
  status: Status;
  remarks: string;
  kind: "present" | "manual" | "wfh" | "leave" | "holiday" | "none";
}

const PAGE_SIZE = 30;

/**
 * "Attendances" screen in the BS ERP / Odoo style: summary tiles, one row per employee per
 * day, green rows for working days with data, month filter and pager. Data is presented as
 * fetched from the Brain Station 23 ERP API; a day without a record is never counted as absence.
 */
export function ErpAttendance({ db, traineeIds }: { db: DB; traineeIds: string[] }) {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [page, setPage] = useState(0);

  const first = `${month}-01`;
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const rows: Row[] = [];
  for (const tid of traineeIds) {
    const tr = db.trainees.find((t) => t.userId === tid);
    const name = db.users.find((u) => u.id === tid)?.name ?? "";
    if (!tr) continue;
    for (let i = 0; i < daysInMonth; i++) {
      const date = addDays(first, i);
      if (date < tr.onboardDate) continue;
      const base = { key: tid + date, name, employeeId: tr.traineeId, date };
      if (isWeekend(date)) {
        rows.push({ ...base, status: "Holiday", remarks: "", kind: "holiday" });
        continue;
      }
      const rec = db.attendance.find((a) => a.traineeUserId === tid && a.date === date);
      if (rec) {
        rows.push({
          ...base,
          signIn: rec.entry,
          signOut: rec.exit,
          hours: rec.hours,
          status: "Working Day",
          remarks: [rec.source === "PM_ENTERED" ? "Manual (PM-entered)" : "", rec.lateMinutes ? `Late ${rec.lateMinutes} min` : "", !rec.exit ? "Sign-out unknown" : ""].filter(Boolean).join(" · "),
          kind: rec.source === "PM_ENTERED" ? "manual" : "present",
        });
        continue;
      }
      const leave = db.leaveRequests.find((l) => l.traineeUserId === tid && l.status === "APPROVED" && l.start <= date && l.end >= date);
      if (leave) {
        rows.push({ ...base, status: "Leave", remarks: `${leave.type} leave`, kind: "leave" });
        continue;
      }
      if (tr.attendanceMode === "ONLINE") {
        rows.push({ ...base, status: "Working Day", remarks: "Work from home (online user)", kind: "wfh" });
        continue;
      }
      rows.push({ ...base, status: "Working Day", remarks: date < today ? "No ERP record (not counted as absence)" : "", kind: "none" });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const count = (k: Row["kind"]) => rows.filter((r) => r.kind === k).length;
  const tiles: { label: string; value: number; tone: string }[] = [
    { label: "Total days", value: rows.length, tone: "text-ink" },
    { label: "Weekend & holidays", value: count("holiday"), tone: "text-brand-600" },
    { label: "Working days", value: rows.length - count("holiday"), tone: "text-emerald-700" },
    { label: "Present", value: count("present"), tone: "text-emerald-600" },
    { label: "WFH", value: count("wfh"), tone: "text-sky-500" },
    { label: "Manual", value: count("manual"), tone: "text-slate-500" },
    { label: "Leave", value: count("leave"), tone: "text-orange-500" },
    { label: "Absent", value: 0, tone: "text-red-600" },
    { label: "Office trip", value: 0, tone: "text-violet-600" },
  ];

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const slice = rows.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);
  const range = rows.length ? `${cur * PAGE_SIZE + 1}-${Math.min(rows.length, (cur + 1) * PAGE_SIZE)} / ${rows.length}` : "0 / 0";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Month
            <Input type="month" aria-label="Month" className="w-44" value={month} max={today.slice(0, 7)} onChange={(e) => { if (e.target.value) { setMonth(e.target.value); setPage(0); } }} />
          </label>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted" role="group" aria-label="Pagination">
          <span aria-live="polite">{range}</span>
          <button className="rounded-lg border border-line bg-white p-1.5 hover:bg-slate-50 disabled:text-slate-300" aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="rounded-lg border border-line bg-white p-1.5 hover:bg-slate-50 disabled:text-slate-300" aria-label="Next page" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9" aria-label="Attendance summary">
        {tiles.map((t) => (
          <li key={t.label} className="rounded-xl border border-line bg-white px-2 py-3 text-center">
            <p className={cn("text-2xl font-semibold", t.tone)}>{t.value}</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">{t.label}</p>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No attendance days in this month.</p>
      ) : (
        <Table head={["Employee", "Employee ID", "Date", "Sign-in", "Sign-out", "Work hours", "Working day status", "Remarks"]}>
          {slice.map((r) => {
            const data = r.kind === "present" || r.kind === "manual";
            return (
              <tr key={r.key} className={cn(data ? "bg-emerald-50/70 text-emerald-800" : r.kind === "holiday" ? "text-muted" : "")}>
                <Td className="font-medium">{r.name}</Td>
                <Td>{r.employeeId}</Td>
                <Td>{dmy(r.date)}</Td>
                <Td>{r.signIn ?? ""}</Td>
                <Td>{r.signOut ?? ""}</Td>
                <Td>{hhmm(r.hours)}</Td>
                <Td>{r.status === "Leave" ? <Badge tone="amber">Leave</Badge> : r.status}</Td>
                <Td className="whitespace-normal text-xs">{r.remarks}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
