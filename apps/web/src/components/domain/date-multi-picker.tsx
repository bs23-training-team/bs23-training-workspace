"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, cn, parseISODate, toISODate, weekStartOf } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month calendar where several dates can be toggled on and off. Dates after `max` are disabled. */
export function DateMultiPicker({ selected, onChange, max }: { selected: string[]; onChange: (dates: string[]) => void; max: string }) {
  const [month, setMonth] = useState(max.slice(0, 7)); // YYYY-MM
  const first = `${month}-01`;
  const gridStart = weekStartOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const shiftMonth = (n: number) => {
    const d = parseISODate(first);
    d.setMonth(d.getMonth() + n);
    setMonth(toISODate(d).slice(0, 7));
  };
  const toggle = (d: string) => onChange(selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d].sort());
  const title = parseISODate(first).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="w-full max-w-sm rounded-xl border border-line p-3" role="group" aria-label="Choose dates">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold" aria-live="polite">
          {title}
        </p>
        <button type="button" className="rounded-lg p-1.5 hover:bg-slate-100 disabled:text-slate-300" aria-label="Next month" disabled={month >= max.slice(0, 7)} onClick={() => shiftMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted" aria-hidden>
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const inMonth = d.startsWith(month);
          const on = selected.includes(d);
          const disabled = d > max;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              aria-label={parseISODate(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              onClick={() => toggle(d)}
              className={cn(
                "h-9 rounded-lg text-sm transition-colors",
                on ? "bg-brand-600 font-semibold text-white" : inMonth ? "text-ink hover:bg-brand-50" : "text-slate-300 hover:bg-slate-50",
                disabled && "cursor-not-allowed text-slate-300 hover:bg-transparent",
                d === max && !on && "ring-1 ring-brand-200",
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
