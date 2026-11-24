"use client";

import { type DB } from "@/lib/mock/types";
import { uid } from "@/lib/utils";


export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export const ok = <T,>(data?: T): Result<T> => ({ ok: true, data });

export const fail = (error: string): Result<never> => ({ ok: false, error });

export const nowIso = () => new Date().toISOString();

export function notify(d: DB, recipientId: string, type: string, title: string, message: string, link?: string, requestId?: string) {
  d.notifications.unshift({ id: uid("n"), recipientId, type, title, message, link, ...(requestId ? { requestId } : {}), createdAt: nowIso() });
}
