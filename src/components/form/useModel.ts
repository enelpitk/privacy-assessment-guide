"use client";

import { buildModel, type RecordRow } from "@/domain/model";
import { useStoreCtx, useStoreRev } from "./context";

/** Live model of the current (possibly unsaved) answers. Re-evaluated whenever the store changes. */
export function useModel() {
  const { store } = useStoreCtx();
  useStoreRev(store);
  const rows: RecordRow[] = store.records.map((r) => ({
    id: r.id,
    collection: r.collection,
    parentId: r.parentId,
    ordering: r.ordering,
  }));
  return buildModel(store.responses(), rows, store.path);
}
