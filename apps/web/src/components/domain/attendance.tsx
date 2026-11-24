"use client";

import type { AttendanceRecord, DB, MeetingAttendance } from "@/lib/types";
import { Badge, SourceBadge, Table, Td } from "@/components/ui/ui";
import { addDays, formatDay, isWeekend } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Office attendance rows for a date range. A day with no ERP record is shown as
 * "Unavailable" — never absent or zero hours (FR-ATT-03).
 */
export function OfficeAttendanceTable({ db, traineeIds, from, to, showName, action }: { db: DB; traineeIds: string[]; from: string; to: string; showName?: boolean; action?: (rec: AttendanceRecord | undefined, traineeUserId: string, date: string) => ReactNode }) {
  const rows: { tid: string; date: string; rec?: AttendanceRecord }[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) {
    if (isWeekend(d)) continue;
    for (const tid of traineeIds) {
      const tr = db.trainees.find((t) => t.userId === tid);
      if (!tr || d < tr.onboardDate) continue;
      rows.push({ tid, date: d, rec: db.attendance.find((a) => a.traineeUserId === tid && a.date === d) });
    }
  }
  const head = [...(showName ? ["User"] : []), "Date", "Entry", "Exit", "Late", "Working hours", "Status / source", ...(action ? [""] : [])];
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">No working days in this range.</p>;
  return (
    <Table head={head}>
      {rows.map(({ tid, date, rec }) => {
        const tr = db.trainees.find((t) => t.userId === tid)!;
        return (
          <tr key={tid + date}>
            {showName && <Td className="font-medium">{db.users.find((u) => u.id === tid)?.name}</Td>}
            <Td>{formatDay(date)}</Td>
            {rec ? (
              <>
                <Td>{rec.entry ?? "Unknown"}</Td>
                <Td>{rec.exit ?? <Badge tone="gray">Unknown</Badge>}</Td>
                <Td>{rec.lateMinutes ? <Badge tone="amber">{rec.lateMinutes} min</Badge> : "On time"}</Td>
                <Td>{rec.hours != null ? `${rec.hours} h` : <Badge tone="gray">Unknown</Badge>}</Td>
                <Td>
                  <SourceBadge source={rec.source === "PM_ENTERED" ? "PM-entered" : "sample"} />
                </Td>
              </>
            ) : (
              <>
                <Td className="text-muted" colSpan={4}>
                  {tr.attendanceMode === "ONLINE" ? "Online user — office attendance not expected" : "No ERP record for this day"}
                </Td>
                <Td>
                  <SourceBadge source="unavailable" />
                </Td>
              </>
            )}
            {action && <Td>{action(rec, tid, date)}</Td>}
          </tr>
        );
      })}
    </Table>
  );
}

/** Teams meeting punctuality; a pending meeting report is not an absence (FR-ATT-02). */
export function MeetingAttendanceTable({ db, rows, showName, action }: { db: DB; rows: MeetingAttendance[]; showName?: boolean; action?: (m: MeetingAttendance) => ReactNode }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">No Teams meeting records in this range.</p>;
  return (
    <Table head={[...(showName ? ["User / identity"] : []), "Meeting", "Scheduled start", "First join", "Intervals (merged)", "Duration", "Late", "Status", ...(action ? [""] : [])]}>
      {rows.map((m) => (
        <tr key={m.id}>
          {showName && <Td className="font-medium">{m.traineeUserId ? db.users.find((u) => u.id === m.traineeUserId)?.name : <span className="text-xs text-red-700">{m.teamsIdentity}</span>}</Td>}
          <Td>{m.meeting}</Td>
          <Td>
            {formatDay(m.scheduledStart.slice(0, 10))} {m.scheduledStart.slice(11, 16)}
          </Td>
          <Td>{m.firstJoin ? m.firstJoin.slice(11, 16) : "—"}</Td>
          <Td>{m.intervals.length ? m.intervals.map((i) => `${i.join}–${i.leave}`).join(", ") : "—"}</Td>
          <Td>{m.durationMinutes != null ? `${m.durationMinutes} min` : "—"}</Td>
          <Td>{m.lateMinutes != null ? (m.lateMinutes ? `${m.lateMinutes} min` : "On time") : "—"}</Td>
          <Td>
            <Badge tone={m.status === "ATTENDED" ? "green" : m.status === "UNMAPPED" ? "red" : "gray"}>{m.status === "REPORT_PENDING" ? "Report pending (not absence)" : m.status === "UNMAPPED" ? "Unmapped identity" : "Attended"}</Badge>
          </Td>
          {action && <Td>{action(m)}</Td>}
        </tr>
      ))}
    </Table>
  );
}
