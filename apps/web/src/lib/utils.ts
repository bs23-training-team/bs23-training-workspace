
import type { Position, AttendanceMode, Resource } from "@/lib/mock/types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

/* ---------- dates (organisation-wide local time; SRS §4 time handling) ---------- */

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function parseISODate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Same day-of-month `n` months later (clamped to the month's last day). */
export function addMonths(iso: string, n: number) {
  const d = parseISODate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISODate(d);
}

/** Week starts Monday (FR-DS-04). */
export function weekStartOf(iso: string) {
  const d = parseISODate(iso);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return toISODate(d);
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000);
}

export function isWeekend(iso: string) {
  const d = parseISODate(iso).getDay();
  return d === 5 || d === 6; // Fri/Sat weekend (PRD FR-ATT-08)
}

export function formatDate(iso?: string) {
  if (!iso) return "—";
  return parseISODate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDay(iso: string) {
  return parseISODate(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function formatDateTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ---------- labels ---------- */

export const POSITION_LABEL: Record<Position, string> = {
  FRONTEND: "Frontend Developer",
  BACKEND: "Backend Developer",
  FULLSTACK: "Full-Stack Developer",
  QA: "Quality Assurance",
};

export const RESOURCE_LABEL: Record<Resource, string> = {
  TRAINEE: "Trainee",
  CENTRAL_RND: "Central RND",
  INDUSTRIAL_ATTACHMENT: "Industrial Attachment",
  SBU: "SBU",
};

export const MODE_LABEL: Record<AttendanceMode, string> = {
  PHYSICAL: "Physical",
  ONLINE: "Online",
};

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

export function isHttpsUrl(u: string) {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

export function isEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Tenure in calendar days (FR-DIR-02). */
export function tenureLabel(onboardDate: string) {
  const d = daysBetween(onboardDate, todayISO());
  if (d < 0) return "Not onboarded yet";
  return `Day ${d + 1}`;
}
