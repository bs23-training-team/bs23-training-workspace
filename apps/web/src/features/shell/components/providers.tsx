"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { Loading } from "@/components/ui/ui";

const subscribe = () => () => {};

/** Client-only gate: the mock store lives in localStorage, so render after hydration. */
export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  return <ToastProvider>{mounted ? children : <Loading label="Loading workspace…" />}</ToastProvider>;
}
