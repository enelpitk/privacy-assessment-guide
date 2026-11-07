import { describe, expect, it } from "vitest";
import {
  canCreateAssessment,
  canEditField,
  canManageEntity,
  canView,
  isEligibleDpo,
  type AccessCtx,
  type Actor,
} from "@/domain/permissions";
import { fieldIndex, changeClassOf, isInputField } from "@/content";

const owner: Actor = { id: "o1", roles: ["OWNER"] };
const owner2: Actor = { id: "o2", roles: ["OWNER", "CONTRIBUTOR"] };
const contributor: Actor = { id: "c1", roles: ["CONTRIBUTOR"] };
const dpo: Actor = { id: "d1", roles: ["DPO"] };
const dpo2: Actor = { id: "d2", roles: ["DPO"] };
const admin: Actor = { id: "a1", roles: ["ADMIN"] };

const base: AccessCtx = {
  ownerId: "o1",
  assignedDpoId: "d1",
  lifecycle: "DRAFT",
  screeningStatus: "NOT_SUBMITTED",
  assignedSubsections: [],
  isAssignee: false,
  sharedViewer: false,
};
const substantive = { id: "x", changeClass: "SUBSTANTIVE" as const };

describe("visibility", () => {
  it("owners see own assessments only; unrelated users do not", () => {
    expect(canView(owner, base)).toBe(true);
    expect(canView(owner2, base)).toBe(false);
    expect(canView(contributor, base)).toBe(false);
    expect(canView(admin, base)).toBe(false);
  });
  it("assigned contributors and shared viewers see it; every DPO sees it", () => {
    expect(canView(contributor, { ...base, isAssignee: true })).toBe(true);
    expect(canView(owner2, { ...base, sharedViewer: true })).toBe(true);
    expect(canView(dpo, base)).toBe(true);
    expect(canView(dpo2, base)).toBe(true);
  });
});

describe("editing", () => {
  it("lets the owner edit substantive fields in a draft", () => {
    expect(canEditField(owner, base, substantive, "A1").ok).toBe(true);
  });
  it("lets a contributor edit only assigned subsections", () => {
    const ctx = { ...base, isAssignee: true, assignedSubsections: ["H3"] };
    expect(canEditField(contributor, ctx, substantive, "H3").ok).toBe(true);
    expect(canEditField(contributor, ctx, substantive, "H4").ok).toBe(false);
  });
  it("a process owner can contribute to another owner's assessment but not elsewhere", () => {
    const ctx = { ...base, isAssignee: true, assignedSubsections: ["E4"] };
    expect(canEditField(owner2, ctx, substantive, "E4").ok).toBe(true);
    expect(canEditField(owner2, ctx, substantive, "E5").ok).toBe(false);
  });
  it("stops editing after the assignment is no longer active (empty active list)", () => {
    const ctx = { ...base, isAssignee: true, assignedSubsections: [] };
    expect(canEditField(contributor, ctx, substantive, "H3").ok).toBe(false);
  });
  it("never lets DPOs or the administrator edit owner answers", () => {
    expect(canEditField(dpo, base, substantive, "A1").ok).toBe(false);
    expect(canEditField(admin, base, substantive, "A1").ok).toBe(false);
  });
  it("blocks workflow-owned and computed fields for everyone", () => {
    expect(canEditField(owner, base, { id: "K.dpo.opinion", changeClass: "SUBSTANTIVE", workflow: "dpo-review" }, "K1").ok).toBe(false);
    expect(canEditField(owner, base, { id: "J.risk.inh.score", changeClass: "SUBSTANTIVE", computed: true }, "J2").ok).toBe(false);
  });
  it("locks substantive edits during review but keeps progress records possible", () => {
    const inReview = { ...base, lifecycle: "IN_DPO_REVIEW" as const };
    expect(canEditField(owner, inReview, substantive, "A1").ok).toBe(false);
    expect(canEditField(owner, { ...base, lifecycle: "AWAITING_CONDITIONS" }, { id: "p", changeClass: "PROGRESS" }, "J2").ok).toBe(true);
    expect(canEditField(owner, { ...base, lifecycle: "IN_DPO_REVIEW" }, { id: "p", changeClass: "PROGRESS" }, "J2").ok).toBe(false);
  });
  it("locks submitted screening sections A-C but not later stages", () => {
    const screened = { ...base, screeningStatus: "AWAITING_DPO" as const };
    expect(canEditField(owner, screened, substantive, "C1").ok).toBe(false);
    expect(canEditField(owner, screened, substantive, "D1").ok).toBe(true);
  });
  it("keeps administrative fields owner-only, even for an assigned contributor", () => {
    const ctx = { ...base, isAssignee: true, assignedSubsections: ["K5"] };
    expect(canEditField(contributor, ctx, { id: "K.review.periodic", changeClass: "ADMINISTRATIVE" }, "K5").ok).toBe(false);
    expect(canEditField(owner, base, { id: "K.review.periodic", changeClass: "ADMINISTRATIVE" }, "K5").ok).toBe(true);
  });
  it("makes archived assessments read-only", () => {
    expect(canEditField(owner, { ...base, lifecycle: "ARCHIVED" }, substantive, "A1").ok).toBe(false);
  });
});

describe("roles and separation", () => {
  it("only process owners can create assessments", () => {
    expect(canCreateAssessment(owner).ok).toBe(true);
    expect(canCreateAssessment(contributor).ok).toBe(false);
    expect(canCreateAssessment(dpo).ok).toBe(false);
  });
  it("an owner can never be the assigned DPO of their own assessment", () => {
    const ownerAndDpo = { id: "o1", roles: ["OWNER", "DPO"] as ("OWNER" | "DPO")[] };
    expect(isEligibleDpo(ownerAndDpo, "o1")).toBe(false);
    expect(isEligibleDpo(ownerAndDpo, "o2")).toBe(true);
    expect(isEligibleDpo({ id: "x", roles: ["OWNER"] }, "o1")).toBe(false);
  });
});

describe("shared entities", () => {
  it("lets contributors create entries but not delete them", () => {
    const ctx = { ...base, isAssignee: true, assignedSubsections: ["E1"] };
    expect(canManageEntity(contributor, ctx, "create", []).ok).toBe(true);
    expect(canManageEntity(contributor, ctx, "delete", ["E1"]).ok).toBe(false);
  });
  it("lets contributors rename only entries used inside their assigned scope", () => {
    const ctx = { ...base, isAssignee: true, assignedSubsections: ["E1"] };
    expect(canManageEntity(contributor, ctx, "rename", ["E1"]).ok).toBe(true);
    expect(canManageEntity(contributor, ctx, "rename", ["E1", "E7"]).ok).toBe(false);
  });
  it("lets the owner do everything while editable", () => {
    expect(canManageEntity(owner, base, "delete", ["E1", "E7"]).ok).toBe(true);
    expect(canManageEntity(owner, { ...base, lifecycle: "IN_DPO_REVIEW" }, "rename", []).ok).toBe(false);
  });
});

describe("change class coverage", () => {
  it("every field has a change class, and administrative fields are owner-only inputs", () => {
    for (const loc of fieldIndex.values()) {
      expect(["SUBSTANTIVE", "PROGRESS", "ADMINISTRATIVE"]).toContain(changeClassOf(loc.def));
    }
    const admins = [...fieldIndex.values()].filter((l) => changeClassOf(l.def) === "ADMINISTRATIVE" && isInputField(l.def));
    expect(admins.map((a) => a.def.id).sort()).toEqual(
      ["K.review.interval", "K.review.noSchedule", "K.review.periodic", "K.review.routine"].sort(),
    );
  });
});
