// Review workflow rules (docs/architecture.md section 6, docs/template-rules.md WF-*). Pure: no database access.
// A workflow decision is a recorded human decision, not a software certification of lawfulness.
import type { AccessCtx, Actor, Decision, Lifecycle, ScreeningStatus } from "./permissions";
import type { AssessmentResult, Gap } from "./model";

export type Path = "OPEN" | "FULL" | "PRE_ONLY";
export type OpinionCategory = "NO_OBJECTIONS" | "RECOMMENDATIONS" | "OBJECTIONS_REMAIN";
export type OwnerDecisionKind = "APPROVED" | "CONDITIONALLY_APPROVED" | "REJECTED";
export type ScreeningDecisionKind = "PROCEED_FULL" | "PRE_ASSESSMENT_SUFFICIENT";

export type WfAction =
  | "submitScreening"
  | "withdrawScreening"
  | "reopenScreening"
  | "recordScreeningDecision"
  | "submitFull"
  | "withdrawFull"
  | "requestChanges"
  | "submitOpinion"
  | "amendOpinion"
  | "raiseBlocking"
  | "resolveBlocking"
  | "respondBlocking"
  | "ownerDecision"
  | "confirmCondition"
  | "recordProgress"
  | "reopenForChanges"
  | "startRevision"
  | "archive"
  | "restore"
  | "deleteDraft"
  | "transferOwnership"
  | "reassignDpo"
  | "createAssignment"
  | "updateAssignment"
  | "setAssignmentStatus"
  | "grantAccess"
  | "revokeAccess"
  | "addComment"
  | "resolveThread"
  | "reopenThread"
  | "confirmReviewed";

export interface WfState {
  lifecycle: Lifecycle;
  screeningStatus: ScreeningStatus;
  path: Path;
  everSubmitted: boolean;
  openBlocking: number;
  /** Category of the latest (non-superseded) formal opinion on the current version, if any. */
  latestOpinion: OpinionCategory | null;
}

const no = (reason: string): Decision => ({ ok: false, reason });
const yes: Decision = { ok: true };

export interface Roles {
  owner: boolean;
  assignedDpo: boolean;
  otherDpo: boolean;
  assignee: boolean;
  admin: boolean;
}

export function rolesOf(actor: Actor, ctx: AccessCtx): Roles {
  const owner = actor.id === ctx.ownerId;
  const dpoRole = actor.roles.includes("DPO");
  return {
    owner,
    // An owner can never act as the DPO of their own assessment.
    assignedDpo: !owner && dpoRole && actor.id === ctx.assignedDpoId,
    otherDpo: !owner && dpoRole && actor.id !== ctx.assignedDpoId,
    assignee: ctx.isAssignee,
    admin: actor.roles.includes("ADMIN"),
  };
}

const OWNER_ONLY: WfAction[] = [
  "submitScreening", "withdrawScreening", "reopenScreening", "submitFull", "withdrawFull", "respondBlocking",
  "ownerDecision", "confirmCondition", "reopenForChanges", "startRevision", "archive", "restore", "deleteDraft",
  "transferOwnership", "createAssignment", "updateAssignment", "grantAccess", "revokeAccess",
];
const DPO_ONLY: WfAction[] = [
  "recordScreeningDecision", "requestChanges", "submitOpinion", "amendOpinion", "raiseBlocking", "resolveBlocking",
];

/** Who may attempt an action. State preconditions are checked separately by {@link checkState}. */
export function canWorkflow(
  actor: Actor,
  ctx: AccessCtx,
  action: WfAction,
  extra: { isResponsible?: boolean } = {},
): Decision {
  const r = rolesOf(actor, ctx);
  if (action === "reassignDpo") return r.admin ? yes : no("Only the demo administrator can reassign the DPO.");
  if (OWNER_ONLY.includes(action)) return r.owner ? yes : no("Only the assessment owner can do this.");
  if (DPO_ONLY.includes(action)) {
    if (r.assignedDpo) return yes;
    if (r.owner) return no("An owner cannot act as the DPO on their own assessment.");
    return r.otherDpo
      ? no("Only the assigned DPO can do this. Other DPO users can view and comment.")
      : no("Only the assigned DPO can do this.");
  }
  switch (action) {
    case "addComment":
    case "resolveThread":
    case "reopenThread":
      return r.owner || r.assignee || r.assignedDpo || r.otherDpo ? yes : no("You cannot comment on this assessment.");
    case "setAssignmentStatus":
      return r.assignee ? yes : no("Only the assignee can update their own assignment.");
    case "recordProgress":
      return r.owner || extra.isResponsible ? yes : no("Only the owner or the person responsible can record progress.");
    case "confirmReviewed":
      return r.owner || r.assignee ? yes : no("Only the owner or an assignee can confirm a section is reviewed.");
    default:
      return no("Unknown action.");
  }
}

const DRAFTISH: Lifecycle[] = ["DRAFT", "CHANGES_REQUESTED"];

/** State preconditions for an action. */
export function checkState(action: WfAction, s: WfState): Decision {
  const archived = s.lifecycle === "ARCHIVED";
  if (archived && action !== "restore" && action !== "reassignDpo") return no("This assessment is archived. Restore it first.");
  switch (action) {
    case "submitScreening":
      if (s.screeningStatus === "AWAITING_DPO") return no("The screening is already with the DPO.");
      if (s.screeningStatus === "DECIDED") return no("The screening already has a decision. Reopen the screening to change it.");
      return DRAFTISH.includes(s.lifecycle) ? yes : no("The assessment is not editable in its current state.");
    case "withdrawScreening":
      return s.screeningStatus === "AWAITING_DPO" ? yes : no("The screening is not with the DPO.");
    case "reopenScreening":
      if (s.screeningStatus !== "DECIDED") return no("Only a decided screening can be reopened.");
      if (s.lifecycle === "IN_DPO_REVIEW") return no("Withdraw the full review first.");
      return [...DRAFTISH, "AWAITING_OWNER_DECISION"].includes(s.lifecycle)
        ? yes
        : no("The screening cannot be reopened in the current state.");
    case "recordScreeningDecision":
      return s.screeningStatus === "AWAITING_DPO" ? yes : no("There is no submitted screening awaiting a decision.");
    case "submitFull":
      if (s.screeningStatus !== "DECIDED" || s.path !== "FULL") {
        return no("The DPO must first decide that a full assessment should proceed.");
      }
      return DRAFTISH.includes(s.lifecycle) ? yes : no("The assessment is not editable in its current state.");
    case "withdrawFull":
      return s.lifecycle === "IN_DPO_REVIEW" ? yes : no("The assessment is not in DPO review.");
    case "requestChanges":
    case "submitOpinion":
      return s.lifecycle === "IN_DPO_REVIEW" ? yes : no("The assessment is not in DPO review.");
    case "amendOpinion":
      return ["AWAITING_OWNER_DECISION", "AWAITING_CONDITIONS", "FINALISED"].includes(s.lifecycle) && s.latestOpinion
        ? yes
        : no("There is no recorded opinion to amend in the current state.");
    case "raiseBlocking":
      return ["IN_DPO_REVIEW", "AWAITING_OWNER_DECISION"].includes(s.lifecycle)
        ? yes
        : no("Blocking issues are raised during review.");
    case "resolveBlocking":
      return ["IN_DPO_REVIEW", "AWAITING_OWNER_DECISION", "AWAITING_CONDITIONS"].includes(s.lifecycle)
        ? yes
        : no("There is nothing to resolve in the current state.");
    case "respondBlocking":
      return yes;
    case "ownerDecision":
      if (s.lifecycle !== "AWAITING_OWNER_DECISION") return no("The owner decision is recorded after the DPO review is complete.");
      return s.latestOpinion ? yes : no("The DPO has not recorded an opinion yet.");
    case "confirmCondition":
      return s.lifecycle === "AWAITING_CONDITIONS" ? yes : no("The assessment is not awaiting conditions.");
    case "recordProgress":
      return yes; // item-specific rules are applied by the server
    case "reopenForChanges":
      if (s.path === "PRE_ONLY") return no("This assessment stopped after the screening. Reopen the screening to change it.");
      return ["AWAITING_OWNER_DECISION", "AWAITING_CONDITIONS"].includes(s.lifecycle)
        ? yes
        : no("Only an assessment whose review is complete can be reopened for changes.");
    case "startRevision":
      return s.lifecycle === "FINALISED" ? yes : no("A new review can start only from a finalised assessment.");
    case "archive":
      return yes;
    case "restore":
      return archived ? yes : no("The assessment is not archived.");
    case "deleteDraft":
      if (s.everSubmitted) return no("An assessment that has been submitted can only be archived, not deleted.");
      return s.lifecycle === "DRAFT" ? yes : no("Only a draft can be deleted.");
    default:
      return yes;
  }
}

export interface Patch {
  lifecycle?: Lifecycle;
  screeningStatus?: ScreeningStatus;
  path?: Path;
  everSubmitted?: boolean;
}

/** The state change an action causes (after validation). */
export function patchFor(
  action: WfAction,
  s: WfState,
  input: { screening?: ScreeningDecisionKind; decision?: OwnerDecisionKind } = {},
): Patch {
  switch (action) {
    case "submitScreening":
      return { screeningStatus: "AWAITING_DPO", everSubmitted: true };
    case "withdrawScreening":
      return { screeningStatus: "NOT_SUBMITTED" };
    case "reopenScreening":
      return { screeningStatus: "INVALIDATED", path: "OPEN", lifecycle: "DRAFT" };
    case "recordScreeningDecision":
      return input.screening === "PRE_ASSESSMENT_SUFFICIENT"
        ? { screeningStatus: "DECIDED", path: "PRE_ONLY", lifecycle: "AWAITING_OWNER_DECISION" }
        : { screeningStatus: "DECIDED", path: "FULL" };
    case "submitFull":
      return { lifecycle: "IN_DPO_REVIEW", everSubmitted: true };
    case "withdrawFull":
      return { lifecycle: "DRAFT" };
    case "requestChanges":
      return { lifecycle: "CHANGES_REQUESTED" };
    case "submitOpinion":
      return { lifecycle: "AWAITING_OWNER_DECISION" };
    case "ownerDecision":
      return input.decision === "CONDITIONALLY_APPROVED" ? { lifecycle: "AWAITING_CONDITIONS" } : { lifecycle: "FINALISED" };
    case "reopenForChanges":
      return { lifecycle: "DRAFT" };
    case "archive":
      return { lifecycle: "ARCHIVED" };
    default:
      return {};
  }
}

// ------------------------------------------------------------------ validations

export interface ScreeningDecisionInput {
  decision: ScreeningDecisionKind;
  rationale: string;
  exceptionJustification?: string;
  mitigationControls?: string;
  advice?: string;
  opinionCategory?: OpinionCategory;
  opinionText?: string;
}

const blank = (s: string | undefined | null) => !s || s.trim() === "";

export function validateScreeningDecision(i: ScreeningDecisionInput, screeningIndicatedFull: boolean): string[] {
  const e: string[] = [];
  if (blank(i.rationale)) e.push("Record the rationale for the screening decision.");
  if (i.decision === "PRE_ASSESSMENT_SUFFICIENT") {
    if (screeningIndicatedFull) {
      if (blank(i.exceptionJustification)) e.push("A full DPIA was indicated, so an exception justification is required.");
      if (blank(i.mitigationControls)) e.push("A full DPIA was indicated, so the relevant mitigation controls must be recorded.");
    }
    if (!i.opinionCategory) e.push("Choose an opinion category for the short formal opinion.");
    if (blank(i.opinionText)) e.push("Write the short formal opinion.");
  }
  return e;
}

export function validateOpinion(i: { category?: OpinionCategory; opinionText?: string }): string[] {
  const e: string[] = [];
  if (!i.category) e.push("Choose an opinion category.");
  if (blank(i.opinionText)) e.push("Write the opinion.");
  return e;
}

export interface ConditionInput {
  description: string;
  responsibleUserId?: string | null;
  responsibleText?: string | null;
  deadline?: string | null;
}

export interface OwnerDecisionInput {
  decision: OwnerDecisionKind;
  rationale: string;
  departsFromDpo?: boolean;
  departureRationale?: string;
  conditions?: ConditionInput[];
}

export function validateOwnerDecision(i: OwnerDecisionInput, s: Pick<WfState, "openBlocking" | "latestOpinion">): string[] {
  const e: string[] = [];
  if (blank(i.rationale)) e.push("Record the rationale for your decision.");
  if (i.decision !== "REJECTED" && s.openBlocking > 0) {
    e.push("A blocking issue raised by the DPO is still open. It stays blocking until the assigned DPO resolves it. You can reject, or wait for it to be resolved.");
  }
  const op = s.latestOpinion;
  const departs =
    (op === "RECOMMENDATIONS" && i.decision === "APPROVED") ||
    (op === "OBJECTIONS_REMAIN" && i.decision !== "REJECTED") ||
    i.departsFromDpo === true;
  if (departs && (!i.departsFromDpo || blank(i.departureRationale))) {
    e.push("This decision departs from the DPO’s opinion. Tick that you depart from it and explain why, including the risk you accept.");
  }
  if (i.decision === "CONDITIONALLY_APPROVED") {
    const cs = i.conditions ?? [];
    if (cs.length === 0) e.push("Conditional approval needs at least one condition.");
    cs.forEach((c, n) => {
      if (blank(c.description)) e.push(`Condition ${n + 1}: describe it.`);
      if (blank(c.responsibleUserId) && blank(c.responsibleText)) e.push(`Condition ${n + 1}: say who is responsible.`);
      if (blank(c.deadline)) e.push(`Condition ${n + 1}: set a deadline.`);
    });
  }
  return e;
}

// ------------------------------------------------------------------ submission blockers

export interface Blocker {
  subsectionId: string;
  fieldId: string;
  label: string;
  reason: string;
}

/**
 * Structurally incomplete applicable content blocks submission. Unresolved answers ("Not sure", "Complete later",
 * an active help request) are allowed only when each carries an explanation or a question for the reviewer.
 */
export function submissionBlockers(
  result: AssessmentResult,
  opts: { subsections?: string[]; unreviewed?: string[] } = {},
): Blocker[] {
  const out: Blocker[] = [];
  for (const [id, r] of Object.entries(result.subsections)) {
    if (!r.active) continue;
    if (opts.subsections && !opts.subsections.includes(id)) continue;
    for (const g of r.gaps as Gap[]) {
      if (g.status === "INCOMPLETE") {
        out.push({
          subsectionId: id,
          fieldId: g.fieldId,
          label: g.label,
          reason: "Not answered. Answer it, or mark it “Not sure” or “Complete later” with an explanation for the reviewer.",
        });
      } else if (!g.note || g.note.trim() === "") {
        out.push({
          subsectionId: id,
          fieldId: g.fieldId,
          label: g.label,
          reason: "Unresolved without an explanation. Add the question or explanation the reviewer should see.",
        });
      }
    }
  }
  for (const id of opts.unreviewed ?? []) {
    if (opts.subsections && !opts.subsections.includes(id)) continue;
    if (result.subsections[id]?.active) {
      out.push({
        subsectionId: id,
        fieldId: "review",
        label: "Carried-forward section",
        reason: "Carried forward from the previous version. Review it and confirm it has been reviewed.",
      });
    }
  }
  return out;
}

export const SCREENING_SUBSECTIONS = ["A1", "A2", "B1", "B2", "C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"];

// ------------------------------------------------------------------ versions

export function nextVersionNumber(existing: string[]): string {
  const majors = existing.map((v) => Number(v.split(".")[0])).filter((n) => Number.isFinite(n));
  return `${(majors.length ? Math.max(...majors) : 0) + 1}.0`;
}

export const CHANGE_CATEGORIES = [
  { value: "purpose", label: "Purpose" },
  { value: "data_types", label: "Data types" },
  { value: "population_scale", label: "Population / scale" },
  { value: "technology", label: "Technology" },
  { value: "parties", label: "Parties" },
  { value: "countries", label: "Countries" },
  { value: "risks", label: "Risks" },
  { value: "periodic_review", label: "Periodic review" },
  { value: "other", label: "Other" },
] as const;

/** Stages D-J and the supervisory-authority / views subsections do not apply when the screening ended the assessment. */
export function inactiveForPath(subsectionId: string, stage: string, path: Path): boolean {
  if (path !== "PRE_ONLY") return false;
  if (["D", "E", "F", "G", "H", "I", "J"].includes(stage)) return true;
  return subsectionId === "K2" || subsectionId === "K3";
}
