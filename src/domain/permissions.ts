// Central permission checks (architecture.md section 4). Pure; evaluated on the server for every save.

export type Role = "OWNER" | "CONTRIBUTOR" | "DPO" | "ADMIN";
export type Lifecycle =
  | "DRAFT"
  | "IN_DPO_REVIEW"
  | "CHANGES_REQUESTED"
  | "AWAITING_OWNER_DECISION"
  | "AWAITING_CONDITIONS"
  | "FINALISED"
  | "ARCHIVED";
export type ScreeningStatus =
  | "NOT_SUBMITTED"
  | "AWAITING_DPO"
  | "DECIDED"
  | "INVALIDATED";
export type ChangeClass = "SUBSTANTIVE" | "PROGRESS" | "ADMINISTRATIVE";
export type WorkflowOwner =
  | "dpo-screening"
  | "dpo-review"
  | "owner-decision"
  | "system";

export interface Actor {
  id: string;
  roles: Role[];
}

export interface AccessCtx {
  ownerId: string;
  assignedDpoId: string;
  lifecycle: Lifecycle;
  screeningStatus: ScreeningStatus;
  /** Subsection ids in the actor's ACTIVE (pending / in progress) assignments. */
  assignedSubsections: string[];
  /** True if the actor has any assignment on this assessment (any status). */
  isAssignee: boolean;
  sharedViewer: boolean;
}

export type Decision = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Decision => ({ ok: false, reason });
const yes: Decision = { ok: true };

export function isOwner(actor: Actor, ctx: AccessCtx) {
  return actor.id === ctx.ownerId;
}

/** Owners and Contributors see only assessments they own or are assigned/shared; DPOs see all. */
export function canView(actor: Actor, ctx: AccessCtx): boolean {
  if (actor.id === ctx.ownerId) return true;
  if (actor.roles.includes("DPO")) return true;
  if (ctx.isAssignee || ctx.sharedViewer) return true;
  return false;
}

export function canCreateAssessment(actor: Actor): Decision {
  return actor.roles.includes("OWNER") ? yes : no("Only process owners can create assessments.");
}

/** An owner can never be the assigned DPO of their own assessment. */
export function isEligibleDpo(candidate: { id: string; roles: Role[] }, ownerId: string) {
  return candidate.roles.includes("DPO") && candidate.id !== ownerId;
}

const EDITABLE_LIFECYCLES: Lifecycle[] = ["DRAFT", "CHANGES_REQUESTED"];
const PROGRESS_LIFECYCLES: Lifecycle[] = [
  "DRAFT",
  "CHANGES_REQUESTED",
  "AWAITING_OWNER_DECISION",
  "AWAITING_CONDITIONS",
  "FINALISED",
];
const SCREENING_STAGES = ["A", "B", "C"];

export interface FieldPerm {
  id: string;
  changeClass: ChangeClass;
  workflow?: WorkflowOwner;
  computed?: boolean;
}

export function canEditField(
  actor: Actor,
  ctx: AccessCtx,
  field: FieldPerm,
  subsectionId: string,
): Decision {
  if (!canView(actor, ctx)) return no("You do not have access to this assessment.");
  if (field.workflow || field.computed) {
    return no("This item is recorded through the review workflow, not edited directly.");
  }
  if (ctx.lifecycle === "ARCHIVED") return no("Archived assessments are read-only.");

  const owner = actor.id === ctx.ownerId;
  const contributor =
    !owner && ctx.assignedSubsections.includes(subsectionId);

  if (!owner && !contributor) {
    return no(
      actor.roles.includes("DPO")
        ? "DPO users read and comment; they do not edit owner answers."
        : "You can edit only subsections assigned to you.",
    );
  }

  if (field.changeClass === "ADMINISTRATIVE") {
    return owner ? yes : no("Only the owner can change this.");
  }

  if (field.changeClass === "PROGRESS") {
    return PROGRESS_LIFECYCLES.includes(ctx.lifecycle)
      ? yes
      : no("Progress updates are not allowed in the current review state.");
  }

  // SUBSTANTIVE
  if (!EDITABLE_LIFECYCLES.includes(ctx.lifecycle)) {
    return no("Substantive editing is locked in the current review state.");
  }
  const stage = subsectionId.charAt(0);
  if (
    SCREENING_STAGES.includes(stage) &&
    (ctx.screeningStatus === "AWAITING_DPO" || ctx.screeningStatus === "DECIDED")
  ) {
    return no("The submitted screening sections are locked.");
  }
  return yes;
}

/** Structural changes (add, delete, reorder records) follow the same rule as editing inside the subsection. */
export function canChangeRecords(
  actor: Actor,
  ctx: AccessCtx,
  subsectionId: string,
): Decision {
  return canEditField(
    actor,
    ctx,
    { id: "structure", changeClass: "SUBSTANTIVE" },
    subsectionId,
  );
}

/** Owner only: deleting an entity, or renaming one that is referenced outside the actor's editable scope. */
export function canManageEntity(
  actor: Actor,
  ctx: AccessCtx,
  action: "create" | "rename" | "delete",
  referencedSubsections: string[],
): Decision {
  if (!canView(actor, ctx)) return no("You do not have access to this assessment.");
  if (ctx.lifecycle === "ARCHIVED") return no("Archived assessments are read-only.");
  if (!EDITABLE_LIFECYCLES.includes(ctx.lifecycle)) {
    return no("Substantive editing is locked in the current review state.");
  }
  const owner = actor.id === ctx.ownerId;
  if (owner) return yes;
  if (action === "delete") return no("Only the owner can delete a shared entry.");
  if (!ctx.assignedSubsections.length) return no("You can edit only subsections assigned to you.");
  if (action === "create") return yes;
  const outside = referencedSubsections.filter((s) => !ctx.assignedSubsections.includes(s));
  return outside.length === 0
    ? yes
    : no("This entry is used outside your assigned sections; ask the owner to change it.");
}
