"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { PageData } from "@/lib/types";
import type { AssessmentStore } from "./store";

export interface StoreCtxValue {
  store: AssessmentStore;
  page: PageData;
  /** Flushes pending saves, warns if they failed, remembers open items, then navigates. */
  navigate: (href: string) => Promise<void>;
}

export const StoreCtx = createContext<StoreCtxValue | null>(null);

export function useStoreCtx(): StoreCtxValue {
  const v = useContext(StoreCtx);
  if (!v) throw new Error("StoreCtx missing");
  return v;
}

/** Subscribe to store changes; returns a counter that changes whenever the store does. */
export function useStoreRev(store: AssessmentStore): number {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
