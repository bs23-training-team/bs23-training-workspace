"use client";

import { type DB, type User, type IntegrationKey } from "@/lib/mock/types";


export function currentUser(db: DB): User | null {
  return db.users.find((u) => u.id === db.currentUserId) ?? null;
}

export function traineeOf(db: DB, userId: string) {
  return db.trainees.find((t) => t.userId === userId);
}

export function userById(db: DB, id?: string) {
  return db.users.find((u) => u.id === id);
}

export function nameOf(db: DB, id?: string) {
  return userById(db, id)?.name ?? "Unknown";
}

/** PM scope: only active (not archived) trainees managed by this PM (FR-DIR-07). */
export function pmTrainees(db: DB, pmId: string) {
  return db.trainees.filter((t) => t.pmId === pmId && !t.archivedAt);
}

/** Active and archived trainees managed by this PM, for views that also show finished trainees. */
export function pmPeople(db: DB, pmId: string) {
  return db.trainees.filter((t) => t.pmId === pmId);
}

/** Archived (inactive) trainees managed by this PM. */
export function pmArchivedTrainees(db: DB, pmId: string) {
  return db.trainees.filter((t) => t.pmId === pmId && !!t.archivedAt);
}

export function inScope(db: DB, pmId: string, traineeUserId: string) {
  return pmPeople(db, pmId).some((t) => t.userId === traineeUserId);
}

export function integration(db: DB, key: IntegrationKey) {
  return db.integrations.find((i) => i.key === key)!;
}
