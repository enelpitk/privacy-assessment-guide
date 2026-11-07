"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { canWorkflow, type WfAction } from "@/domain/workflow";
import type { ThreadView } from "@/lib/govTypes";
import type { PageData } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  data: Record<string, unknown> & { error?: string; details?: unknown };
}

/** POST a workflow or collaboration action. The server re-checks permissions and state. */
export async function postAction(assessmentId: string, body: Record<string, unknown>): Promise<ActionResult> {
  try {
    const res = await fetch(`/api/assessments/${assessmentId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "Network error: could not reach the server. Nothing was changed." } };
  }
}

interface CollabValue {
  threads: ThreadView[];
  reloadThreads: () => Promise<void>;
  unreviewed: Set<string>;
  markReviewed: (subsectionId: string) => void;
  can: (action: WfAction) => boolean;
}

const Ctx = createContext<CollabValue | null>(null);

export function CollabProvider({ page, children }: { page: PageData; children: ReactNode }) {
  const [threads, setThreads] = useState<ThreadView[]>(page.threads);
  const [unreviewed, setUnreviewed] = useState(() => new Set(page.unreviewed));
  const reloadThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/assessments/${page.assessment.id}/threads`, { cache: "no-store" });
      if (res.ok) setThreads(((await res.json()) as { threads: ThreadView[] }).threads);
    } catch {
      /* keep the current list */
    }
  }, [page.assessment.id]);
  const markReviewed = useCallback((id: string) => setUnreviewed((s) => new Set([...s].filter((x) => x !== id))), []);
  const can = useCallback((action: WfAction) => canWorkflow(page.actor, page.ctx, action).ok, [page.actor, page.ctx]);
  return <Ctx.Provider value={{ threads, reloadThreads, unreviewed, markReviewed, can }}>{children}</Ctx.Provider>;
}

export function useCollab(): CollabValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("CollabProvider missing");
  return v;
}

/** Run an action, then refresh server data. Returns an error message or null. */
export function useRunner(assessmentId: string) {
  const router = useRouter();
  return useCallback(
    async (body: Record<string, unknown>, opts: { refresh?: boolean } = {}): Promise<{ error: string | null; data: ActionResult["data"] }> => {
      const r = await postAction(assessmentId, body);
      if (!r.ok) return { error: r.data.error ?? "That did not work.", data: r.data };
      if (opts.refresh !== false) router.refresh();
      return { error: null, data: r.data };
    },
    [assessmentId, router],
  );
}
