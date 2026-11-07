import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { fakeDb } = await import("./fakeDb");
  return { prisma: fakeDb };
});

import { fakeDb } from "./fakeDb";
import { collectionIndex, fieldIndex } from "@/content";
import { buildModel, evaluateAssessment } from "@/domain/model";
import { createAssessment } from "@/server/assessments";
import { runAction } from "@/server/governance";
import { loadGovernance } from "@/server/governanceData";
import { saveChanges } from "@/server/save";
import { HttpError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";
import type { ActionInput } from "@/server/actionSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = fakeDb as any;
const table = (n: string): any[] => (db.$tables[n] ??= []); // eslint-disable-line @typescript-eslint/no-explicit-any

const U = (id: string, roles: CurrentUser["roles"], name = id): CurrentUser => ({ id, displayName: name, jobTitle: "", roles, departmentId: null });
const owner = U("o1", ["OWNER"], "Alex Rowan");
const owner2 = U("o2", ["OWNER"], "Priya Nandi");
const contrib = U("c1", ["CONTRIBUTOR"], "Sam Okafor");
const dpo1 = U("d1", ["DPO"], "Dana Whitfield");
const dpo2 = U("d2", ["DPO"], "Tomas Reyes");
const admin = U("a1", ["ADMIN"], "Morgan Hale");
const stranger = U("x1", ["OWNER"], "Other Owner");

let id = "";
const act = (u: CurrentUser, input: ActionInput) => runAction(u, id, input);
const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
};
const A = () => table("assessment").find((a) => a.id === id);

/** Fill every applicable gap with "Not sure" plus an explanation, creating required records first. */
function completeAll() {
  const versionId = A().currentVersionId;
  for (let pass = 0; pass < 12; pass++) {
    const fields = table("responseField").filter((f) => f.versionId === versionId);
    const recs = table("recordItem").filter((r) => r.versionId === versionId && !r.deletedAt);
    const res = evaluateAssessment(buildModel(fields.map((f) => ({ fieldId: f.fieldId, recordId: f.recordId, value: f.value, state: f.state, rationale: f.rationale })), recs, A().screeningPath));
    let changed = false;
    for (const r of Object.values(res.subsections)) {
      for (const g of r.gaps) {
        if (g.status !== "INCOMPLETE" && g.note) continue;
        const col = collectionIndex.get(g.fieldId);
        if (col) {
          const parent = col.parent ? recs.find((x) => x.collection === col.parent)?.id ?? null : null;
          table("recordItem").push({ id: `rec-${Math.random()}`, versionId, collection: g.fieldId, parentId: parent, ordering: 0, revision: 1, deletedAt: null, createdById: "o1" });
          changed = true;
          continue;
        }
        if (!fieldIndex.has(g.fieldId)) continue;
        const existing = fields.find((f) => f.fieldId === g.fieldId && f.recordId === g.recordId);
        if (existing) Object.assign(existing, { state: "NOT_SURE", rationale: "Need guidance on this", value: null });
        else table("responseField").push({ id: `rf-${Math.random()}`, versionId, fieldId: g.fieldId, recordId: g.recordId, value: null, state: "NOT_SURE", rationale: "Need guidance on this", revision: 1, lastEditorId: "o1", lastEditedAt: new Date() });
        changed = true;
      }
    }
    if (!changed) return;
  }
}

/** Save through the real server path, using the stored revision as the client would. */
async function save(user: CurrentUser, fieldId: string, value: unknown, recordId = "") {
  const versionId = A().currentVersionId;
  const f = table("responseField").find((x) => x.versionId === versionId && x.fieldId === fieldId && x.recordId === recordId);
  const res = await saveChanges(user, id, [{ fieldId, recordId, baseRevision: f?.revision ?? 0, value, state: "ANSWERED" }]);
  return res[0].status;
}

function setAnswer(fieldId: string, value: unknown, recordId = "", state = "ANSWERED") {
  const versionId = A().currentVersionId;
  const f = table("responseField").find((x) => x.versionId === versionId && x.fieldId === fieldId && x.recordId === recordId);
  if (f) Object.assign(f, { value, state, rationale: null });
  else table("responseField").push({ id: `rf-${Math.random()}`, versionId, fieldId: fieldId, recordId, value, state, rationale: null, revision: 1, lastEditorId: "o1", lastEditedAt: new Date() });
}

beforeEach(async () => {
  db.$reset();
  for (const u of [owner, owner2, contrib, dpo1, dpo2, admin, stranger]) {
    table("user").push({ id: u.id, displayName: u.displayName, jobTitle: "", roles: u.roles, departmentId: null });
  }
  table("department").push({ id: "dep1", name: "Retail Banking", groupEntity: "Harbour Bank" });
  const created = await createAssessment(owner, { name: "Test processing", departmentId: "dep1", assignedDpoId: "d1" });
  id = created.id;
});

describe("creation", () => {
  it("creates a draft at version 1.0 owned by the creator, with a generated identifier and an event", () => {
    expect(A()).toMatchObject({ ownerId: "o1", assignedDpoId: "d1", lifecycle: "DRAFT", screeningStatus: "NOT_SUBMITTED", screeningPath: "OPEN", everSubmitted: false });
    expect(A().displayId).toMatch(/^DPIA-\d{4}-0001$/);
    expect(table("event").map((e) => e.type)).toContain("ASSESSMENT_CREATED");
  });
  it("rejects an owner as their own DPO and non-owners as creators", async () => {
    await expect(createAssessment(owner, { name: "x y z", departmentId: "dep1", assignedDpoId: "o1" })).rejects.toBeInstanceOf(HttpError);
    await expect(createAssessment(contrib, { name: "x y z", departmentId: "dep1", assignedDpoId: "d1" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("screening gate", () => {
  it("blocks submission while applicable content is incomplete, listing what is missing", async () => {
    try {
      await act(owner, { action: "submitScreening" });
      throw new Error("should have failed");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(422);
      expect(((e as HttpError).details as unknown[]).length).toBeGreaterThan(5);
    }
    expect(A().screeningStatus).toBe("NOT_SUBMITTED");
    expect(table("snapshot")).toHaveLength(0);
  });

  it("allows unresolved answers when each has an explanation, but blocks an unexplained one", async () => {
    completeAll();
    const f = table("responseField").find((x) => x.fieldId === "C.q3");
    f.rationale = "";
    expect(await status(act(owner, { action: "submitScreening" }))).toBe(422);
    f.rationale = "Is generative AI new for us?";
    expect(await status(act(owner, { action: "submitScreening" }))).toBe(200);
  });

  it("creates an immutable snapshot of A-C, locks A-C, leaves D-K editable, and only the owner may submit", async () => {
    completeAll();
    expect(await status(act(contrib, { action: "submitScreening" }))).toBe(404); // not visible to a stranger contributor
    expect(await status(act(dpo1, { action: "submitScreening" }))).toBe(403);
    await act(owner, { action: "submitScreening" });
    expect(A()).toMatchObject({ screeningStatus: "AWAITING_DPO", everSubmitted: true, lifecycle: "DRAFT" });
    const snap = table("snapshot")[0];
    expect(snap.kind).toBe("SCREENING_SUBMITTED");
    expect(snap.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const fieldsInSnap = snap.payload.responses.map((r: { fieldId: string }) => r.fieldId);
    expect(fieldsInSnap).toContain("C.q1");
    expect(fieldsInSnap).not.toContain("D.launchDate");
    const locked = await save(owner, "C.q1.rationale", "changed");
    expect(locked).toBe("rejected");
    const open = await save(owner, "D.launchDate", "2027-05-01");
    expect(open).toBe("saved");
  });

  it("withdrawing returns the screening to the owner and keeps the snapshot", async () => {
    completeAll();
    await act(owner, { action: "submitScreening" });
    await act(owner, { action: "withdrawScreening" });
    expect(A().screeningStatus).toBe("NOT_SUBMITTED");
    expect(table("snapshot")).toHaveLength(1);
    const edit = await save(owner, "C.q1.rationale", "now editable");
    expect(edit).toBe("saved");
  });

  it("only the ASSIGNED DPO records the decision; other DPOs and the owner cannot", async () => {
    completeAll();
    await act(owner, { action: "submitScreening" });
    const decision = { action: "recordScreeningDecision", decision: "PROCEED_FULL", rationale: "Screening indicates a full assessment" } as const;
    expect(await status(act(dpo2, decision))).toBe(403);
    expect(await status(act(owner, decision))).toBe(403);
    expect(await status(act(admin, decision))).toBe(404);
    expect(await status(act(dpo1, decision))).toBe(200);
    expect(A()).toMatchObject({ screeningStatus: "DECIDED", screeningPath: "FULL", lifecycle: "DRAFT" });
  });

  it("a decision needs a rationale; a pre-assessment-only decision needs the short opinion in the same action", async () => {
    completeAll();
    await act(owner, { action: "submitScreening" });
    expect(await status(act(dpo1, { action: "recordScreeningDecision", decision: "PROCEED_FULL", rationale: " " }))).toBe(422);
    expect(await status(act(dpo1, { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "No indication" }))).toBe(422);
    expect(await status(act(dpo1, { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "No indication", opinionCategory: "NO_OBJECTIONS", opinionText: "No objections to proceeding on this basis." }))).toBe(200);
    expect(A()).toMatchObject({ screeningStatus: "DECIDED", screeningPath: "PRE_ONLY", lifecycle: "AWAITING_OWNER_DECISION" });
    expect(table("dpoOpinion")).toHaveLength(1);
  });

  it("an exception (pre-assessment sufficient although a full DPIA was indicated) needs justification and mitigation controls", async () => {
    completeAll();
    setAnswer("C.q3", "YES"); // confirmed Yes -> full DPIA indicated
    await act(owner, { action: "submitScreening" });
    const base = { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "Low risk", opinionCategory: "RECOMMENDATIONS", opinionText: "Proceed with the controls recorded." } as const;
    expect(await status(act(dpo1, base))).toBe(422);
    expect(await status(act(dpo1, { ...base, exceptionJustification: "Technology is a vendor-certified, unchanged product" }))).toBe(422);
    expect(await status(act(dpo1, { ...base, exceptionJustification: "Unchanged vendor product", mitigationControls: "Access logging and quarterly review" }))).toBe(200);
    expect(table("screeningDecision")[0]).toMatchObject({ screeningIndicatedFull: true, decision: "PRE_ASSESSMENT_SUFFICIENT" });
  });

  it("a pre-assessment-only decision deactivates D-J and K2/K3 without deleting any answer", async () => {
    completeAll();
    setAnswer("D.launchDate", "2027-03-01");
    await act(owner, { action: "submitScreening" });
    await act(dpo1, { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "No indication", opinionCategory: "NO_OBJECTIONS", opinionText: "No objections." });
    const kept = table("responseField").find((f) => f.fieldId === "D.launchDate");
    expect(kept.value).toBe("2027-03-01"); // preserved
    const versionId = A().currentVersionId;
    const fields = table("responseField").filter((f) => f.versionId === versionId);
    const res = evaluateAssessment(buildModel(fields.map((f) => ({ fieldId: f.fieldId, recordId: f.recordId, value: f.value, state: f.state, rationale: f.rationale })), [], "PRE_ONLY"));
    expect(res.subsections.D1.active).toBe(false);
    expect(res.subsections.J2.active).toBe(false);
    expect(res.subsections.K2.active).toBe(false);
    expect(res.subsections.K4.active).toBe(true);
  });

  it("reopening a decided screening invalidates the decision, keeps history and requires renewed review", async () => {
    completeAll();
    await act(owner, { action: "submitScreening" });
    await act(dpo1, { action: "recordScreeningDecision", decision: "PROCEED_FULL", rationale: "Proceed" });
    await act(owner, { action: "reopenScreening" });
    expect(A()).toMatchObject({ screeningStatus: "INVALIDATED", screeningPath: "OPEN", lifecycle: "DRAFT" });
    expect(table("screeningDecision")[0].supersededAt).toBeTruthy(); // kept, marked superseded
    expect(table("snapshot")).toHaveLength(1);
    const edit = await save(owner, "C.q1.rationale", "changed after decision");
    expect(edit).toBe("saved");
    completeAll();
    await act(owner, { action: "submitScreening" });
    expect(table("snapshot")).toHaveLength(2); // a new snapshot; the earlier one is untouched
    expect(A().screeningStatus).toBe("AWAITING_DPO");
  });
});

async function toFullReview() {
  completeAll();
  await act(owner, { action: "submitScreening" });
  await act(dpo1, { action: "recordScreeningDecision", decision: "PROCEED_FULL", rationale: "Proceed" });
  completeAll();
  await act(owner, { action: "submitFull" });
}

describe("full review gate", () => {
  it("cannot be submitted before the DPO decides to proceed", async () => {
    completeAll();
    expect(await status(act(owner, { action: "submitFull" }))).toBe(409);
  });

  it("submitting creates an immutable snapshot and locks substantive editing, while comments stay open", async () => {
    await toFullReview();
    expect(A().lifecycle).toBe("IN_DPO_REVIEW");
    expect(table("snapshot").map((s) => s.kind)).toEqual(["SCREENING_SUBMITTED", "FULL_SUBMITTED"]);
    const edit = await save(owner, "D.launchDate", "2027-05-01");
    expect(edit).toBe("rejected");
    const c = await act(dpo1, { action: "addComment", subsectionId: "D2", fieldId: "D.launchDate", body: "Is this date firm?" });
    expect(c.threadId).toBeTruthy();
    expect(await status(act(contrib, { action: "addComment", subsectionId: "D2", body: "x" }))).toBe(404);
  });

  it("snapshots and opinions cannot be altered (immutability is enforced and never attempted)", async () => {
    await toFullReview();
    await expect(db.snapshot.updateMany({ where: {}, data: { contentHash: "x" } })).rejects.toThrow(/immutable/);
    await act(dpo1, { action: "submitOpinion", category: "NO_OBJECTIONS", opinionText: "No objections." });
    await expect(db.dpoOpinion.updateMany({ where: {}, data: { opinionText: "changed" } })).rejects.toThrow(/immutable/);
  });

  it("the owner can withdraw for editing and the snapshot is preserved", async () => {
    await toFullReview();
    await act(owner, { action: "withdrawFull" });
    expect(A().lifecycle).toBe("DRAFT");
    expect(table("snapshot")).toHaveLength(2);
    const edit = await save(owner, "D.launchDate", "2027-05-01");
    expect(edit).toBe("saved");
  });

  it("the DPO can request changes only with a comment; the owner then edits and resubmits", async () => {
    await toFullReview();
    expect(await status(act(dpo1, { action: "requestChanges", comment: " " }))).toBe(422);
    expect(await status(act(dpo2, { action: "requestChanges", comment: "Please clarify scope" }))).toBe(403);
    await act(dpo1, { action: "requestChanges", comment: "Please clarify scope" });
    expect(A().lifecycle).toBe("CHANGES_REQUESTED");
    expect(table("commentThread")).toHaveLength(1);
    const edit = await save(owner, "D.launchDate", "2027-06-01");
    expect(edit).toBe("saved");
    completeAll();
    await act(owner, { action: "submitFull" });
    expect(A().lifecycle).toBe("IN_DPO_REVIEW");
    expect(table("snapshot").filter((s) => s.kind === "FULL_SUBMITTED")).toHaveLength(2);
  });

  it("an opinion can be submitted despite unresolved issues; only the assigned DPO may submit it", async () => {
    await toFullReview();
    expect(await status(act(dpo2, { action: "submitOpinion", category: "NO_OBJECTIONS", opinionText: "x" }))).toBe(403);
    expect(await status(act(owner, { action: "submitOpinion", category: "NO_OBJECTIONS", opinionText: "x" }))).toBe(403);
    expect(await status(act(dpo1, { action: "submitOpinion", category: "RECOMMENDATIONS", opinionText: " " }))).toBe(422);
    await act(dpo1, { action: "submitOpinion", category: "RECOMMENDATIONS", opinionText: "Adopt the recommendations", recommendations: "Add retention limits" });
    expect(A().lifecycle).toBe("AWAITING_OWNER_DECISION");
  });

  it("an amendment is a new recorded opinion that supersedes the earlier one, which is never overwritten", async () => {
    await toFullReview();
    await act(dpo1, { action: "submitOpinion", category: "NO_OBJECTIONS", opinionText: "No objections." });
    expect(await status(act(owner, { action: "amendOpinion", category: "NO_OBJECTIONS", opinionText: "mine" }))).toBe(403);
    await act(dpo1, { action: "amendOpinion", category: "OBJECTIONS_REMAIN", opinionText: "New facts: objections now remain." });
    const ops = table("dpoOpinion");
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ category: "NO_OBJECTIONS", opinionText: "No objections." });
    expect(ops[1]).toMatchObject({ category: "OBJECTIONS_REMAIN", supersedesId: ops[0].id });
    expect(A().lifecycle).toBe("AWAITING_OWNER_DECISION");
  });
});

describe("owner decision, blocking issues and conditions", () => {
  async function toDecision(category: "NO_OBJECTIONS" | "RECOMMENDATIONS" | "OBJECTIONS_REMAIN" = "NO_OBJECTIONS") {
    await toFullReview();
    await act(dpo1, { action: "submitOpinion", category, opinionText: "Opinion text" });
  }

  it("requires a rationale and records the exact reviewed snapshot; approval finalises with a final snapshot", async () => {
    await toDecision();
    expect(await status(act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "" }))).toBe(422);
    expect(await status(act(dpo1, { action: "ownerDecision", decision: "APPROVED", rationale: "I approve" }))).toBe(403);
    await act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Risks are acceptable for this demo" });
    expect(A().lifecycle).toBe("FINALISED");
    const d = table("ownerDecision")[0];
    expect(d.reviewedSnapshotId).toBe(table("snapshot").find((s) => s.kind === "FULL_SUBMITTED").id);
    expect(table("snapshot").map((s) => s.kind)).toContain("FINALISED");
    expect(table("assessmentVersion")[0].kind).toBe("FINALISED");
  });

  it("an owner who departs from the DPO's recommendations must say so and explain; the opinion is preserved", async () => {
    await toDecision("RECOMMENDATIONS");
    expect(await status(act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Fine" }))).toBe(422);
    await act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Fine", departsFromDpo: true, departureRationale: "We accept the residual risk because the data is synthetic." });
    expect(table("ownerDecision")[0]).toMatchObject({ departsFromDpo: true });
    expect(table("dpoOpinion")[0].category).toBe("RECOMMENDATIONS");
  });

  it("a DPO blocking issue blocks approval until the ASSIGNED DPO resolves it; the owner's response never resolves it", async () => {
    await toFullReview();
    expect(await status(act(owner, { action: "raiseBlocking", reason: "x" }))).toBe(403);
    expect(await status(act(dpo2, { action: "raiseBlocking", reason: "x" }))).toBe(403);
    expect(await status(act(dpo1, { action: "raiseBlocking", reason: " " }))).toBe(422);
    const r = await act(dpo1, { action: "raiseBlocking", reason: "No lawful basis recorded for purpose 2", subsectionId: "E1" });
    await act(dpo1, { action: "submitOpinion", category: "RECOMMENDATIONS", opinionText: "See blocking issue." });
    expect(await status(act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "ok", departsFromDpo: true, departureRationale: "accept" }))).toBe(422);
    await act(owner, { action: "respondBlocking", issueId: r.issueId as string, response: "I disagree: the basis is documented elsewhere." });
    expect(table("blockingIssue")[0]).toMatchObject({ status: "OPEN", ownerResponse: "I disagree: the basis is documented elsewhere." });
    expect(await status(act(owner, { action: "resolveBlocking", issueId: r.issueId as string, resolutionNote: "resolved by me" }))).toBe(403);
    expect(await status(act(owner, { action: "ownerDecision", decision: "REJECTED", rationale: "Not proceeding" }))).toBe(200); // rejecting is still possible
  });

  it("after the assigned DPO resolves the issue, the owner can approve; the owner's disagreement stays recorded", async () => {
    await toFullReview();
    const r = await act(dpo1, { action: "raiseBlocking", reason: "Retention missing" });
    await act(dpo1, { action: "submitOpinion", category: "RECOMMENDATIONS", opinionText: "Fix retention." });
    await act(owner, { action: "respondBlocking", issueId: r.issueId as string, response: "Retention is in section 8.1" });
    expect(await status(act(dpo2, { action: "resolveBlocking", issueId: r.issueId as string, resolutionNote: "ok" }))).toBe(403);
    await act(dpo1, { action: "resolveBlocking", issueId: r.issueId as string, resolutionNote: "Confirmed in 8.1" });
    await act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Resolved", departsFromDpo: true, departureRationale: "Accepting the recommendation risk" });
    expect(A().lifecycle).toBe("FINALISED");
    expect(table("blockingIssue")[0]).toMatchObject({ status: "RESOLVED", ownerResponse: "Retention is in section 8.1" });
  });

  it("conditional approval needs conditions with owner and deadline, then awaits conditions", async () => {
    await toDecision();
    expect(await status(act(owner, { action: "ownerDecision", decision: "CONDITIONALLY_APPROVED", rationale: "Conditions apply" }))).toBe(422);
    expect(await status(act(owner, { action: "ownerDecision", decision: "CONDITIONALLY_APPROVED", rationale: "Conditions apply", conditions: [{ description: "Complete DPA", responsibleText: "Head of Legal" }] }))).toBe(422);
    await act(owner, { action: "ownerDecision", decision: "CONDITIONALLY_APPROVED", rationale: "Conditions apply", conditions: [{ description: "Complete DPA", responsibleUserId: "c1", deadline: "2026-12-31" }, { description: "Update privacy notice", responsibleText: "Head of Legal", deadline: "2027-01-31" }] });
    expect(A().lifecycle).toBe("AWAITING_CONDITIONS");
    expect(table("condition")).toHaveLength(2);
    expect(table("snapshot").map((s) => s.kind)).not.toContain("FINALISED");
  });

  it("a responsible person's progress is recorded separately and never approves; only the owner's confirmation does", async () => {
    await toDecision();
    table("assignment").push({ id: "as1", assessmentId: id, assigneeId: "c1", subsectionIds: ["H3"], status: "IN_PROGRESS", createdById: "o1" });
    await act(owner, { action: "ownerDecision", decision: "CONDITIONALLY_APPROVED", rationale: "Conditions apply", conditions: [{ description: "Complete DPA", responsibleUserId: "c1", deadline: "2026-12-31" }, { description: "Notice", responsibleText: "Legal", deadline: "2027-01-31" }] });
    const [c1, c2] = table("condition");
    expect(await status(act(contrib, { action: "recordProgress", itemType: "CONDITION", itemId: c2.id, status: "COMPLETED", note: "not mine" }))).toBe(403);
    expect(await status(act(contrib, { action: "recordProgress", itemType: "CONDITION", itemId: c1.id, status: "COMPLETED", note: "" }))).toBe(422);
    await act(contrib, { action: "recordProgress", itemType: "CONDITION", itemId: c1.id, status: "COMPLETED", note: "DPA signed, ref LEG-12" });
    expect(table("progressRecord")).toHaveLength(1);
    expect(A().lifecycle).toBe("AWAITING_CONDITIONS"); // progress alone approves nothing
    expect(await status(act(contrib, { action: "confirmCondition", conditionId: c1.id }))).toBe(403);
    await act(owner, { action: "confirmCondition", conditionId: c1.id, note: "Evidence seen" });
    expect(A().lifecycle).toBe("AWAITING_CONDITIONS"); // one condition left
    const last = await act(owner, { action: "confirmCondition", conditionId: c2.id });
    expect(last.approved).toBe(true);
    expect(A().lifecycle).toBe("FINALISED");
    expect(table("ownerDecision").map((d) => d.decision)).toEqual(["CONDITIONALLY_APPROVED", "APPROVED"]);
    expect(table("snapshot").map((s) => s.kind)).toContain("FINALISED");
  });

  it("a rejected decision is recorded and visible; it finalises the version without approving it", async () => {
    await toDecision();
    await act(owner, { action: "ownerDecision", decision: "REJECTED", rationale: "Not proceeding" });
    expect(A().lifecycle).toBe("FINALISED");
    expect(table("ownerDecision")[0].decision).toBe("REJECTED");
  });

  it("reopening for changes needs the owner, keeps every earlier record, and requires renewed review", async () => {
    await toDecision();
    expect(await status(act(dpo1, { action: "reopenForChanges" }))).toBe(403);
    await act(owner, { action: "reopenForChanges" });
    expect(A().lifecycle).toBe("DRAFT");
    expect(table("dpoOpinion")).toHaveLength(1);
    expect(table("snapshot")).toHaveLength(2);
    completeAll();
    await act(owner, { action: "submitFull" });
    expect(A().lifecycle).toBe("IN_DPO_REVIEW");
    expect(table("snapshot").filter((s) => s.kind === "FULL_SUBMITTED")).toHaveLength(2);
  });

  it("recording the owner decision does not itself require renewed review (no lock change beyond the decision)", async () => {
    await toDecision();
    await act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Approved" });
    expect(table("snapshot").filter((s) => s.kind === "FULL_SUBMITTED")).toHaveLength(1);
  });
});

describe("pre-assessment-only path", () => {
  it("the owner then records the final decision without a second submission", async () => {
    completeAll();
    await act(owner, { action: "submitScreening" });
    await act(dpo1, { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "No indication", opinionCategory: "NO_OBJECTIONS", opinionText: "No objections." });
    expect(await status(act(owner, { action: "submitFull" }))).toBe(409);
    expect(await status(act(owner, { action: "reopenForChanges" }))).toBe(409);
    await act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Pre-assessment sufficient" });
    expect(A().lifecycle).toBe("FINALISED");
    expect(table("ownerDecision")[0].reviewedSnapshotId).toBe(table("snapshot")[0].id);
  });
});

describe("CD-34: an earlier short opinion stays historical after the screening is reopened", () => {
  async function preOnlyThenReopen() {
    completeAll();
    await act(owner, { action: "submitScreening" });
    await act(dpo1, { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "No indication", opinionCategory: "NO_OBJECTIONS", opinionText: "Short opinion, first screening cycle." });
    expect(await status(act(owner, { action: "reopenScreening" }))).toBe(200);
  }

  it("keeps the short opinion and its snapshot unchanged, and the new cycle needs its own decision and opinion", async () => {
    await preOnlyThenReopen();
    const first = table("dpoOpinion")[0];
    expect(table("dpoOpinion")).toHaveLength(1);
    expect(first).toMatchObject({ kind: "SCREENING", opinionText: "Short opinion, first screening cycle." });
    expect(A()).toMatchObject({ screeningStatus: "INVALIDATED", screeningPath: "OPEN", lifecycle: "DRAFT" });
    // the old opinion cannot stand in for a new screening decision, a new full submission or an owner decision
    expect(await status(act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Using the old opinion" }))).toBe(409);
    expect(await status(act(owner, { action: "submitFull" }))).toBe(409);
    completeAll();
    await act(owner, { action: "submitScreening" });
    expect(await status(act(dpo1, { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "Again" }))).toBe(422); // a new short opinion is required
    expect(table("screeningDecision").filter((d) => !d.supersededAt)).toHaveLength(0);
    await act(dpo1, { action: "recordScreeningDecision", decision: "PROCEED_FULL", rationale: "Full assessment needed" });
    expect(await status(act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Using the old opinion" }))).toBe(409); // still no full-review opinion
    completeAll();
    await act(owner, { action: "submitFull" });
    expect(await status(act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Not yet reviewed" }))).toBe(409);
    await act(dpo1, { action: "submitOpinion", category: "RECOMMENDATIONS", opinionText: "Full review opinion." });
    expect(table("dpoOpinion")).toHaveLength(2);
    expect(table("dpoOpinion")[0]).toEqual(first); // unchanged
    expect(table("dpoOpinion")[1].kind).toBe("FULL");
    expect(table("dpoOpinion")[1].snapshotId).not.toBe(first.snapshotId);
    expect(A().lifecycle).toBe("AWAITING_OWNER_DECISION");
  });

  it("the governance data marks the earlier cycle's short opinion as an earlier screening cycle and leaves the rows unchanged", async () => {
    await preOnlyThenReopen();
    const before = JSON.stringify(table("dpoOpinion"));
    let g = await loadGovernance(dpo1, id);
    expect(g.opinions).toHaveLength(1);
    expect(g.opinions[0]).toMatchObject({ kind: "SCREENING", earlierScreeningCycle: true, superseded: false });
    completeAll();
    await act(owner, { action: "submitScreening" });
    await act(dpo1, { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "Still sufficient", opinionCategory: "RECOMMENDATIONS", opinionText: "Second cycle opinion." });
    g = await loadGovernance(dpo1, id);
    expect(g.opinions.map((o) => o.earlierScreeningCycle)).toEqual([true, false]);
    expect(JSON.stringify(table("dpoOpinion").slice(0, 1))).toBe(JSON.stringify(JSON.parse(before)));
  });

  it("after a new revision, earlier versions' decisions, opinions and owner decisions are labelled with their version and not as current, and the stored rows are unchanged", async () => {
    completeAll();
    await act(owner, { action: "submitScreening" });
    await act(dpo1, { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "No indication", opinionCategory: "NO_OBJECTIONS", opinionText: "No objections." });
    await act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Approved" });
    const before = JSON.stringify([table("screeningDecision"), table("dpoOpinion"), table("ownerDecision"), table("snapshot")]);
    let g = await loadGovernance(owner, id);
    expect([g.screeningDecisions[0].currentVersion, g.opinions[0].currentVersion, g.ownerDecisions[0].currentVersion]).toEqual([true, true, true]);
    await act(owner, { action: "startRevision", reason: "Review", changeDescription: "x", categories: ["other"] });
    g = await loadGovernance(owner, id);
    for (const r of [g.screeningDecisions[0], g.opinions[0], g.ownerDecisions[0]]) expect(r).toMatchObject({ versionNumber: "1.0", currentVersion: false });
    expect(g.versions.find((v) => v.current)?.versionNumber).toBe("2.0");
    expect(JSON.stringify([table("screeningDecision"), table("dpoOpinion"), table("ownerDecision"), table("snapshot")])).toBe(before);
  });

  it("the version data marks a rejected finalised version as rejected, and an approved one not", async () => {
    completeAll();
    await act(owner, { action: "submitScreening" });
    await act(dpo1, { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "No indication", opinionCategory: "NO_OBJECTIONS", opinionText: "No objections." });
    await act(owner, { action: "ownerDecision", decision: "REJECTED", rationale: "Not proceeding" });
    const g = await loadGovernance(owner, id);
    expect(g.state.lifecycle).toBe("FINALISED");
    expect(g.versions.find((v) => v.current)?.rejected).toBe(true);
  });

  it("a second pre-assessment-only decision records a new short opinion against the new screening snapshot", async () => {
    await preOnlyThenReopen();
    completeAll();
    await act(owner, { action: "submitScreening" });
    expect(await status(act(dpo1, { action: "recordScreeningDecision", decision: "PRE_ASSESSMENT_SUFFICIENT", rationale: "Still sufficient", opinionCategory: "RECOMMENDATIONS", opinionText: "Second cycle opinion." }))).toBe(200);
    const ops = table("dpoOpinion");
    expect(ops).toHaveLength(2);
    expect(ops[1].snapshotId).not.toBe(ops[0].snapshotId);
    expect(A().lifecycle).toBe("AWAITING_OWNER_DECISION");
  });
});

describe("versions, revisions, archive and deletion", () => {
  async function finalised() {
    await toFullReview();
    await act(dpo1, { action: "submitOpinion", category: "NO_OBJECTIONS", opinionText: "No objections." });
    await act(owner, { action: "ownerDecision", decision: "APPROVED", rationale: "Approved" });
  }

  it("starting a review creates a new draft revision with copied answers and keeps the finalised version intact", async () => {
    // an entity and a record to prove references are remapped
    const v1 = A().currentVersionId;
    table("entity").push({ id: "ent1", versionId: v1, kind: "PARTY", name: "Harbour Bank", revision: 1, deletedAt: null, createdById: "o1" });
    table("recordItem").push({ id: "ctrl1", versionId: v1, collection: "B.ctrl", parentId: null, ordering: 0, revision: 1, deletedAt: null, createdById: "o1" });
    setAnswer("B.ctrl.name", "ent1", "ctrl1");
    setAnswer("A.description", "Original description");
    await finalised();
    expect(await status(act(owner, { action: "startRevision", reason: "", changeDescription: "x", categories: [] }))).toBe(422);
    expect(await status(act(owner, { action: "startRevision", reason: "Annual review", changeDescription: "New vendor", categories: ["parties"] }))).toBe(200);
    const a = A();
    expect(a.currentVersionId).not.toBe(v1);
    expect(a).toMatchObject({ lifecycle: "DRAFT", screeningStatus: "NOT_SUBMITTED", screeningPath: "OPEN" });
    const versions = table("assessmentVersion");
    expect(versions.map((v) => v.versionNumber)).toEqual(["1.0", "2.0"]);
    expect(versions[0].kind).toBe("FINALISED");
    expect(versions[1]).toMatchObject({ carriedFromVersionId: v1, revisionReason: "Annual review", changeCategories: ["parties"] });
    // answers copied, not moved
    const copied = table("responseField").find((f) => f.versionId === a.currentVersionId && f.fieldId === "A.description");
    expect(copied.value).toBe("Original description");
    expect(table("responseField").find((f) => f.versionId === v1 && f.fieldId === "A.description").value).toBe("Original description");
    // entity + record ids remapped consistently
    const newEnt = table("entity").find((e) => e.versionId === a.currentVersionId);
    const newRec = table("recordItem").find((r) => r.versionId === a.currentVersionId && r.collection === "B.ctrl");
    expect(newEnt.id).not.toBe("ent1");
    const nameField = table("responseField").find((f) => f.versionId === a.currentVersionId && f.fieldId === "B.ctrl.name");
    expect(nameField.recordId).toBe(newRec.id);
    expect(nameField.value).toBe(newEnt.id);
    // approvals and opinions are not carried forward; earlier ones stay with the earlier version
    expect(table("dpoOpinion").every((o) => o.versionId === v1)).toBe(true);
    expect(table("reviewMark").filter((m) => m.versionId === a.currentVersionId).length).toBeGreaterThan(30);
    expect(table("event").map((e) => e.type)).toContain("NEW_REVISION");
  });

  it("CD-31: a new revision carries each measure's latest recorded status as an editable answer and leaves the old version and progress history unchanged", async () => {
    const v1 = A().currentVersionId;
    table("recordItem").push({ id: "risk1", versionId: v1, collection: "J.risk", parentId: null, ordering: 0, revision: 1, deletedAt: null, createdById: "o1" });
    for (const m of ["measA", "measB", "measC", "measD"]) table("recordItem").push({ id: m, versionId: v1, collection: "J.risk.measure", parentId: "risk1", ordering: 0, revision: 1, deletedAt: null, createdById: "o1" });
    setAnswer("J.risk.status", "IN_PROGRESS", "measA"); // completed after the decision
    setAnswer("J.risk.status", "COMPLETED", "measB"); // regressed after the decision (latest is not "Completed")
    setAnswer("J.risk.status", "IN_PROGRESS", "measC"); // no progress record: register status stays
    // measD has no register status and no progress
    await finalised();
    expect(await status(act(owner, { action: "recordProgress", itemType: "MEASURE", itemId: "measA", status: "IN_PROGRESS", note: "Started" }))).toBe(200);
    expect(await status(act(owner, { action: "recordProgress", itemType: "MEASURE", itemId: "measA", status: "COMPLETED", note: "Done, evidence EV-1" }))).toBe(200);
    expect(await status(act(owner, { action: "recordProgress", itemType: "MEASURE", itemId: "measB", status: "NOT_STARTED", note: "Control withdrawn" }))).toBe(200);
    expect(await status(act(owner, { action: "startRevision", reason: "Review", changeDescription: "Measures updated", categories: ["other"] }))).toBe(200);
    const v2 = A().currentVersionId;
    const rec = (version: string, collection: string) => table("recordItem").filter((r) => r.versionId === version && r.collection === collection);
    const newId = (i: number) => rec(v2, "J.risk.measure")[i].id;
    const statusIn = (version: string, recordId: string) => table("responseField").find((f) => f.versionId === version && f.fieldId === "J.risk.status" && f.recordId === recordId);
    expect(statusIn(v2, newId(0))).toMatchObject({ value: "COMPLETED", state: "ANSWERED", revision: 1 });
    expect(statusIn(v2, newId(1))?.value).toBe("NOT_STARTED");
    expect(statusIn(v2, newId(2))?.value).toBe("IN_PROGRESS");
    expect(statusIn(v2, newId(3))?.value ?? null).toBeNull(); // no register status and no progress: nothing invented (the test helper may have filled it "Not sure")
    // old version's register answers are unchanged; progress history stays with the old version only
    expect(statusIn(v1, "measA")?.value).toBe("IN_PROGRESS");
    expect(statusIn(v1, "measB")?.value).toBe("COMPLETED");
    expect(table("progressRecord")).toHaveLength(3);
    expect(table("progressRecord").every((p) => p.versionId === v1)).toBe(true);
    // the new draft's section is still marked as carried forward and the carry-forward is logged
    expect(table("reviewMark").some((m) => m.versionId === v2 && m.subsectionId === "J2" && !m.confirmedAt)).toBe(true);
    expect(table("event").find((e) => e.type === "NEW_REVISION")?.payload).toMatchObject({ measureStatusesCarriedForward: 2 });
    // the carried answer is an ordinary editable answer
    expect(await save(owner, "J.risk.status", "IN_PROGRESS", newId(0))).not.toBe("rejected");
  });

  it("a carried-forward section must be confirmed as reviewed before submission, and the screening is revisited", async () => {
    await finalised();
    await act(owner, { action: "startRevision", reason: "Review", changeDescription: "Changes", categories: ["other"] });
    completeAll();
    expect(await status(act(owner, { action: "submitScreening" }))).toBe(422); // unreviewed A-C sections block
    for (const s of ["A1", "A2", "B1", "B2", "C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"]) await act(owner, { action: "confirmReviewed", subsectionId: s });
    expect(await status(act(owner, { action: "submitScreening" }))).toBe(200);
  });

  it("a new review is possible only from a finalised assessment", async () => {
    expect(await status(act(owner, { action: "startRevision", reason: "x", changeDescription: "y", categories: [] }))).toBe(409);
  });

  it("hard deletion is allowed only for an owner's never-submitted draft; submitted assessments can only be archived", async () => {
    expect(await status(act(owner2, { action: "deleteDraft", confirm: true }))).toBe(404);
    expect(await status(act(owner, { action: "deleteDraft", confirm: true }))).toBe(200);
    expect(table("assessment")).toHaveLength(0);
    expect(table("reviewMark")).toHaveLength(0); // review marks are removed explicitly; other rows cascade in the database (verify on Railway)
  });

  it("an assessment ever submitted cannot be deleted, only archived and restored by the owner", async () => {
    completeAll();
    await act(owner, { action: "submitScreening" });
    await act(owner, { action: "withdrawScreening" });
    expect(A().everSubmitted).toBe(true);
    expect(await status(act(owner, { action: "deleteDraft", confirm: true }))).toBe(409);
    expect(await status(act(contrib, { action: "archive" }))).toBe(404);
    await act(owner, { action: "archive" });
    expect(A()).toMatchObject({ lifecycle: "ARCHIVED", archivedFrom: "DRAFT" });
    const edit = await save(owner, "A.description", "x");
    expect(edit).toBe("rejected"); // archived is read-only
    expect(await status(act(dpo1, { action: "restore" }))).toBe(403);
    await act(owner, { action: "restore" });
    expect(A()).toMatchObject({ lifecycle: "DRAFT", archivedFrom: null });
  });
});

describe("ownership transfer and DPO reassignment", () => {
  it("only the owner can transfer, only to another process owner who is not the assigned DPO, and it is logged", async () => {
    expect(await status(act(owner2, { action: "transferOwnership", newOwnerId: "o2" }))).toBe(404);
    expect(await status(act(owner, { action: "transferOwnership", newOwnerId: "c1" }))).toBe(400); // not a process owner
    expect(await status(act(owner, { action: "transferOwnership", newOwnerId: "d1" }))).toBe(400);
    expect(await status(act(owner, { action: "transferOwnership", newOwnerId: "o1" }))).toBe(400);
    await act(owner, { action: "transferOwnership", newOwnerId: "o2", keepAsViewer: true });
    expect(A().ownerId).toBe("o2");
    const ev = table("event").find((e) => e.type === "OWNERSHIP_TRANSFERRED");
    expect(ev.payload).toMatchObject({ from: "o1", to: "o2", keptAsViewer: true });
    expect(await status(act(owner, { action: "archive" }))).toBe(403); // no longer the owner
    expect(table("assessmentAccess")[0]).toMatchObject({ userId: "o1", kind: "SHARED_VIEW" });
  });

  it("CD-33: 'keep me as a viewer' reuses an existing active share instead of creating a duplicate, and the share can still be revoked", async () => {
    await act(owner, { action: "transferOwnership", newOwnerId: "o2", keepAsViewer: true }); // o1 now holds one share
    const original = { ...table("assessmentAccess")[0] };
    await act(owner2, { action: "transferOwnership", newOwnerId: "o1" }); // back to o1 without keeping a share; o1's share remains active
    expect(table("assessmentAccess").filter((x) => x.userId === "o1" && !x.revokedAt)).toHaveLength(1);
    await act(owner, { action: "transferOwnership", newOwnerId: "o2", keepAsViewer: true });
    const active = table("assessmentAccess").filter((x) => x.userId === "o1" && !x.revokedAt);
    expect(active).toHaveLength(1);
    expect(table("assessmentAccess")).toHaveLength(1);
    expect(active[0]).toEqual(original); // the existing row is untouched: same id, kind, grantor, dates
    expect(active[0].revokedAt ?? null).toBeNull();
    const evs = table("event").filter((e) => e.type === "OWNERSHIP_TRANSFERRED");
    expect(evs[evs.length - 1].payload).toMatchObject({ from: "o1", to: "o2", keptAsViewer: true, reusedExistingShare: true });
    expect(evs[0].payload).toMatchObject({ reusedExistingShare: false });
    // the owner can still revoke it (previous owner is no longer owner here)
    expect(await status(act(owner2, { action: "revokeAccess", userId: "o1" }))).toBe(200);
    expect(table("assessmentAccess").filter((x) => x.userId === "o1" && !x.revokedAt)).toHaveLength(0);
  });

  it("without 'keep as viewer' the previous owner loses access", async () => {
    await act(owner, { action: "transferOwnership", newOwnerId: "o2" });
    expect(await status(act(owner, { action: "grantAccess", userId: "c1" }))).toBe(404);
  });

  it("only the demo administrator can reassign the DPO; a reason is required; the owner cannot become the DPO", async () => {
    expect(await status(act(owner, { action: "reassignDpo", newDpoId: "d2", reason: "x" }))).toBe(403);
    expect(await status(act(dpo1, { action: "reassignDpo", newDpoId: "d2", reason: "x" }))).toBe(403);
    expect(await status(act(admin, { action: "reassignDpo", newDpoId: "d2", reason: " " }))).toBe(422);
    expect(await status(act(admin, { action: "reassignDpo", newDpoId: "o1", reason: "x" }))).toBe(400);
    expect(await status(act(admin, { action: "reassignDpo", newDpoId: "d2", reason: "Conflict of interest" }))).toBe(200);
    expect(A().assignedDpoId).toBe("d2");
    expect(table("event").find((e) => e.type === "DPO_REASSIGNED").payload).toMatchObject({ previousDpoId: "d1", newDpoId: "d2", reason: "Conflict of interest" });
  });

  it("a pending review moves to the new DPO and earlier decisions keep their original author", async () => {
    completeAll();
    await act(owner, { action: "submitScreening" });
    await act(admin, { action: "reassignDpo", newDpoId: "d2", reason: "Workload" });
    expect(await status(act(dpo1, { action: "recordScreeningDecision", decision: "PROCEED_FULL", rationale: "x" }))).toBe(403);
    await act(dpo2, { action: "recordScreeningDecision", decision: "PROCEED_FULL", rationale: "Proceed" });
    expect(table("screeningDecision")[0].dpoId).toBe("d2");
    await act(admin, { action: "reassignDpo", newDpoId: "d1", reason: "Back again" });
    expect(table("screeningDecision")[0].dpoId).toBe("d2"); // original author preserved
  });
});

describe("assignments, sharing and comments", () => {
  it("the owner assigns subsections; the contributor edits only those, then completion ends editing rights", async () => {
    const r = await act(owner, { action: "createAssignment", assigneeId: "c1", subsectionIds: ["H3"], taskDescription: "Describe security", deadline: "2026-12-01" });
    const ok = await save(contrib, "H.sec.measures", "MFA");
    expect(ok).toBe("saved");
    const no = await save(contrib, "H.min.necessary", "x");
    expect(no).toBe("rejected");
    await act(contrib, { action: "setAssignmentStatus", assignmentId: r.assignmentId as string, status: "IN_PROGRESS" });
    await act(contrib, { action: "setAssignmentStatus", assignmentId: r.assignmentId as string, status: "COMPLETED" });
    const after = await save(contrib, "H.sec.measures", "MFA and keys");
    expect(after).toBe("rejected");
    await act(owner, { action: "updateAssignment", assignmentId: r.assignmentId as string, status: "PENDING" }); // owner reopens
    const again = await save(contrib, "H.sec.measures", "MFA and keys");
    expect(again).toBe("saved");
    expect(table("event").map((e) => e.type)).toEqual(expect.arrayContaining(["ASSIGNMENT_CREATED", "ASSIGNMENT_STARTED", "ASSIGNMENT_COMPLETED", "ASSIGNMENT_REOPENED"]));
  });

  it("formal decision and administrative subsections cannot be assigned; the DPO and unknown users cannot be assignees", async () => {
    const base = { action: "createAssignment" as const, taskDescription: "x", subsectionIds: ["K4"] };
    expect(await status(act(owner, { ...base, assigneeId: "c1" }))).toBe(400);
    expect(await status(act(owner, { ...base, subsectionIds: ["C9"], assigneeId: "c1" }))).toBe(400);
    expect(await status(act(owner, { ...base, subsectionIds: ["H3"], assigneeId: "d1" }))).toBe(400);
    expect(await status(act(owner, { ...base, subsectionIds: ["H3"], assigneeId: "o1" }))).toBe(400);
    expect(await status(act(owner, { ...base, subsectionIds: ["H3"], assigneeId: "nobody" }))).toBe(400);
    expect(await status(act(contrib, { ...base, subsectionIds: ["H3"], assigneeId: "c1" }))).toBe(404);
  });

  it("a cancelled assignment gives no access; a contributor cannot assign, share or transfer", async () => {
    const r = await act(owner, { action: "createAssignment", assigneeId: "c1", subsectionIds: ["H3"], taskDescription: "x" });
    expect(await status(act(contrib, { action: "grantAccess", userId: "x1" }))).toBe(403);
    expect(await status(act(contrib, { action: "transferOwnership", newOwnerId: "o2" }))).toBe(403);
    await act(owner, { action: "updateAssignment", assignmentId: r.assignmentId as string, status: "CANCELLED" });
    expect(await status(act(contrib, { action: "addComment", subsectionId: "H3", body: "hi" }))).toBe(404);
  });

  it("sharing is explicit, logged and gives view access without commenting or editing; revoking removes it", async () => {
    await act(owner, { action: "grantAccess", userId: "x1" });
    expect(await status(act(owner, { action: "grantAccess", userId: "x1" }))).toBe(409);
    expect(await status(act(stranger, { action: "addComment", subsectionId: "A1", body: "hi" }))).toBe(403); // viewer cannot comment
    const edit = await save(stranger, "A.description", "x");
    expect(edit).toBe("rejected");
    await act(owner, { action: "revokeAccess", userId: "x1" });
    expect(await status(act(stranger, { action: "addComment", subsectionId: "A1", body: "hi" }))).toBe(404);
    expect(table("event").map((e) => e.type)).toEqual(expect.arrayContaining(["ACCESS_GRANTED", "ACCESS_REVOKED"]));
  });

  it("question-level comments: replies, resolve and reopen by owner, assignee or DPO; unresolved threads remain", async () => {
    await act(owner, { action: "createAssignment", assigneeId: "c1", subsectionIds: ["H3"], taskDescription: "x" });
    const first = await act(contrib, { action: "addComment", subsectionId: "H3", fieldId: "H.sec.measures", body: "Which MFA product?" });
    const reply = await act(owner, { action: "addComment", subsectionId: "H3", fieldId: "H.sec.measures", threadId: first.threadId as string, body: "Authenticator app.", parentId: first.commentId as string });
    expect(reply.threadId).toBe(first.threadId);
    expect(table("comment")).toHaveLength(2);
    await act(dpo2, { action: "resolveThread", threadId: first.threadId as string }); // another DPO may comment/resolve, not edit
    expect(table("commentThread")[0].state).toBe("RESOLVED");
    await act(owner, { action: "reopenThread", threadId: first.threadId as string });
    expect(table("commentThread")[0].state).toBe("OPEN");
    expect(await status(act(owner, { action: "addComment", subsectionId: "H3", fieldId: "Not.A.Field", body: "x" }))).toBe(400);
    expect(await status(act(owner, { action: "addComment", subsectionId: "H3", body: " " }))).toBe(422);
  });

  it("comments marked as review comments are those written by DPO users", async () => {
    await act(dpo1, { action: "addComment", subsectionId: "A1", body: "Please reword" });
    await act(owner, { action: "addComment", subsectionId: "A1", body: "Done" });
    expect(table("comment").map((c) => c.isReview)).toEqual([true, false]);
  });
});

describe("review schedule changes are logged without a new revision", () => {
  it("saving the review date records an event and updates the register date", async () => {
    await save(owner, "K.review.periodic", "YES");
    await save(owner, "K.review.interval", "2027-06-30");
    expect(A().nextReviewDate.toISOString().slice(0, 10)).toBe("2027-06-30");
    expect(table("event").filter((e) => e.type === "REVIEW_DATE_CHANGED").length).toBeGreaterThanOrEqual(2);
    expect(table("assessmentVersion")).toHaveLength(1); // administrative: no new revision
    expect(A().lifecycle).toBe("DRAFT");
  });
  it("a contributor cannot change the review schedule even if assigned that subsection", async () => {
    table("assignment").push({ id: "as1", assessmentId: id, assigneeId: "c1", subsectionIds: ["K5"], status: "IN_PROGRESS", createdById: "o1" });
    expect(await save(contrib, "K.review.periodic", "YES")).toBe("rejected");
  });
});

describe("measure progress", () => {
  it("the responsible person records progress separately without editing the register", async () => {
    const v = A().currentVersionId;
    table("recordItem").push({ id: "risk1", versionId: v, collection: "J.risk", parentId: null, ordering: 0, revision: 1, deletedAt: null, createdById: "o1" });
    table("recordItem").push({ id: "meas1", versionId: v, collection: "J.risk.measure", parentId: "risk1", ordering: 0, revision: 1, deletedAt: null, createdById: "o1" });
    setAnswer("J.risk.owner", { userId: "c1" }, "meas1");
    table("assignment").push({ id: "as1", assessmentId: id, assigneeId: "c1", subsectionIds: ["J2"], status: "IN_PROGRESS", createdById: "o1" });
    expect(await status(act(contrib, { action: "recordProgress", itemType: "MEASURE", itemId: "meas1", status: "IN_PROGRESS", note: "Started rollout" }))).toBe(200);
    expect(await status(act(stranger, { action: "recordProgress", itemType: "MEASURE", itemId: "meas1", status: "COMPLETED", note: "x" }))).toBe(404);
    expect(table("progressRecord")).toHaveLength(1);
    expect(table("responseField").some((f) => f.fieldId === "J.risk.status")).toBe(false);
  });
});
