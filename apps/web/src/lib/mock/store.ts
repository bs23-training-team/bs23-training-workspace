"use client";

import { useSyncExternalStore } from "react";
import type { DB } from "@/lib/mock/types";
import { buildSeed, SEED_VERSION } from "@/lib/mock/seed";

// Browser-local mock database. Replaced by the NestJS API later; pages only use
// `useDB()` for reads and functions in `api.ts` for writes.

const KEY = "bs23-workspace-db";
let db: DB | null = null;
const listeners = new Set<() => void>();

function load(): DB {
  if (db) return db;
  if (typeof window === "undefined") return (db = buildSeed());
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === SEED_VERSION) return (db = parsed);
    }
  } catch {
    /* storage unavailable or corrupt: fall back to seed */
  }
  db = buildSeed();
  persist();
  return db;
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore quota / privacy mode errors */
  }
}

export function getDB(): DB {
  return load();
}

/** Apply a change on a copy, persist and notify subscribers. */
export function mutate(fn: (draft: DB) => void) {
  const next = structuredClone(load());
  fn(next);
  db = next;
  persist();
  listeners.forEach((l) => l());
}

export function resetDemoData() {
  const keepUser = load().currentUserId;
  const keepSession = load().currentSessionId;
  db = buildSeed();
  db.currentUserId = keepUser;
  db.currentSessionId = keepSession;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      db = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, load, load);
}
