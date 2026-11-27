"use client";

// Reads for the gamification-core screens, with the three states a screen shows: loading, error, data.
// After a change (see ./api), call `reload()` on every read the change touches.

import { useCallback, useEffect, useState } from "react";
import { errorText, getAllMyXpEvents, getAllXpEvents, getLevels, getMyBadges, getMyGrowth, getPmBadges, getPmGrowthSummary, getXpEvents, getXpRules } from "./api";

export type Loaded<T> = {
  /** The last answer. It stays while a reload is running, and when a reload fails. */
  data: T | undefined;
  /** The API's message when the latest read failed. */
  error: string | null;
  loading: boolean;
  reload: () => void;
};

/** `read` must be the same function on every render (a function declared outside the component). */
function useRead<T>(read: () => Promise<T>): Loaded<T> {
  const [version, setVersion] = useState(0);
  const [answer, setAnswer] = useState<{ version: number; data?: T; error: string | null }>({ version: -1, error: null });

  useEffect(() => {
    let outdated = false; // a newer read, or leaving the page, wins over this answer
    read().then(
      (data) => {
        if (!outdated) setAnswer({ version, data, error: null });
      },
      (e: unknown) => {
        if (!outdated) setAnswer((last) => ({ version, data: last.data, error: errorText(e) }));
      },
    );
    return () => {
      outdated = true;
    };
  }, [read, version]);

  // Next.js keeps a visited page with its state and shows it again, perhaps to another account: forget the answer
  // when the page is left.
  useEffect(() => () => setAnswer({ version: -1, error: null }), []);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const loading = answer.version !== version;
  return { data: answer.data, error: loading ? null : answer.error, loading, reload };
}

// ---------- A user's own records ----------

export const useMyGrowth = () => useRead(getMyGrowth);

export const useMyXpEvents = () => useRead(getAllMyXpEvents);

export const useMyBadges = () => useRead(getMyBadges);

// ---------- Levels and rules ----------

export const useLevels = () => useRead(getLevels);

export const useXpRules = () => useRead(getXpRules);

// ---------- PM ----------

const readWaitingXp = () => getAllXpEvents({ status: "PENDING,HELD" });

/** The review queue: every pending and held event, for every user. Show the buttons only when `managedByYou`. */
export const useWaitingXp = () => useRead(readWaitingXp);

const readAwardedXp = () => getXpEvents({ status: "AWARDED" });

/** The newest awarded events (the first page only), for "Recently awarded". */
export const useAwardedXp = () => useRead(readAwardedXp);

export const usePmGrowthSummary = () => useRead(getPmGrowthSummary);

export const usePmBadges = () => useRead(getPmBadges);
