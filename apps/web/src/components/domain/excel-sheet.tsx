"use client";

import { Fragment, useState } from "react";
import { History } from "lucide-react";
import type { DSCell, DSColumn } from "@/lib/types";
import { Button } from "@/components/ui/ui";
import { cn, formatDate, parseISODate } from "@/lib/utils";

export const DS_DAY_COLS: { col: Exclude<DSColumn, "PLAN">; label: string }[] = [
  { col: "YESTERDAY", label: "What I did Yesterday" },
  { col: "HOURS", label: "Spent Hours" },
  { col: "TODAY", label: "What I will do Today" },
  { col: "BLOCKERS", label: "Blockers" },
];

/** A, B, … Z, AA, AB … (spreadsheet column letters). */
export const columnLetters = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : columnLetters(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

/** "02 Nov 2026 (Monday)" — day-header band text and XLSX header. */
export const dayBandLabel = (iso: string) => `${formatDate(iso)} (${parseISODate(iso).toLocaleDateString("en-GB", { weekday: "long" })})`;

export const weekTabLabel = (weekStart: string, addDays: (iso: string, n: number) => string) => {
  const short = (iso: string) => parseISODate(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${short(weekStart)} – ${short(addDays(weekStart, 6))}`;
};

export interface SheetMember {
  userId: string;
  name: string;
  traineeId: string;
}

export interface CellState {
  value: string;
  cell?: DSCell;
  dirty: boolean;
  disabled: boolean;
}

const BLUE = "bg-[#0074b7] text-white";
const LETTER = "border-b border-r border-[#d9dde1] bg-[#f3f4f5] text-center text-[10px] font-normal text-[#7a838a]";
const GRID = "border-b border-r border-[#c3cbd3]";

/**
 * Excel-style team sprint sheet (title bar, formula bar, lettered columns, numbered rows,
 * week tabs and a statistics footer). Purely presentational: the page owns the data and saving.
 */
export function ExcelSheet({
  teamName,
  members,
  days,
  weekStart,
  today,
  stateOf,
  onEdit,
  onHistory,
  weekTabs,
  onSelectWeek,
  onAddSprint,
  rangeLabel,
  statusLabel,
}: {
  teamName: string;
  members: SheetMember[];
  days: string[];
  weekStart: string;
  today: string;
  stateOf: (userId: string, date: string, col: DSColumn) => CellState;
  onEdit: (userId: string, date: string, col: DSColumn, value: string) => void;
  onHistory: (cell: DSCell) => void;
  weekTabs: { weekStart: string; label: string }[];
  onSelectWeek: (weekStart: string) => void;
  onAddSprint: () => void;
  rangeLabel: string;
  statusLabel: string;
}) {
  const [selected, setSelected] = useState<{ address: string; value: string } | null>(null);
  // Column 0 = Name (A), 1 = Sprint Plan Tasks (B), then 4 columns per day.
  const colCount = 2 + days.length * 4;
  const widthOf = (col: DSColumn) => (col === "HOURS" ? "w-20" : col === "PLAN" ? "w-60" : "w-64");

  const cellAt = (m: SheetMember, mi: number, date: string, col: DSColumn, colIndex: number) => {
    const st = stateOf(m.userId, date, col);
    const address = `${columnLetters(colIndex)}${mi * 2 + 3}`;
    const label = col === "PLAN" ? "sprint plan" : `${dayBandLabel(date)} ${DS_DAY_COLS.find((c) => c.col === col)?.label}`;
    return (
      <td key={`${date}|${col}`} className={cn("relative p-0 align-top", GRID, col === "YESTERDAY" && "border-l-4 border-l-[#7030a0]", st.dirty ? "bg-amber-50" : "bg-white")}>
        <textarea
          aria-label={`${m.name} ${label}`}
          className={cn(
            "block min-h-28 resize-none bg-transparent px-2 py-2 text-[12px] leading-relaxed text-[#101c36] focus:bg-white focus:outline-2 focus:-outline-offset-2 focus:outline-[#159861] disabled:cursor-not-allowed disabled:bg-slate-50",
            widthOf(col),
            col === "HOURS" && "text-center font-bold",
            col === "BLOCKERS" && "text-[#cf4661]",
          )}
          value={st.value}
          disabled={st.disabled}
          onFocus={() => setSelected({ address, value: st.value })}
          onChange={(e) => {
            onEdit(m.userId, date, col, e.target.value);
            setSelected({ address, value: e.target.value });
          }}
        />
        {st.cell && (
          <button
            className="absolute bottom-0.5 right-0.5 rounded p-0.5 text-slate-400 hover:text-ink"
            aria-label="View cell history"
            title="Original author and edit history"
            onClick={() => onHistory(st.cell!)}
          >
            <History className="h-3 w-3" />
          </button>
        )}
      </td>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[#cbd3d9] bg-white">
      <div className="flex items-center gap-3 border-b border-[#d6dde3] bg-[#f5f6f7] px-4 py-3 text-xs text-[#3c4c5a]">
        <span aria-hidden className="rounded bg-[#168449] px-2 py-1 text-sm font-bold text-white">
          X
        </span>
        <strong className="text-[12px]">SPRINT PLAN &amp; DAILY SCRUM</strong>
        <span>— {teamName}</span>
        <span className="ml-auto">Editing</span>
      </div>

      <div className="flex min-h-9 items-center gap-3 overflow-hidden whitespace-nowrap border-b border-[#cbd3d9] px-3 py-2 text-xs" role="status" aria-live="polite">
        <span className="min-w-28 border border-[#d1d8df] px-2 py-1">{selected?.address ?? "Select a cell"}</span>
        <strong className="italic" aria-label="Formula">
          fx
        </strong>
        <span className="truncate text-[#3c4c5a]">{selected ? selected.value || "(empty)" : `Sprint plan and daily updates • ${rangeLabel}`}</span>
      </div>

      <div className="max-h-[640px] overflow-auto">
        <table className="border-separate border-spacing-0 text-[12px]" style={{ fontFamily: "Arial, sans-serif" }}>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className={cn(LETTER, "sticky left-0 z-30 h-5 w-9 min-w-9")} aria-hidden />
              {Array.from({ length: colCount }, (_, i) => (
                <th key={i} scope="col" className={cn(LETTER, "h-5", i === 0 && "sticky left-9 z-30 w-44 min-w-44")}>
                  {columnLetters(i)}
                </th>
              ))}
            </tr>
            <tr>
              <th scope="row" className={cn(LETTER, "sticky left-0 z-30 h-7")}>
                1
              </th>
              <th scope="col" className={cn(BLUE, GRID, "sticky left-9 z-30 px-2 py-1.5 text-left text-[11px] font-medium")}>
                Name
              </th>
              <th scope="col" className={cn(BLUE, GRID, "px-2 py-1.5 text-left text-[11px] font-medium")}>
                Sprint Plan Tasks
              </th>
              {days.map((d) => (
                <th key={d} scope="colgroup" colSpan={4} className={cn(GRID, "border-r-4 border-r-[#7030a0] px-2 py-1.5 text-center text-[11px] font-medium text-[#152340]", d === today ? "bg-[#ffd400]" : "bg-[#fff000]")}>
                  {dayBandLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m, mi) => (
              <Fragment key={m.userId}>
                <tr>
                  <th scope="row" className={cn(LETTER, "sticky left-0 z-10 h-9")}>
                    {mi * 2 + 2}
                  </th>
                  <th className={cn(BLUE, GRID, "sticky left-9 z-10")} />
                  <th className={cn(BLUE, GRID)} />
                  {days.flatMap((d) =>
                    DS_DAY_COLS.map((c) => (
                      <th key={d + c.col} scope="col" className={cn(BLUE, GRID, "px-2 py-2 text-left text-[11px] font-medium", c.col === "YESTERDAY" && "border-l-4 border-l-[#7030a0]", c.col === "HOURS" && "text-center")}>
                        {c.label}
                      </th>
                    )),
                  )}
                </tr>
                <tr>
                  <th scope="row" className={cn(LETTER, "sticky left-0 z-10")}>
                    {mi * 2 + 3}
                  </th>
                  <th scope="row" className={cn(GRID, "sticky left-9 z-10 w-44 min-w-44 bg-[#c0e7f2] px-2 py-2 text-left text-[12px] font-normal text-[#101c36]")}>
                    {m.name}
                    <span className="block text-[10px] text-[#3c4c5a]">{m.traineeId}</span>
                  </th>
                  {cellAt(m, mi, weekStart, "PLAN", 1)}
                  {days.flatMap((d, di) => DS_DAY_COLS.map((c, ci) => cellAt(m, mi, d, c.col, 2 + di * 4 + ci)))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div role="tablist" aria-label="Sprint weeks" className="flex items-center gap-1.5 overflow-x-auto border-t border-[#cbd3d9] bg-[#f4f5f7] px-3 py-2">
        {weekTabs.map((w) => (
          <button
            key={w.weekStart}
            role="tab"
            aria-selected={w.weekStart === weekStart}
            onClick={() => onSelectWeek(w.weekStart)}
            className={cn("whitespace-nowrap rounded-sm px-3.5 py-2 text-xs", w.weekStart === weekStart ? "border-b-[3px] border-[#23864c] bg-white text-[#13375c]" : "bg-[#092d67] text-white hover:bg-[#0c3b85]")}
          >
            {w.label}
          </button>
        ))}
        <Button size="sm" variant="ghost" className="whitespace-nowrap text-[#54667a]" onClick={onAddSprint}>
          + Add Sprint
        </Button>
      </div>

      <div className="flex flex-wrap justify-between gap-3 border-t border-[#e1e5e9] bg-[#fafbfd] px-3 py-2 text-[11px] text-[#7b8996]">
        <span>
          Workbook Statistics &nbsp;•&nbsp; {statusLabel}
        </span>
        <span>
          7 days &nbsp;•&nbsp; {rangeLabel}
        </span>
      </div>
    </div>
  );
}
