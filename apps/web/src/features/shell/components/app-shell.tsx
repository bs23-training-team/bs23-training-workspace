"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardList,
  BookOpen,
  CalendarCheck,
  Trophy,
  ScrollText,
  Settings,
  Brain,
  Building2,
  Map,
  UserCircle,
  Menu,
  X,
  LogOut,
  RotateCcw,
  GraduationCap,
  Archive,
} from "lucide-react";
import { useDB, resetDemoData } from "@/lib/mock/store";
import { alertStaleOwnerApprovals } from "@/features/sprint";
import { archiveExpiredTrainees, PmSearch } from "@/features/directory";
import { currentUser } from "@/lib/mock/selectors";
import { homeFor, logout } from "@/features/auth";
import { latestEvaluation } from "@/features/assessment";
import type { Role } from "@/lib/mock/types";
import { NotificationBell } from "@/features/notifications";
import { cn, RESOURCE_LABEL } from "@/lib/utils";
import { Avatar, Loading } from "@/components/ui/ui";
import { ConfirmDialog } from "@/components/ui/dialog";

const PM_NAV = [
  { href: "/pm/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pm/users", label: "All Users", icon: Users },
  { href: "/pm/archive", label: "Archive", icon: Archive },
  { href: "/pm/daily-sprints", label: "Daily Sprints", icon: ClipboardList },
  { href: "/pm/courses", label: "Learning Roadmap", icon: BookOpen },
  { href: "/pm/reports", label: "Reports", icon: FileText },
  { href: "/pm/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/pm/gamification", label: "Gamification", icon: Trophy },
  { href: "/pm/policy", label: "Policy", icon: ScrollText },
  { href: "/pm/settings", label: "Settings", icon: Settings },
];

const TRAINEE_NAV = [
  { href: "/trainee/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trainee/skill-analysis", label: "Skill Analysis", icon: Brain },
  { href: "/trainee/reports", label: "Reports", icon: FileText },
  { href: "/trainee/erp", label: "ERP", icon: Building2 },
  { href: "/trainee/daily-sprint", label: "Daily Sprint", icon: ClipboardList },
  { href: "/trainee/roadmap", label: "Learning Roadmap", icon: Map },
  { href: "/trainee/gamification", label: "Gamification", icon: Trophy },
  { href: "/trainee/profile", label: "Profile & settings", icon: UserCircle },
];

export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const db = useDB();
  const user = currentUser(db);
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const archivedTrainee = !!user && user.role === "TRAINEE" && db.trainees.some((t) => t.userId === user.id && !!t.archivedAt);
  const gated = !!user && user.role === "TRAINEE" && !latestEvaluation(db, user.id);
  // First-login assessment: no sidebar or notifications until the trainee leaves the report.
  const myEvals = user ? db.evaluations.filter((e) => e.traineeUserId === user.id) : [];
  const firstAssessment = !!user && user.role === "TRAINEE" && pathname === "/trainee/onboarding" && myEvals.length === 1 && myEvals[0].createdAt >= (db.sessions.find((s) => s.id === db.currentSessionId)?.createdAt ?? "9");
  const hideNav = gated || firstAssessment;
  let redirect: string | null = null;
  if (!user) redirect = "/login";
  else if (user.role !== role) redirect = homeFor(user.id);
  else if (user.mustChangePassword) redirect = "/change-password";
  else if (gated && pathname !== "/trainee/onboarding") redirect = "/trainee/onboarding";

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  // Trainee periods that have ended move to the Archive; an archived trainee is signed out.
  // Runs on every page load for both roles, so a user is archived and signed out as soon as the departure date passes.
  useEffect(() => {
    archiveExpiredTrainees();
    if (role === "PM") alertStaleOwnerApprovals();
  }, [role, db]);
  useEffect(() => {
    if (!archivedTrainee) return;
    logout();
    router.replace("/login");
  }, [archivedTrainee, router]);

  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menu]);

  if (redirect || !user) return <Loading label="Redirecting…" />;

  const nav = role === "PM" ? PM_NAV : TRAINEE_NAV;
  const myProfile = user.role === "TRAINEE" ? db.trainees.find((t) => t.userId === user.id) : undefined;
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/") || (href === "/pm/users" && pathname.startsWith("/pm/trainees"));

  const signOut = () => {
    logout();
    router.replace("/login");
  };

  const sidebar = (
    <nav aria-label="Main navigation" className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <GraduationCap className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">BS23 Training</p>
          <p className="text-xs text-muted">{role === "PM" ? "PM Administrator" : "User workspace"}</p>
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 px-3">
        {nav.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              onClick={() => setOpen(false)}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium", isActive(href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-ink")}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-5 py-4 text-xs text-muted">A space to learn. A place to grow.</p>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {!hideNav && <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-white lg:block">{sidebar}</aside>}
      {open && !hideNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button className="absolute right-3 top-4 rounded p-1" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          {!hideNav && (
            <button className="rounded-md p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
          )}
          {hideNav && <span className="text-sm font-semibold">BS23 Training Workspace</span>}
          {role === "PM" && !hideNav && <PmSearch userId={user.id} />}
          <div className="flex-1" />
          {!hideNav && <NotificationBell userId={user.id} />}
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100" aria-haspopup="menu" aria-expanded={menu}>
              <Avatar name={user.name} src={user.photoUrl} size={32} />
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-medium leading-tight">{user.name}</span>
                <span className="block text-xs text-muted">{user.role === "PM" ? "PM" : myProfile ? `${RESOURCE_LABEL[myProfile.resource]} · ${myProfile.traineeId}` : ""}</span>
              </span>
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-white p-1 shadow-lg">
                <Link role="menuitem" href={role === "PM" ? "/pm/settings" : "/trainee/profile"} onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                  <Settings className="h-4 w-4" /> Settings
                </Link>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setConfirmReset(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <RotateCcw className="h-4 w-4" /> Reset demo data
                </button>
                <button role="menuitem" onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <ConfirmDialog open={confirmReset} danger title="Reset demo data?" message="Every change made in this browser (users, sprints, reports, XP and more) is replaced with the original demo data. This cannot be undone." confirmLabel="Reset demo data" onConfirm={resetDemoData} onClose={() => setConfirmReset(false)} />
      </div>
    </div>
  );
}
