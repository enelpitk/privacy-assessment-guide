export const LIFECYCLE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  IN_DPO_REVIEW: "In DPO review",
  CHANGES_REQUESTED: "Changes requested",
  AWAITING_OWNER_DECISION: "DPO review complete — awaiting owner decision",
  AWAITING_CONDITIONS: "Awaiting conditions",
  FINALISED: "Finalised",
  ARCHIVED: "Archived",
};

/** A finalised version whose latest owner decision is "Rejected" must never read as approved. */
export function lifecycleLabel(lifecycle: string, rejected = false): string {
  if (lifecycle === "FINALISED" && rejected) return "Finalised — Rejected";
  return LIFECYCLE_LABEL[lifecycle] ?? lifecycle;
}

/** True when the latest owner decision recorded for this version is a rejection. */
export function isVersionRejected(decisions: { versionId: string; decision: string; createdAt: Date | string }[], versionId: string): boolean {
  const mine = decisions.filter((d) => d.versionId === versionId);
  if (mine.length === 0) return false;
  const latest = mine.reduce((a, b) => (new Date(b.createdAt).getTime() >= new Date(a.createdAt).getTime() ? b : a));
  return latest.decision === "REJECTED";
}

export const SCREENING_LABEL: Record<string, string> = {
  NOT_SUBMITTED: "Screening not submitted",
  AWAITING_DPO: "Screening awaiting DPO review",
  DECIDED: "Screening decided",
  INVALIDATED: "Screening decision invalidated",
};

export const ROLE_LABEL: Record<string, string> = {
  OWNER: "Process owner",
  CONTRIBUTOR: "Contributor",
  DPO: "DPO",
  ADMIN: "Demo administrator",
};
