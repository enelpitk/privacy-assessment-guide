export const LIFECYCLE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  IN_DPO_REVIEW: "In DPO review",
  CHANGES_REQUESTED: "Changes requested",
  AWAITING_OWNER_DECISION: "DPO review complete — awaiting owner decision",
  AWAITING_CONDITIONS: "Awaiting conditions",
  FINALISED: "Finalised",
  ARCHIVED: "Archived",
};

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
