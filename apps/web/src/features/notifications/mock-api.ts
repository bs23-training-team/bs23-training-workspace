"use client";

import { type DB } from "@/lib/mock/types";
import { ALWAYS_SHOWN_CATEGORIES } from "@/lib/mock/content";
import { mutate } from "@/lib/mock/store";
import { nowIso } from "@/lib/mock/core";


/** True when the recipient has unticked this notification's category in Settings → Notifications (it is then kept out of the bell). */
export function hiddenFromBell(db: DB, n: { recipientId: string; type: string }) {
  if (ALWAYS_SHOWN_CATEGORIES.includes(n.type)) return false;
  return db.notificationPrefs.find((p) => p.userId === n.recipientId && p.category === n.type)?.showInBell === false;
}

export function unreadCount(db: DB, userId: string) {
  return db.notifications.filter((n) => n.recipientId === userId && !n.readAt && !hiddenFromBell(db, n)).length;
}

/** A retake-request notification stays unread until its request is decided (FR-NOT-02). */
export function awaitsDecision(db: DB, n: { requestId?: string }) {
  return !!n.requestId && db.retakeRequests.some((r) => r.id === n.requestId && r.status === "PENDING");
}

/** Marks one notification read, or every one ("Mark all read") except retake requests still awaiting a decision. */
export function markRead(userId: string, id?: string) {
  mutate((d) => {
    d.notifications.forEach((n) => {
      if (n.recipientId !== userId || n.readAt || hiddenFromBell(d, n)) return;
      if (id ? n.id === id : !awaitsDecision(d, n)) n.readAt = nowIso();
    });
  });
}

/** Ticks or unticks a category: ticked notifications appear in the bell. A retake request cannot be hidden. */
export function setNotificationPref(userId: string, category: string, showInBell: boolean) {
  if (ALWAYS_SHOWN_CATEGORIES.includes(category)) return;
  mutate((d) => {
    const p = d.notificationPrefs.find((x) => x.userId === userId && x.category === category);
    if (p) p.showInBell = showInBell;
    else d.notificationPrefs.push({ userId, category, showInBell });
  });
}
