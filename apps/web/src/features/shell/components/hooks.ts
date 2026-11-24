"use client";

import { useEffect } from "react";
import { useDB } from "@/lib/mock/store";
import { currentUser } from "@/lib/mock/selectors";

/** Current DB snapshot and signed-in user. Pages render inside AppShell, so `user` is set. */
export function useMe() {
  const db = useDB();
  const user = currentUser(db)!;
  return { db, user };
}

/** Browser leave warning while there are unsaved edits (SRS §4 data integrity). */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}
