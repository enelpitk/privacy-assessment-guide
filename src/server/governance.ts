// Collaboration and governance use cases. Every action rechecks permissions and state on the server,
// and every state change is a guarded, atomic update inside one transaction.
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";
import { SUBSECTIONS, TEMPLATE_VERSION, fieldIndex, subsectionById } from "@/content";
import { buildModel, evaluateAssessment, type RecordRow } from "@/domain/model";
import type { AccessCtx, Lifecycle, Role, ScreeningStatus } from "@/domain/permissions";
import { buildSnapshotPayload, stableStringify, type SnapshotPayload, type SnapshotScope } from "@/domain/snapshot";
import {
  SCREENING_SUBSECTIONS,
  canWorkflow,
  checkState,
  nextVersionNumber,
  patchFor,
  rolesOf,
  submissionBlockers,
  validateOpinion,
  validateOwnerDecision,
  validateScreeningDecision,
  type OpinionCategory,
  type Path,
  type WfAction,
  type WfState,
} from "@/domain/workflow";
import { buildAccessCtx } from "./access";
import type { ActionInput } from "./actionSchema";

type Db = Prisma.TransactionClient;

import { NON_ASSIGNABLE } from "./assignable";
export { NON_ASSIGNABLE };
const PROGRESS_STATES: Lifecycle[] = ["DRAFT", "CHANGES_REQUESTED", "AWAITING_OWNER_DECISION", "AWAITING_CONDITIONS", "FINALISED"];

const toDate = (s?: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
const validDate = (s?: string | null) => !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)));

// ------------------------------------------------------------------ loading

export interface Loaded {
  assessment: NonNullable<Awaited<ReturnType<typeof prisma.assessment.findUnique>>>;
  ctx: AccessCtx;
  versionId: string;
  state: WfState;
}

export async function stateOf(db: Db, a: { id: string; lifecycle: string; screeningStatus: string; screeningPath: string; everSubmitted: boolean; currentVersionId: string | null }): Promise<WfState> {
  const versionId = a.currentVersionId!;
  const [blocking, opinions] = await Promise.all([
    db.blockingIssue.count({ where: { assessmentId: a.id, versionId, status: "OPEN" } }),
    db.dpoOpinion.findMany({ where: { assessmentId: a.id, versionId }, orderBy: { createdAt: "asc" } }),
  ]);
  const superseded = new Set(opinions.map((o) => o.supersedesId).filter(Boolean));
  const latest = [...opinions].reverse().find((o) => !superseded.has(o.id));
  return {
    lifecycle: a.lifecycle as Lifecycle,
    screeningStatus: a.screeningStatus as ScreeningStatus,
    path: a.screeningPath as Path,
    everSubmitted: a.everSubmitted,
    openBlocking: blocking,
    latestOpinion: (latest?.category as OpinionCategory | undefined) ?? null,
  };
}

export async function load(user: CurrentUser, assessmentId: string, opts: { admin?: boolean } = {}): Promise<Loaded> {
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) throw new HttpError(404, "Assessment not found.");
  const ctx = await buildAccessCtx(user, assessment);
  const visible =
    assessment.ownerId === user.id || user.roles.includes("DPO") || ctx.isAssignee || ctx.sharedViewer || (opts.admin && user.roles.includes("ADMIN"));
  if (!visible) throw new HttpError(404, "Assessment not found.");
  if (!assessment.currentVersionId) throw new HttpError(500, "Assessment has no current version.");
  return { assessment, ctx, versionId: assessment.currentVersionId, state: await stateOf(prisma, assessment) };
}

function gate(user: CurrentUser, l: Loaded, action: WfAction, extra: { isResponsible?: boolean } = {}) {
  const p = canWorkflow(user, l.ctx, action, extra);
  if (!p.ok) throw new HttpError(403, p.reason);
  const s = checkState(action, l.state);
  if (!s.ok) throw new HttpError(409, s.reason);
}

async function readContent(db: Db, versionId: string) {
  const [fields, records, entities] = await Promise.all([
    db.responseField.findMany({ where: { versionId } }),
    db.recordItem.findMany({ where: { versionId, deletedAt: null } }),
    db.entity.findMany({ where: { versionId, deletedAt: null } }),
  ]);
  const editorIds = [...new Set(fields.map((f) => f.lastEditorId))];
  const editors = await db.user.findMany({ where: { id: { in: editorIds } } });
  const nameById = new Map(editors.map((u) => [u.id, u.displayName]));
  return {
    responses: fields.map((f) => ({
      fieldId: f.fieldId,
      recordId: f.recordId,
      value: f.value as unknown,
      state: f.state,
      rationale: f.rationale,
      revision: f.revision,
      editorName: nameById.get(f.lastEditorId),
    })),
    records: records.map((r) => ({ id: r.id, collection: r.collection, parentId: r.parentId, ordering: r.ordering, revision: r.revision })) as (RecordRow & { revision: number })[],
    entities: entities.map((e) => ({ id: e.id, kind: e.kind as string, name: e.name })),
  };
}

async function event(db: Db, l: { assessment: { id: string }; versionId: string }, actorId: string, type: string, payload: Record<string, unknown> = {}) {
  await db.event.create({
    data: { assessmentId: l.assessment.id, versionId: l.versionId, actorId, type, payload: payload as Prisma.InputJsonValue },
  });
}

/** Guarded state change: succeeds only if nobody changed the state since it was read. */
async function applyPatch(db: Db, l: Loaded, patch: object) {
  // The domain patch names the screening path "path"; the column is "screeningPath".
  const { path, ...rest } = patch as { path?: string } & Record<string, unknown>;
  const data = (path ? { ...rest, screeningPath: path } : rest) as Prisma.AssessmentUpdateManyMutationInput;
  const res = await db.assessment.updateMany({
    where: { id: l.assessment.id, lifecycle: l.assessment.lifecycle, screeningStatus: l.assessment.screeningStatus, screeningPath: l.assessment.screeningPath },
    data,
  });
  if (res.count !== 1) throw new HttpError(409, "The assessment was changed by someone else. Reload and try again.");
}

async function makeSnapshot(db: Db, l: Loaded, user: CurrentUser, scope: SnapshotScope, kind: "SCREENING_SUBMITTED" | "FULL_SUBMITTED" | "FINALISED", pathOverride?: Path) {
  const version = await db.assessmentVersion.findUnique({ where: { id: l.versionId } });
  const c = await readContent(db, l.versionId);
  const payload = buildSnapshotPayload({
    scope,
    versionNumber: version?.versionNumber ?? "1.0",
    path: pathOverride ?? (l.state.path as Path),
    takenAt: new Date().toISOString(),
    ownerId: l.assessment.ownerId,
    assignedDpoId: l.assessment.assignedDpoId,
    ...c,
  });
  const contentHash = createHash("sha256").update(stableStringify(payload)).digest("hex");
  const snap = await db.snapshot.create({
    data: { assessmentId: l.assessment.id, versionId: l.versionId, kind, takenById: user.id, contentHash, payload: payload as unknown as Prisma.InputJsonValue },
  });
  return { snap, payload };
}

async function blockersFor(db: Db, l: Loaded, subsections?: string[]) {
  const c = await readContent(db, l.versionId);
  const model = buildModel(c.responses, c.records, l.state.path);
  const result = evaluateAssessment(model);
  const marks = await db.reviewMark.findMany({ where: { versionId: l.versionId, confirmedAt: null } });
  return submissionBlockers(result, { subsections, unreviewed: marks.map((m) => m.subsectionId) });
}

function fail(errors: string[]): never {
  throw new HttpError(422, errors.join(" "), errors);
}

// ------------------------------------------------------------------ screening gate

async function submitScreening(user: CurrentUser, l: Loaded) {
  gate(user, l, "submitScreening");
  const blockers = await blockersFor(prisma, l, SCREENING_SUBSECTIONS);
  if (blockers.length) throw new HttpError(422, "The pre-assessment is not ready to submit.", blockers);
  return prisma.$transaction(async (tx) => {
    const { snap } = await makeSnapshot(tx, l, user, "SCREENING", "SCREENING_SUBMITTED");
    await applyPatch(tx, l, patchFor("submitScreening", l.state));
    await event(tx, l, user.id, "SCREENING_SUBMITTED", { snapshotId: snap.id });
    return { snapshotId: snap.id };
  });
}

async function withdrawScreening(user: CurrentUser, l: Loaded) {
  gate(user, l, "withdrawScreening");
  await prisma.$transaction(async (tx) => {
    await applyPatch(tx, l, patchFor("withdrawScreening", l.state));
    await event(tx, l, user.id, "SCREENING_WITHDRAWN");
  });
  return {};
}

async function reopenScreening(user: CurrentUser, l: Loaded) {
  gate(user, l, "reopenScreening");
  await prisma.$transaction(async (tx) => {
    // Earlier decisions and opinions stay in the history; the decision is marked as superseded.
    await tx.screeningDecision.updateMany({ where: { assessmentId: l.assessment.id, versionId: l.versionId, supersededAt: null }, data: { supersededAt: new Date() } });
    await applyPatch(tx, l, patchFor("reopenScreening", l.state));
    await event(tx, l, user.id, "SCREENING_REOPENED", { previousPath: l.state.path });
  });
  return {};
}

async function recordScreeningDecision(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "recordScreeningDecision" }>) {
  gate(user, l, "recordScreeningDecision");
  const snap = await prisma.snapshot.findFirst({
    where: { assessmentId: l.assessment.id, versionId: l.versionId, kind: "SCREENING_SUBMITTED" },
    orderBy: { takenAt: "desc" },
  });
  if (!snap) throw new HttpError(409, "There is no submitted screening snapshot.");
  const indicatedFull = Boolean((snap.payload as unknown as SnapshotPayload).screening?.fullDpiaIndicated);
  const errors = validateScreeningDecision(i, indicatedFull);
  if (errors.length) fail(errors);
  return prisma.$transaction(async (tx) => {
    await tx.screeningDecision.create({
      data: {
        assessmentId: l.assessment.id,
        versionId: l.versionId,
        snapshotId: snap.id,
        dpoId: user.id,
        decision: i.decision,
        rationale: i.rationale.trim(),
        exceptionJustification: i.exceptionJustification?.trim() || null,
        mitigationControls: i.mitigationControls?.trim() || null,
        advice: i.advice?.trim() || null,
        screeningIndicatedFull: indicatedFull,
      },
    });
    if (i.decision === "PRE_ASSESSMENT_SUFFICIENT") {
      // Pre-assessment-only: the short formal opinion is recorded in the same action.
      await tx.dpoOpinion.create({
        data: {
          assessmentId: l.assessment.id,
          versionId: l.versionId,
          snapshotId: snap.id,
          dpoId: user.id,
          kind: "SCREENING",
          category: i.opinionCategory!,
          opinionText: i.opinionText!.trim(),
        },
      });
    }
    await applyPatch(tx, l, patchFor("recordScreeningDecision", l.state, { screening: i.decision }));
    await event(tx, l, user.id, "SCREENING_DECIDED", { decision: i.decision, indicatedFull, exception: indicatedFull && i.decision === "PRE_ASSESSMENT_SUFFICIENT" });
    return {};
  });
}

// ------------------------------------------------------------------ full review gate

async function submitFull(user: CurrentUser, l: Loaded) {
  gate(user, l, "submitFull");
  const blockers = await blockersFor(prisma, l);
  if (blockers.length) throw new HttpError(422, "The assessment is not ready to submit.", blockers);
  return prisma.$transaction(async (tx) => {
    const { snap } = await makeSnapshot(tx, l, user, "FULL", "FULL_SUBMITTED");
    await applyPatch(tx, l, patchFor("submitFull", l.state));
    await event(tx, l, user.id, "SUBMITTED_FOR_REVIEW", { snapshotId: snap.id });
    return { snapshotId: snap.id };
  });
}

async function withdrawFull(user: CurrentUser, l: Loaded) {
  gate(user, l, "withdrawFull");
  await prisma.$transaction(async (tx) => {
    await applyPatch(tx, l, patchFor("withdrawFull", l.state));
    await event(tx, l, user.id, "WITHDRAWN_FOR_EDITING");
  });
  return {};
}

async function addThreadComment(db: Db, l: Loaded, user: CurrentUser, p: { subsectionId: string; fieldId?: string; recordId?: string; threadId?: string; parentId?: string; body: string; isReview: boolean }) {
  let threadId = p.threadId;
  if (!threadId) {
    const t = await db.commentThread.create({
      data: { assessmentId: l.assessment.id, versionId: l.versionId, subsectionId: p.subsectionId, fieldId: p.fieldId ?? null, recordId: p.recordId || null, createdById: user.id },
    });
    threadId = t.id;
  }
  return db.comment.create({ data: { threadId, authorId: user.id, body: p.body.trim(), parentId: p.parentId ?? null, isReview: p.isReview } });
}

async function requestChanges(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "requestChanges" }>) {
  gate(user, l, "requestChanges");
  if (!i.comment.trim()) fail(["Explain what needs to change: a comment is required."]);
  await prisma.$transaction(async (tx) => {
    await addThreadComment(tx, l, user, { subsectionId: "K1", body: i.comment, isReview: true });
    await applyPatch(tx, l, patchFor("requestChanges", l.state));
    await event(tx, l, user.id, "CHANGES_REQUESTED");
  });
  return {};
}

async function submitOpinion(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "submitOpinion" }>) {
  gate(user, l, "submitOpinion");
  const errors = validateOpinion(i);
  if (errors.length) fail(errors);
  const snap = await prisma.snapshot.findFirst({ where: { assessmentId: l.assessment.id, versionId: l.versionId, kind: "FULL_SUBMITTED" }, orderBy: { takenAt: "desc" } });
  if (!snap) throw new HttpError(409, "There is no submitted snapshot to review.");
  await prisma.$transaction(async (tx) => {
    await tx.dpoOpinion.create({
      data: { assessmentId: l.assessment.id, versionId: l.versionId, snapshotId: snap.id, dpoId: user.id, kind: "FULL", category: i.category, opinionText: i.opinionText.trim(), recommendations: i.recommendations?.trim() || null },
    });
    await applyPatch(tx, l, patchFor("submitOpinion", l.state));
    await event(tx, l, user.id, "DPO_OPINION_SUBMITTED", { category: i.category, openBlocking: l.state.openBlocking });
  });
  return {};
}

async function amendOpinion(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "amendOpinion" }>) {
  gate(user, l, "amendOpinion");
  const errors = validateOpinion(i);
  if (errors.length) fail(errors);
  const opinions = await prisma.dpoOpinion.findMany({ where: { assessmentId: l.assessment.id, versionId: l.versionId }, orderBy: { createdAt: "asc" } });
  const sup = new Set(opinions.map((o) => o.supersedesId).filter(Boolean));
  const latest = [...opinions].reverse().find((o) => !sup.has(o.id));
  if (!latest) throw new HttpError(409, "There is no opinion to amend.");
  // An amendment is a NEW recorded opinion that supersedes the earlier one; the earlier one is never overwritten.
  await prisma.$transaction(async (tx) => {
    await tx.dpoOpinion.create({
      data: { assessmentId: l.assessment.id, versionId: l.versionId, snapshotId: latest.snapshotId, dpoId: user.id, kind: latest.kind, category: i.category, opinionText: i.opinionText.trim(), recommendations: i.recommendations?.trim() || null, supersedesId: latest.id },
    });
    await event(tx, l, user.id, "DPO_OPINION_AMENDED", { category: i.category, supersedes: latest.id });
  });
  return {};
}

async function raiseBlocking(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "raiseBlocking" }>) {
  gate(user, l, "raiseBlocking");
  if (!i.reason.trim()) fail(["A blocking issue needs a reason."]);
  const issue = await prisma.$transaction(async (tx) => {
    const b = await tx.blockingIssue.create({ data: { assessmentId: l.assessment.id, versionId: l.versionId, subsectionId: i.subsectionId ?? null, reason: i.reason.trim(), raisedById: user.id } });
    await event(tx, l, user.id, "BLOCKING_ISSUE_RAISED", { issueId: b.id });
    return b;
  });
  return { issueId: issue.id };
}

async function resolveBlocking(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "resolveBlocking" }>) {
  gate(user, l, "resolveBlocking");
  if (!i.resolutionNote.trim()) fail(["Say how the issue was resolved."]);
  await prisma.$transaction(async (tx) => {
    const res = await tx.blockingIssue.updateMany({
      where: { id: i.issueId, assessmentId: l.assessment.id, versionId: l.versionId, status: "OPEN" },
      data: { status: "RESOLVED", resolvedById: user.id, resolvedAt: new Date(), resolutionNote: i.resolutionNote.trim() },
    });
    if (res.count !== 1) throw new HttpError(409, "That issue is not open.");
    await event(tx, l, user.id, "BLOCKING_ISSUE_RESOLVED", { issueId: i.issueId });
  });
  return {};
}

async function respondBlocking(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "respondBlocking" }>) {
  gate(user, l, "respondBlocking");
  if (!i.response.trim()) fail(["Write your response."]);
  // The owner's disagreement is recorded. It never resolves the issue: only the assigned DPO can.
  const res = await prisma.blockingIssue.updateMany({
    where: { id: i.issueId, assessmentId: l.assessment.id, versionId: l.versionId },
    data: { ownerResponse: i.response.trim(), ownerRespondedAt: new Date() },
  });
  if (res.count !== 1) throw new HttpError(404, "Issue not found.");
  return {};
}

// ------------------------------------------------------------------ owner decision, conditions, progress

async function finalise(db: Db, l: Loaded, user: CurrentUser, patchLifecycle: boolean) {
  const { snap } = await makeSnapshot(db, l, user, "FINAL", "FINALISED");
  await db.assessmentVersion.update({ where: { id: l.versionId }, data: { kind: "FINALISED" } });
  void patchLifecycle;
  return snap;
}

async function ownerDecision(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "ownerDecision" }>) {
  gate(user, l, "ownerDecision");
  const errors = validateOwnerDecision(i, l.state);
  for (const c of i.conditions ?? []) if (!validDate(c.deadline)) errors.push("A condition has an invalid deadline.");
  if (errors.length) fail(errors);
  const reviewed = await prisma.snapshot.findFirst({
    where: { assessmentId: l.assessment.id, versionId: l.versionId, kind: l.state.path === "PRE_ONLY" ? "SCREENING_SUBMITTED" : "FULL_SUBMITTED" },
    orderBy: { takenAt: "desc" },
  });
  if (!reviewed) throw new HttpError(409, "There is no reviewed snapshot for this decision.");
  return prisma.$transaction(async (tx) => {
    const d = await tx.ownerDecision.create({
      data: {
        assessmentId: l.assessment.id,
        versionId: l.versionId,
        reviewedSnapshotId: reviewed.id,
        ownerId: user.id,
        decision: i.decision,
        rationale: i.rationale.trim(),
        departsFromDpo: i.departsFromDpo === true,
        departureRationale: i.departureRationale?.trim() || null,
      },
    });
    if (i.decision === "CONDITIONALLY_APPROVED") {
      for (const c of i.conditions ?? []) {
        await tx.condition.create({
          data: {
            assessmentId: l.assessment.id,
            versionId: l.versionId,
            decisionId: d.id,
            description: c.description.trim(),
            responsibleUserId: c.responsibleUserId || null,
            responsibleText: c.responsibleText?.trim() || null,
            deadline: toDate(c.deadline),
          },
        });
      }
    } else {
      await finalise(tx, l, user, true);
    }
    await applyPatch(tx, l, patchFor("ownerDecision", l.state, { decision: i.decision }));
    await event(tx, l, user.id, "OWNER_DECISION", { decision: i.decision, departsFromDpo: i.departsFromDpo === true });
    return { decisionId: d.id };
  });
}

async function confirmCondition(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "confirmCondition" }>) {
  gate(user, l, "confirmCondition");
  return prisma.$transaction(async (tx) => {
    const res = await tx.condition.updateMany({
      where: { id: i.conditionId, assessmentId: l.assessment.id, versionId: l.versionId, confirmedAt: null },
      data: { confirmedAt: new Date(), confirmedById: user.id, confirmationNote: i.note?.trim() || null },
    });
    if (res.count !== 1) throw new HttpError(409, "That condition is already confirmed or does not exist.");
    await event(tx, l, user.id, "CONDITION_CONFIRMED", { conditionId: i.conditionId });
    const open = await tx.condition.count({ where: { assessmentId: l.assessment.id, versionId: l.versionId, confirmedAt: null } });
    if (open === 0) {
      // Only the owner's confirmation moves the assessment to Approved. A responsible person's progress never does.
      const conditional = await tx.ownerDecision.findFirst({ where: { assessmentId: l.assessment.id, versionId: l.versionId, decision: "CONDITIONALLY_APPROVED" }, orderBy: { createdAt: "desc" } });
      await tx.ownerDecision.create({
        data: {
          assessmentId: l.assessment.id,
          versionId: l.versionId,
          reviewedSnapshotId: conditional?.reviewedSnapshotId ?? "",
          ownerId: user.id,
          decision: "APPROVED",
          rationale: "All approval conditions were confirmed complete by the owner.",
          supersedesId: conditional?.id ?? null,
        },
      });
      await finalise(tx, l, user, true);
      await applyPatch(tx, l, { lifecycle: "FINALISED" });
      await event(tx, l, user.id, "CONDITIONS_COMPLETE_APPROVED");
      return { approved: true };
    }
    return { approved: false };
  });
}

async function recordProgress(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "recordProgress" }>) {
  let isResponsible = false;
  if (i.itemType === "CONDITION") {
    const c = await prisma.condition.findFirst({ where: { id: i.itemId, assessmentId: l.assessment.id, versionId: l.versionId } });
    if (!c) throw new HttpError(404, "Condition not found.");
    isResponsible = c.responsibleUserId === user.id;
    gate(user, l, "recordProgress", { isResponsible });
    if (l.state.lifecycle !== "AWAITING_CONDITIONS") throw new HttpError(409, "Condition progress is recorded while the assessment is awaiting conditions.");
  } else {
    const rec = await prisma.recordItem.findFirst({ where: { id: i.itemId, versionId: l.versionId, collection: "J.risk.measure", deletedAt: null } });
    if (!rec) throw new HttpError(404, "Measure not found.");
    const owner = await prisma.responseField.findUnique({ where: { versionId_fieldId_recordId: { versionId: l.versionId, fieldId: "J.risk.owner", recordId: rec.id } } });
    isResponsible = (owner?.value as { userId?: string } | null)?.userId === user.id;
    gate(user, l, "recordProgress", { isResponsible });
    if (!PROGRESS_STATES.includes(l.state.lifecycle)) throw new HttpError(409, "Progress cannot be recorded in the current state.");
  }
  if (!i.note.trim()) fail(["Add a note or evidence for this progress update."]);
  await prisma.$transaction(async (tx) => {
    await tx.progressRecord.create({ data: { assessmentId: l.assessment.id, versionId: l.versionId, itemType: i.itemType, itemId: i.itemId, status: i.status ?? null, note: i.note.trim(), authorId: user.id } });
    await event(tx, l, user.id, "PROGRESS_RECORDED", { itemType: i.itemType, itemId: i.itemId, status: i.status ?? null });
  });
  return {};
}

async function reopenForChanges(user: CurrentUser, l: Loaded) {
  gate(user, l, "reopenForChanges");
  await prisma.$transaction(async (tx) => {
    await applyPatch(tx, l, patchFor("reopenForChanges", l.state));
    // Earlier snapshots, opinions and decisions are preserved; the owner must submit again for renewed review.
    await event(tx, l, user.id, "REOPENED_FOR_CHANGES");
  });
  return {};
}

// ------------------------------------------------------------------ versions, archive, delete

async function startRevision(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "startRevision" }>) {
  gate(user, l, "startRevision");
  const errors: string[] = [];
  if (!i.reason.trim()) errors.push("Give the reason for the review or update.");
  if (!i.changeDescription.trim()) errors.push("Describe the changes.");
  if (errors.length) fail(errors);
  return prisma.$transaction(async (tx) => {
    const versions = await tx.assessmentVersion.findMany({ where: { assessmentId: l.assessment.id } });
    const number = nextVersionNumber(versions.map((v) => v.versionNumber));
    const nv = await tx.assessmentVersion.create({
      data: {
        assessmentId: l.assessment.id,
        versionNumber: number,
        templateVersion: TEMPLATE_VERSION,
        revisionReason: i.reason.trim(),
        changeDescription: i.changeDescription.trim(),
        changeCategories: i.categories,
        carriedFromVersionId: l.versionId,
        createdById: user.id,
      },
    });
    const c = await readContent(tx, l.versionId);
    const entityMap = new Map(c.entities.map((e) => [e.id, randomUUID()]));
    const recordMap = new Map(c.records.map((r) => [r.id, randomUUID()]));
    const oldEntities = await tx.entity.findMany({ where: { versionId: l.versionId, deletedAt: null } });
    if (oldEntities.length) {
      await tx.entity.createMany({ data: oldEntities.map((e) => ({ id: entityMap.get(e.id)!, versionId: nv.id, kind: e.kind, name: e.name, createdById: e.createdById })) });
    }
    const oldRecords = await tx.recordItem.findMany({ where: { versionId: l.versionId, deletedAt: null } });
    if (oldRecords.length) {
      await tx.recordItem.createMany({
        data: oldRecords.map((r) => ({
          id: recordMap.get(r.id)!,
          versionId: nv.id,
          collection: r.collection,
          parentId: r.parentId ? (recordMap.get(r.parentId) ?? null) : null,
          ordering: r.ordering,
          createdById: r.createdById,
        })),
      });
    }
    const oldFields = await tx.responseField.findMany({ where: { versionId: l.versionId } });
    const remap = (fieldId: string, v: unknown): unknown => {
      const t = fieldIndex.get(fieldId)?.def.type;
      if (t === "entity" && typeof v === "string") return entityMap.get(v) ?? v;
      if (t === "entities" && Array.isArray(v)) return v.map((x) => (typeof x === "string" ? (entityMap.get(x) ?? x) : x));
      return v;
    };
    const copy = oldFields
      .filter((f) => f.recordId === "" || recordMap.has(f.recordId))
      .map((f) => ({
        versionId: nv.id,
        fieldId: f.fieldId,
        recordId: f.recordId === "" ? "" : recordMap.get(f.recordId)!,
        value: f.value === null ? Prisma.DbNull : (remap(f.fieldId, f.value) as Prisma.InputJsonValue),
        state: f.state,
        rationale: f.rationale,
        revision: 1,
        lastEditorId: f.lastEditorId,
        lastEditedAt: f.lastEditedAt,
      }));
    if (copy.length) await tx.responseField.createMany({ data: copy });
    // Every section is "Carried forward — please review" until the owner confirms it.
    await tx.reviewMark.createMany({ data: SUBSECTIONS.map((s) => ({ versionId: nv.id, subsectionId: s.id })) });
    // Approvals and DPO opinions are NOT carried forward: the new version starts from a fresh screening.
    const res = await tx.assessment.updateMany({
      where: { id: l.assessment.id, lifecycle: "FINALISED", currentVersionId: l.versionId },
      data: { currentVersionId: nv.id, lifecycle: "DRAFT", screeningStatus: "NOT_SUBMITTED", screeningPath: "OPEN" },
    });
    if (res.count !== 1) throw new HttpError(409, "The assessment was changed by someone else. Reload and try again.");
    await tx.event.create({
      data: { assessmentId: l.assessment.id, versionId: nv.id, actorId: user.id, type: "NEW_REVISION", payload: { from: l.versionId, versionNumber: number, categories: i.categories } },
    });
    return { versionId: nv.id, versionNumber: number };
  });
}

async function confirmReviewed(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "confirmReviewed" }>) {
  gate(user, l, "confirmReviewed");
  if (!subsectionById.has(i.subsectionId)) throw new HttpError(400, "Unknown subsection.");
  const r = rolesOf(user, l.ctx);
  if (!r.owner && !l.ctx.assignedSubsections.includes(i.subsectionId)) throw new HttpError(403, "You can confirm only sections assigned to you.");
  await prisma.reviewMark.updateMany({ where: { versionId: l.versionId, subsectionId: i.subsectionId }, data: { confirmedAt: new Date(), confirmedById: user.id } });
  return {};
}

async function archive(user: CurrentUser, l: Loaded) {
  gate(user, l, "archive");
  await prisma.$transaction(async (tx) => {
    await applyPatch(tx, l, { lifecycle: "ARCHIVED", archivedFrom: l.state.lifecycle, archivedAt: new Date() });
    await event(tx, l, user.id, "ARCHIVED", { from: l.state.lifecycle });
  });
  return {};
}

async function restore(user: CurrentUser, l: Loaded) {
  gate(user, l, "restore");
  const back = (l.assessment.archivedFrom as Lifecycle | null) ?? "DRAFT";
  await prisma.$transaction(async (tx) => {
    await applyPatch(tx, l, { lifecycle: back === "ARCHIVED" ? "DRAFT" : back, archivedFrom: null, archivedAt: null });
    await event(tx, l, user.id, "RESTORED", { to: back });
  });
  return {};
}

async function deleteDraft(user: CurrentUser, l: Loaded) {
  gate(user, l, "deleteDraft");
  await prisma.$transaction(async (tx) => {
    // Read the version ids BEFORE deleting: the database cascade removes the versions with the assessment,
    // and review marks (which have no foreign key) must be removed explicitly.
    const versions = await tx.assessmentVersion.findMany({ where: { assessmentId: l.assessment.id }, select: { id: true } });
    // Guard: still never submitted and still a draft at the moment of deletion.
    const res = await tx.assessment.deleteMany({ where: { id: l.assessment.id, everSubmitted: false, lifecycle: "DRAFT" } });
    if (res.count !== 1) throw new HttpError(409, "This assessment can no longer be deleted.");
    await tx.reviewMark.deleteMany({ where: { versionId: { in: versions.map((v) => v.id) } } });
  });
  return { deleted: true };
}

// ------------------------------------------------------------------ people: ownership, DPO, assignments, sharing

async function transferOwnership(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "transferOwnership" }>) {
  gate(user, l, "transferOwnership");
  const target = await prisma.user.findUnique({ where: { id: i.newOwnerId } });
  if (!target || !target.roles.includes("OWNER")) throw new HttpError(400, "Choose another process owner.");
  if (target.id === user.id) throw new HttpError(400, "You already own this assessment.");
  if (target.id === l.assessment.assignedDpoId) throw new HttpError(400, "The assigned DPO cannot become the owner. Reassign the DPO first.");
  await prisma.$transaction(async (tx) => {
    const res = await tx.assessment.updateMany({ where: { id: l.assessment.id, ownerId: user.id, lifecycle: { not: "ARCHIVED" } }, data: { ownerId: target.id } });
    if (res.count !== 1) throw new HttpError(409, "The assessment was changed by someone else. Reload and try again.");
    if (i.keepAsViewer) {
      await tx.assessmentAccess.create({ data: { assessmentId: l.assessment.id, userId: user.id, kind: "SHARED_VIEW", grantedById: user.id } });
    }
    await event(tx, l, user.id, "OWNERSHIP_TRANSFERRED", { from: user.id, to: target.id, keptAsViewer: i.keepAsViewer === true });
  });
  return {};
}

async function reassignDpo(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "reassignDpo" }>) {
  gate(user, l, "reassignDpo");
  if (!i.reason.trim()) fail(["A reason is required to reassign the DPO."]);
  const target = await prisma.user.findUnique({ where: { id: i.newDpoId } });
  if (!target || !target.roles.includes("DPO")) throw new HttpError(400, "Choose an eligible DPO.");
  if (target.id === l.assessment.ownerId) throw new HttpError(400, "An owner cannot be the DPO of their own assessment.");
  if (target.id === l.assessment.assignedDpoId) throw new HttpError(400, "That DPO is already assigned.");
  await prisma.$transaction(async (tx) => {
    const res = await tx.assessment.updateMany({ where: { id: l.assessment.id, assignedDpoId: l.assessment.assignedDpoId }, data: { assignedDpoId: target.id } });
    if (res.count !== 1) throw new HttpError(409, "The assessment was changed by someone else. Reload and try again.");
    // Earlier decisions and opinions keep their original author. A pending review simply belongs to the new DPO.
    await event(tx, l, user.id, "DPO_REASSIGNED", { previousDpoId: l.assessment.assignedDpoId, newDpoId: target.id, reason: i.reason.trim(), pendingReview: l.state.lifecycle === "IN_DPO_REVIEW" || l.state.screeningStatus === "AWAITING_DPO" });
  });
  return {};
}

async function createAssignment(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "createAssignment" }>) {
  gate(user, l, "createAssignment");
  const bad = i.subsectionIds.filter((s) => !subsectionById.has(s) || NON_ASSIGNABLE.includes(s));
  if (bad.length) throw new HttpError(400, `These sections cannot be assigned: ${bad.join(", ")}.`);
  if (!validDate(i.deadline)) throw new HttpError(400, "The deadline is not a valid date.");
  if (!i.taskDescription.trim()) fail(["Describe the task."]);
  const target = await prisma.user.findUnique({ where: { id: i.assigneeId } });
  if (!target) throw new HttpError(400, "Choose an existing demo user.");
  if (target.id === l.assessment.ownerId) throw new HttpError(400, "You are the owner; you can already edit every section.");
  if (target.id === l.assessment.assignedDpoId) throw new HttpError(400, "The assigned DPO reads and comments but does not edit owner answers.");
  if (!target.roles.includes("CONTRIBUTOR") && !target.roles.includes("OWNER")) throw new HttpError(400, "Only contributors and process owners can be assigned sections.");
  const a = await prisma.$transaction(async (tx) => {
    const created = await tx.assignment.create({
      data: { assessmentId: l.assessment.id, assigneeId: target.id, subsectionIds: [...new Set(i.subsectionIds)], taskDescription: i.taskDescription.trim(), deadline: toDate(i.deadline), createdById: user.id },
    });
    await event(tx, l, user.id, "ASSIGNMENT_CREATED", { assignmentId: created.id, assigneeId: target.id, subsectionIds: i.subsectionIds });
    return created;
  });
  return { assignmentId: a.id };
}

async function updateAssignment(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "updateAssignment" }>) {
  gate(user, l, "updateAssignment");
  const a = await prisma.assignment.findFirst({ where: { id: i.assignmentId, assessmentId: l.assessment.id } });
  if (!a) throw new HttpError(404, "Assignment not found.");
  if (i.subsectionIds) {
    const bad = i.subsectionIds.filter((s) => !subsectionById.has(s) || NON_ASSIGNABLE.includes(s));
    if (bad.length) throw new HttpError(400, `These sections cannot be assigned: ${bad.join(", ")}.`);
  }
  if (i.deadline !== undefined && !validDate(i.deadline)) throw new HttpError(400, "The deadline is not a valid date.");
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: a.id },
      data: {
        ...(i.subsectionIds ? { subsectionIds: [...new Set(i.subsectionIds)] } : {}),
        ...(i.taskDescription !== undefined ? { taskDescription: i.taskDescription.trim() } : {}),
        ...(i.deadline !== undefined ? { deadline: toDate(i.deadline) } : {}),
        ...(i.status ? { status: i.status, completedAt: null } : {}),
      },
    });
    await event(tx, l, user.id, i.status === "CANCELLED" ? "ASSIGNMENT_CANCELLED" : i.status === "PENDING" ? "ASSIGNMENT_REOPENED" : "ASSIGNMENT_UPDATED", { assignmentId: a.id });
  });
  return {};
}

async function setAssignmentStatus(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "setAssignmentStatus" }>) {
  gate(user, l, "setAssignmentStatus");
  const a = await prisma.assignment.findFirst({ where: { id: i.assignmentId, assessmentId: l.assessment.id, assigneeId: user.id } });
  if (!a || a.status === "CANCELLED") throw new HttpError(404, "Assignment not found.");
  if (a.status === "COMPLETED") throw new HttpError(409, "This assignment is completed. The owner can reopen it.");
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({ where: { id: a.id }, data: { status: i.status, completedAt: i.status === "COMPLETED" ? new Date() : null } });
    await event(tx, l, user.id, i.status === "COMPLETED" ? "ASSIGNMENT_COMPLETED" : "ASSIGNMENT_STARTED", { assignmentId: a.id });
  });
  return {};
}

async function grantAccess(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "grantAccess" }>) {
  gate(user, l, "grantAccess");
  const target = await prisma.user.findUnique({ where: { id: i.userId } });
  if (!target) throw new HttpError(400, "Choose an existing demo user.");
  if (target.id === l.assessment.ownerId) throw new HttpError(400, "The owner already has access.");
  const existing = await prisma.assessmentAccess.findFirst({ where: { assessmentId: l.assessment.id, userId: target.id, revokedAt: null } });
  if (existing) throw new HttpError(409, "That person already has view access.");
  await prisma.$transaction(async (tx) => {
    await tx.assessmentAccess.create({ data: { assessmentId: l.assessment.id, userId: target.id, kind: "SHARED_VIEW", grantedById: user.id } });
    await event(tx, l, user.id, "ACCESS_GRANTED", { userId: target.id, kind: "SHARED_VIEW" });
  });
  return {};
}

async function revokeAccess(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "revokeAccess" }>) {
  gate(user, l, "revokeAccess");
  await prisma.$transaction(async (tx) => {
    const res = await tx.assessmentAccess.updateMany({ where: { assessmentId: l.assessment.id, userId: i.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (res.count < 1) throw new HttpError(404, "That person has no explicit view access.");
    // Responsibility records are kept; the owner can see them and decide what to do.
    await event(tx, l, user.id, "ACCESS_REVOKED", { userId: i.userId });
  });
  return {};
}

// ------------------------------------------------------------------ comments

async function addComment(user: CurrentUser, l: Loaded, i: Extract<ActionInput, { action: "addComment" }>) {
  gate(user, l, i.threadId ? "addComment" : "addComment");
  if (!subsectionById.has(i.subsectionId)) throw new HttpError(400, "Unknown section.");
  if (!i.body.trim()) fail(["Write a comment."]);
  if (i.fieldId && !fieldIndex.has(i.fieldId)) throw new HttpError(400, "Unknown question.");
  if (i.threadId) {
    const t = await prisma.commentThread.findFirst({ where: { id: i.threadId, assessmentId: l.assessment.id, versionId: l.versionId } });
    if (!t) throw new HttpError(404, "Thread not found.");
  }
  const r = rolesOf(user, l.ctx);
  const c = await prisma.$transaction((tx) => addThreadComment(tx, l, user, { ...i, isReview: r.assignedDpo || r.otherDpo }));
  return { commentId: c.id, threadId: c.threadId };
}

async function setThread(user: CurrentUser, l: Loaded, threadId: string, state: "OPEN" | "RESOLVED") {
  gate(user, l, state === "RESOLVED" ? "resolveThread" : "reopenThread");
  const res = await prisma.commentThread.updateMany({
    where: { id: threadId, assessmentId: l.assessment.id, versionId: l.versionId },
    data: { state, resolvedById: state === "RESOLVED" ? user.id : null, resolvedAt: state === "RESOLVED" ? new Date() : null },
  });
  if (res.count !== 1) throw new HttpError(404, "Thread not found.");
  return {};
}

// ------------------------------------------------------------------ dispatcher

export async function runAction(user: CurrentUser, assessmentId: string, input: ActionInput): Promise<Record<string, unknown>> {
  const l = await load(user, assessmentId, { admin: input.action === "reassignDpo" });
  switch (input.action) {
    case "submitScreening": return submitScreening(user, l);
    case "withdrawScreening": return withdrawScreening(user, l);
    case "reopenScreening": return reopenScreening(user, l);
    case "recordScreeningDecision": return recordScreeningDecision(user, l, input);
    case "submitFull": return submitFull(user, l);
    case "withdrawFull": return withdrawFull(user, l);
    case "requestChanges": return requestChanges(user, l, input);
    case "submitOpinion": return submitOpinion(user, l, input);
    case "amendOpinion": return amendOpinion(user, l, input);
    case "raiseBlocking": return raiseBlocking(user, l, input);
    case "resolveBlocking": return resolveBlocking(user, l, input);
    case "respondBlocking": return respondBlocking(user, l, input);
    case "ownerDecision": return ownerDecision(user, l, input);
    case "confirmCondition": return confirmCondition(user, l, input);
    case "recordProgress": return recordProgress(user, l, input);
    case "reopenForChanges": return reopenForChanges(user, l);
    case "startRevision": return startRevision(user, l, input);
    case "confirmReviewed": return confirmReviewed(user, l, input);
    case "archive": return archive(user, l);
    case "restore": return restore(user, l);
    case "deleteDraft": return deleteDraft(user, l);
    case "transferOwnership": return transferOwnership(user, l, input);
    case "reassignDpo": return reassignDpo(user, l, input);
    case "createAssignment": return createAssignment(user, l, input);
    case "updateAssignment": return updateAssignment(user, l, input);
    case "setAssignmentStatus": return setAssignmentStatus(user, l, input);
    case "grantAccess": return grantAccess(user, l, input);
    case "revokeAccess": return revokeAccess(user, l, input);
    case "addComment": return addComment(user, l, input);
    case "resolveThread": return setThread(user, l, input.threadId, "RESOLVED");
    case "reopenThread": return setThread(user, l, input.threadId, "OPEN");
  }
}

export type { Role };
