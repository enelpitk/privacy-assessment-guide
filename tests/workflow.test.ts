import { describe, expect, it } from "vitest";
import { buildModel, evaluateAssessment, type RespRow } from "@/domain/model";
import type { AccessCtx, Actor } from "@/domain/permissions";
import {
  canWorkflow,
  checkState,
  inactiveForPath,
  nextVersionNumber,
  patchFor,
  rolesOf,
  submissionBlockers,
  validateOwnerDecision,
  validateScreeningDecision,
  type WfAction,
  type WfState,
} from "@/domain/workflow";
import { stableStringify } from "@/domain/snapshot";

const owner: Actor = { id: "o1", roles: ["OWNER"] };
const ownerDpo: Actor = { id: "o1", roles: ["OWNER", "DPO"] }; // holds both roles, owns this assessment
const contributor: Actor = { id: "c1", roles: ["CONTRIBUTOR"] };
const dpo1: Actor = { id: "d1", roles: ["DPO"] };
const dpo2: Actor = { id: "d2", roles: ["DPO"] };
const admin: Actor = { id: "a1", roles: ["ADMIN"] };

const ctx: AccessCtx = { ownerId: "o1", assignedDpoId: "d1", lifecycle: "DRAFT", screeningStatus: "NOT_SUBMITTED", assignedSubsections: [], isAssignee: false, sharedViewer: false };
const state = (o: Partial<WfState> = {}): WfState => ({ lifecycle: "DRAFT", screeningStatus: "NOT_SUBMITTED", path: "OPEN", everSubmitted: false, openBlocking: 0, latestOpinion: null, ...o });

describe("who may attempt an action (server-enforced permission matrix)", () => {
  const ownerOnly: WfAction[] = ["submitScreening", "withdrawScreening", "reopenScreening", "submitFull", "withdrawFull", "ownerDecision", "confirmCondition", "reopenForChanges", "startRevision", "archive", "restore", "deleteDraft", "transferOwnership", "createAssignment", "updateAssignment", "grantAccess", "revokeAccess", "respondBlocking"];
  const dpoOnly: WfAction[] = ["recordScreeningDecision", "requestChanges", "submitOpinion", "amendOpinion", "raiseBlocking", "resolveBlocking"];

  it("only the owner may perform owner actions", () => {
    for (const a of ownerOnly) {
      expect(canWorkflow(owner, ctx, a).ok, a).toBe(true);
      for (const other of [contributor, dpo1, dpo2, admin]) expect(canWorkflow(other, ctx, a).ok, `${a} by ${other.id}`).toBe(false);
    }
  });
  it("only the ASSIGNED DPO may perform DPO actions; other DPOs, owners, contributors and admins may not", () => {
    for (const a of dpoOnly) {
      expect(canWorkflow(dpo1, ctx, a).ok, a).toBe(true);
      for (const other of [owner, contributor, dpo2, admin]) expect(canWorkflow(other, ctx, a).ok, `${a} by ${other.id}`).toBe(false);
    }
  });
  it("an owner can never act as the DPO on their own assessment, even holding the DPO role", () => {
    const sameUser: AccessCtx = { ...ctx, assignedDpoId: "o1" }; // forced inconsistent data
    for (const a of dpoOnly) expect(canWorkflow(ownerDpo, sameUser, a).ok, a).toBe(false);
    expect(rolesOf(ownerDpo, ctx).assignedDpo).toBe(false);
    expect(rolesOf(ownerDpo, ctx).owner).toBe(true);
  });
  it("only the administrator reassigns the DPO", () => {
    expect(canWorkflow(admin, ctx, "reassignDpo").ok).toBe(true);
    for (const o of [owner, dpo1, contributor]) expect(canWorkflow(o, ctx, "reassignDpo").ok).toBe(false);
  });
  it("comments: owner, assignees and every DPO may comment; shared viewers and admins may not", () => {
    expect(canWorkflow(owner, ctx, "addComment").ok).toBe(true);
    expect(canWorkflow(dpo2, ctx, "addComment").ok).toBe(true);
    expect(canWorkflow(contributor, { ...ctx, isAssignee: true }, "addComment").ok).toBe(true);
    expect(canWorkflow(contributor, { ...ctx, sharedViewer: true }, "addComment").ok).toBe(false);
    expect(canWorkflow(admin, ctx, "addComment").ok).toBe(false);
  });
  it("progress: the owner or the responsible person only", () => {
    expect(canWorkflow(owner, ctx, "recordProgress").ok).toBe(true);
    expect(canWorkflow(contributor, ctx, "recordProgress", { isResponsible: true }).ok).toBe(true);
    expect(canWorkflow(contributor, ctx, "recordProgress").ok).toBe(false);
    expect(canWorkflow(dpo1, ctx, "recordProgress").ok).toBe(false);
  });
  it("only an assignee sets their own assignment status", () => {
    expect(canWorkflow(contributor, { ...ctx, isAssignee: true }, "setAssignmentStatus").ok).toBe(true);
    expect(canWorkflow(owner, ctx, "setAssignmentStatus").ok).toBe(false);
  });
});

describe("state preconditions and valid transitions", () => {
  it("screening: submit -> withdraw / decide; no double submit; no submission once decided", () => {
    expect(checkState("submitScreening", state()).ok).toBe(true);
    expect(checkState("submitScreening", state({ screeningStatus: "AWAITING_DPO" })).ok).toBe(false);
    expect(checkState("submitScreening", state({ screeningStatus: "DECIDED" })).ok).toBe(false);
    expect(checkState("submitScreening", state({ screeningStatus: "INVALIDATED" })).ok).toBe(true);
    expect(checkState("submitScreening", state({ lifecycle: "IN_DPO_REVIEW" })).ok).toBe(false);
    expect(checkState("withdrawScreening", state({ screeningStatus: "AWAITING_DPO" })).ok).toBe(true);
    expect(checkState("withdrawScreening", state()).ok).toBe(false);
    expect(checkState("recordScreeningDecision", state({ screeningStatus: "AWAITING_DPO" })).ok).toBe(true);
    expect(checkState("recordScreeningDecision", state()).ok).toBe(false);
  });
  it("a full submission needs a screening decision to proceed", () => {
    expect(checkState("submitFull", state()).ok).toBe(false);
    expect(checkState("submitFull", state({ screeningStatus: "DECIDED", path: "PRE_ONLY" })).ok).toBe(false);
    expect(checkState("submitFull", state({ screeningStatus: "DECIDED", path: "FULL" })).ok).toBe(true);
    expect(checkState("submitFull", state({ screeningStatus: "DECIDED", path: "FULL", lifecycle: "CHANGES_REQUESTED" })).ok).toBe(true);
    expect(checkState("submitFull", state({ screeningStatus: "DECIDED", path: "FULL", lifecycle: "IN_DPO_REVIEW" })).ok).toBe(false);
  });
  it("review actions happen only while the assessment is in DPO review", () => {
    for (const a of ["requestChanges", "submitOpinion", "withdrawFull"] as const) {
      expect(checkState(a, state({ lifecycle: "IN_DPO_REVIEW" })).ok, a).toBe(true);
      expect(checkState(a, state()).ok, a).toBe(false);
    }
  });
  it("the owner decision needs a completed review with an opinion", () => {
    expect(checkState("ownerDecision", state({ lifecycle: "AWAITING_OWNER_DECISION", latestOpinion: "NO_OBJECTIONS" })).ok).toBe(true);
    expect(checkState("ownerDecision", state({ lifecycle: "AWAITING_OWNER_DECISION" })).ok).toBe(false);
    expect(checkState("ownerDecision", state({ lifecycle: "IN_DPO_REVIEW", latestOpinion: "NO_OBJECTIONS" })).ok).toBe(false);
    expect(checkState("ownerDecision", state({ lifecycle: "FINALISED", latestOpinion: "NO_OBJECTIONS" })).ok).toBe(false);
  });
  it("conditions are confirmed only while awaiting conditions", () => {
    expect(checkState("confirmCondition", state({ lifecycle: "AWAITING_CONDITIONS" })).ok).toBe(true);
    expect(checkState("confirmCondition", state({ lifecycle: "FINALISED" })).ok).toBe(false);
  });
  it("reopening for changes: only after a completed review, and not for a pre-assessment-only path", () => {
    expect(checkState("reopenForChanges", state({ lifecycle: "AWAITING_OWNER_DECISION", path: "FULL" })).ok).toBe(true);
    expect(checkState("reopenForChanges", state({ lifecycle: "AWAITING_CONDITIONS", path: "FULL" })).ok).toBe(true);
    expect(checkState("reopenForChanges", state({ lifecycle: "AWAITING_OWNER_DECISION", path: "PRE_ONLY" })).ok).toBe(false);
    expect(checkState("reopenForChanges", state({ lifecycle: "FINALISED", path: "FULL" })).ok).toBe(false);
    expect(checkState("reopenForChanges", state({ lifecycle: "DRAFT" })).ok).toBe(false);
  });
  it("a new review starts only from a finalised assessment", () => {
    expect(checkState("startRevision", state({ lifecycle: "FINALISED" })).ok).toBe(true);
    for (const l of ["DRAFT", "IN_DPO_REVIEW", "AWAITING_CONDITIONS", "AWAITING_OWNER_DECISION"] as const) expect(checkState("startRevision", state({ lifecycle: l })).ok, l).toBe(false);
  });
  it("hard deletion only for a never-submitted draft", () => {
    expect(checkState("deleteDraft", state()).ok).toBe(true);
    expect(checkState("deleteDraft", state({ everSubmitted: true })).ok).toBe(false);
    expect(checkState("deleteDraft", state({ lifecycle: "IN_DPO_REVIEW" })).ok).toBe(false);
  });
  it("an archived assessment accepts only restore", () => {
    for (const a of ["submitScreening", "submitFull", "archive", "addComment", "transferOwnership", "createAssignment", "grantAccess"] as const) {
      expect(checkState(a, state({ lifecycle: "ARCHIVED" })).ok, a).toBe(false);
    }
    expect(checkState("restore", state({ lifecycle: "ARCHIVED" })).ok).toBe(true);
    expect(checkState("restore", state()).ok).toBe(false);
  });
  it("patches map to the right states", () => {
    expect(patchFor("submitScreening", state())).toEqual({ screeningStatus: "AWAITING_DPO", everSubmitted: true });
    expect(patchFor("recordScreeningDecision", state(), { screening: "PROCEED_FULL" })).toEqual({ screeningStatus: "DECIDED", path: "FULL" });
    expect(patchFor("recordScreeningDecision", state(), { screening: "PRE_ASSESSMENT_SUFFICIENT" })).toEqual({ screeningStatus: "DECIDED", path: "PRE_ONLY", lifecycle: "AWAITING_OWNER_DECISION" });
    expect(patchFor("submitFull", state())).toEqual({ lifecycle: "IN_DPO_REVIEW", everSubmitted: true });
    expect(patchFor("requestChanges", state())).toEqual({ lifecycle: "CHANGES_REQUESTED" });
    expect(patchFor("submitOpinion", state())).toEqual({ lifecycle: "AWAITING_OWNER_DECISION" });
    expect(patchFor("ownerDecision", state(), { decision: "APPROVED" })).toEqual({ lifecycle: "FINALISED" });
    expect(patchFor("ownerDecision", state(), { decision: "REJECTED" })).toEqual({ lifecycle: "FINALISED" });
    expect(patchFor("ownerDecision", state(), { decision: "CONDITIONALLY_APPROVED" })).toEqual({ lifecycle: "AWAITING_CONDITIONS" });
    expect(patchFor("reopenScreening", state())).toEqual({ screeningStatus: "INVALIDATED", path: "OPEN", lifecycle: "DRAFT" });
  });
});

describe("validations", () => {
  it("a screening decision always needs a rationale", () => {
    expect(validateScreeningDecision({ decision: "PROCEED_FULL", rationale: "" }, false)).toHaveLength(1);
    expect(validateScreeningDecision({ decision: "PROCEED_FULL", rationale: "ok" }, true)).toEqual([]);
  });
  it("pre-assessment sufficient needs the short opinion; an exception also needs justification and mitigation", () => {
    const base = { decision: "PRE_ASSESSMENT_SUFFICIENT" as const, rationale: "r" };
    expect(validateScreeningDecision(base, false)).toHaveLength(2);
    expect(validateScreeningDecision({ ...base, opinionCategory: "NO_OBJECTIONS", opinionText: "t" }, false)).toEqual([]);
    expect(validateScreeningDecision({ ...base, opinionCategory: "NO_OBJECTIONS", opinionText: "t" }, true)).toHaveLength(2);
    expect(validateScreeningDecision({ ...base, opinionCategory: "NO_OBJECTIONS", opinionText: "t", exceptionJustification: "j", mitigationControls: "m" }, true)).toEqual([]);
  });
  it("owner decisions: rationale, blocking issues, departure from the opinion, conditions", () => {
    const s = { openBlocking: 0, latestOpinion: "NO_OBJECTIONS" as const };
    expect(validateOwnerDecision({ decision: "APPROVED", rationale: "" }, s)).toHaveLength(1);
    expect(validateOwnerDecision({ decision: "APPROVED", rationale: "ok" }, s)).toEqual([]);
    expect(validateOwnerDecision({ decision: "APPROVED", rationale: "ok" }, { ...s, openBlocking: 1 })).toHaveLength(1);
    expect(validateOwnerDecision({ decision: "REJECTED", rationale: "no" }, { ...s, openBlocking: 1 })).toEqual([]);
    expect(validateOwnerDecision({ decision: "APPROVED", rationale: "ok" }, { ...s, latestOpinion: "RECOMMENDATIONS" })).toHaveLength(1);
    expect(validateOwnerDecision({ decision: "APPROVED", rationale: "ok", departsFromDpo: true, departureRationale: "accept" }, { ...s, latestOpinion: "RECOMMENDATIONS" })).toEqual([]);
    expect(validateOwnerDecision({ decision: "CONDITIONALLY_APPROVED", rationale: "ok" }, { ...s, latestOpinion: "RECOMMENDATIONS" })).toHaveLength(1); // no conditions
    expect(validateOwnerDecision({ decision: "CONDITIONALLY_APPROVED", rationale: "ok", conditions: [{ description: "d", responsibleText: "r", deadline: "2027-01-01" }] }, { ...s, latestOpinion: "RECOMMENDATIONS" })).toEqual([]);
    expect(validateOwnerDecision({ decision: "CONDITIONALLY_APPROVED", rationale: "ok", conditions: [{ description: "d" }] }, { ...s, latestOpinion: "RECOMMENDATIONS" }).length).toBe(2);
    expect(validateOwnerDecision({ decision: "CONDITIONALLY_APPROVED", rationale: "ok", conditions: [{ description: "d", responsibleText: "r", deadline: "2027-01-01" }] }, { ...s, latestOpinion: "OBJECTIONS_REMAIN" })).toHaveLength(1); // must depart
  });
  it("risk acceptance never lets a rejected-with-objections decision be forced: rejecting needs no departure", () => {
    expect(validateOwnerDecision({ decision: "REJECTED", rationale: "stop" }, { openBlocking: 1, latestOpinion: "OBJECTIONS_REMAIN" })).toEqual([]);
  });
});

describe("submission blockers", () => {
  const r = (fieldId: string, value: unknown, state: RespRow["state"] = "ANSWERED", recordId = "", rationale?: string): RespRow => ({ fieldId, recordId, value, state, rationale });
  it("blocks unanswered applicable items", () => {
    const res = evaluateAssessment(buildModel([], []));
    const ids = submissionBlockers(res, { subsections: ["C3"] }).map((b) => b.fieldId);
    expect(ids).toContain("C.q3");
    expect(ids).toContain("C.q3.rationale");
  });
  it("allows unresolved answers with an explanation, blocks one without", () => {
    const rationale = r("C.q3.rationale", "Needs legal input");
    const withNote = evaluateAssessment(buildModel([r("C.q3", undefined, "NOT_SURE", "", "Is facial matching new?"), rationale], []));
    expect(submissionBlockers(withNote, { subsections: ["C3"] })).toEqual([]);
    const without = evaluateAssessment(buildModel([r("C.q3", undefined, "NOT_SURE"), rationale], []));
    expect(submissionBlockers(without, { subsections: ["C3"] })).toHaveLength(1);
    expect(submissionBlockers(without, { subsections: ["C3"] })[0].reason).toContain("without an explanation");
  });
  it("an active help request needs a comment", () => {
    const rows = [r("B1.help", true)];
    const res = evaluateAssessment(buildModel(rows, []));
    expect(submissionBlockers(res, { subsections: ["B1"] }).some((b) => b.fieldId === "B1.help")).toBe(true);
    const ok = evaluateAssessment(buildModel([r("B1.help", true, "ANSWERED", "", "Which entity is joint?")], []));
    expect(submissionBlockers(ok, { subsections: ["B1"] }).some((b) => b.fieldId === "B1.help")).toBe(false);
  });
  it("carried-forward sections block until reviewed, and inactive sections never block", () => {
    const res = evaluateAssessment(buildModel([r("F.applies", "NO")], []));
    expect(submissionBlockers(res, { subsections: ["F2"] })).toEqual([]);
    expect(submissionBlockers(res, { subsections: ["A1"], unreviewed: ["A1"] }).some((b) => b.fieldId === "review")).toBe(true);
    expect(submissionBlockers(res, { subsections: ["F2"], unreviewed: ["F2"] })).toEqual([]);
  });
});

describe("paths and versions", () => {
  it("a pre-assessment-only path deactivates D-J and K2/K3 only", () => {
    for (const [id, stage] of [["D1", "D"], ["E3", "E"], ["F2", "F"], ["H5", "H"], ["J2", "J"], ["K2", "K"], ["K3", "K"]] as const) expect(inactiveForPath(id, stage, "PRE_ONLY"), id).toBe(true);
    for (const [id, stage] of [["A1", "A"], ["C9", "C"], ["K1", "K"], ["K4", "K"], ["K5", "K"], ["K6", "K"]] as const) expect(inactiveForPath(id, stage, "PRE_ONLY"), id).toBe(false);
    expect(inactiveForPath("D1", "D", "FULL")).toBe(false);
    expect(inactiveForPath("D1", "D", "OPEN")).toBe(false);
  });
  it("numbers revisions as new major versions", () => {
    expect(nextVersionNumber(["1.0"])).toBe("2.0");
    expect(nextVersionNumber(["1.0", "2.0"])).toBe("3.0");
    expect(nextVersionNumber([])).toBe("1.0");
  });
  it("hashes deterministically regardless of key order", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }));
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});
