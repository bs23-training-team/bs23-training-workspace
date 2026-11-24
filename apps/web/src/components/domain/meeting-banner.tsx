"use client";

import { Video } from "lucide-react";
import type { DB } from "@/lib/types";
import { traineeOf } from "@/lib/api";
import { formatDay, todayISO } from "@/lib/utils";

/** DS meeting banner for trainees in the meeting's team (FR-DS-08). */
export function MeetingBanner({ db, userId }: { db: DB; userId: string }) {
  const t = traineeOf(db, userId);
  const today = todayISO();
  const upcoming = db.dsMeetings
    .filter((m) => m.date >= today && (m.teamId === "ALL" || t?.teamIds.includes(m.teamId)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  if (!upcoming) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <Video className="h-5 w-5 text-brand-600" aria-hidden />
      <span>
        <strong>{upcoming.title}</strong> — {upcoming.date === today ? "today" : formatDay(upcoming.date)} at {upcoming.time}
      </span>
      {upcoming.teamsLink && (
        <a href={upcoming.teamsLink} target="_blank" rel="noreferrer" className="ml-auto inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
          Join in Teams
        </a>
      )}
    </div>
  );
}
