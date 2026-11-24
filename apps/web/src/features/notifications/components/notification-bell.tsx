"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useDB } from "@/lib/mock/store";
import { awaitsDecision, hiddenFromBell, markRead, unreadCount } from "../api";
import { RetakeDecisionDialog } from "@/features/assessment";
import { cn, timeAgo } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

export function NotificationBell({ userId }: { userId: string }) {
  const db = useDB();
  const router = useRouter();
  const toast = useToast();
  const [retakeId, setRetakeId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = db.notifications.filter((n) => n.recipientId === userId && !hiddenFromBell(db, n)).slice(0, 30);
  const unread = unreadCount(db, userId);
  const clearable = items.some((n) => !n.readAt && !awaitsDecision(db, n));

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 hover:bg-slate-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {clearable && (
              <button className="text-xs font-medium text-brand-600 hover:underline" onClick={() => markRead(userId)} title="Retake requests stay unread until you decide them">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50", !n.readAt && "bg-brand-50/50")}
                  onClick={() => {
                    setOpen(false);
                    // A retake request stays unread until the PM decides it in the pop-up.
                    if (n.requestId) return setRetakeId(n.requestId);
                    markRead(userId, n.id);
                    if (n.link) router.push(n.link);
                  }}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-500")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.title}</span>
                    <span className="block text-sm text-muted">{n.message}</span>
                    <span className="block text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {retakeId && <RetakeDecisionDialog db={db} pmId={userId} requestId={retakeId} onClose={() => setRetakeId(null)} onDone={(m, ok) => toast(m, ok ? "success" : "error")} />}
    </div>
  );
}
