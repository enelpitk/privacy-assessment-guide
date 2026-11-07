import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import type {
  AssignmentView,
  CommentView,
  GovernanceData,
  MeasureView,
  PersonView,
  ThreadView,
} from "@/lib/govTypes";
import { buildModel, evaluateAssessment } from "@/domain/model";
import { SCREENING_SUBSECTIONS, rolesOf, submissionBlockers, type Path } from "@/domain/workflow";
import type { SnapshotPayload } from "@/domain/snapshot";
import { isVersionRejected } from "@/lib/labels";
import { load, stateOf } from "./governance";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

const EVENT_TEXT: Record<string, string> = {
  ASSESSMENT_CREATED: "Assessment created",
  SCREENING_SUBMITTED: "Screening submitted for DPO review",
  SCREENING_WITHDRAWN: "Screening withdrawn for editing",
  SCREENING_REOPENED: "Screening reopened for changes; the earlier decision is kept in history",
  SCREENING_DECIDED: "Screening decision recorded",
  SUBMITTED_FOR_REVIEW: "Submitted for full DPO review",
  WITHDRAWN_FOR_EDITING: "Withdrawn for editing",
  CHANGES_REQUESTED: "DPO requested changes",
  DPO_OPINION_SUBMITTED: "DPO opinion submitted",
  DPO_OPINION_AMENDED: "DPO opinion amended (new recorded version)",
  BLOCKING_ISSUE_RAISED: "DPO raised a blocking issue",
  BLOCKING_ISSUE_RESOLVED: "DPO resolved a blocking issue",
  OWNER_DECISION: "Owner decision recorded",
  CONDITION_CONFIRMED: "Owner confirmed a condition",
  CONDITIONS_COMPLETE_APPROVED: "All conditions confirmed; approved",
  PROGRESS_RECORDED: "Progress recorded",
  REOPENED_FOR_CHANGES: "Reopened for changes (renewed review needed)",
  NEW_REVISION: "New revision started",
  ARCHIVED: "Archived",
  RESTORED: "Restored from the archive",
  OWNERSHIP_TRANSFERRED: "Ownership transferred",
  DPO_REASSIGNED: "Assigned DPO changed",
  ASSIGNMENT_CREATED: "Sections assigned",
  ASSIGNMENT_UPDATED: "Assignment updated",
  ASSIGNMENT_CANCELLED: "Assignment cancelled",
  ASSIGNMENT_REOPENED: "Assignment reopened",
  ASSIGNMENT_STARTED: "Assignment started",
  ASSIGNMENT_COMPLETED: "Assignment marked complete",
  ACCESS_GRANTED: "View access granted",
  ACCESS_REVOKED: "View access revoked",
  REVIEW_DATE_CHANGED: "Review schedule changed",
};

export async function loadGovernance(user: CurrentUser, assessmentId: string): Promise<GovernanceData> {
  const l = await load(user, assessmentId);
  const a = l.assessment;
  const vid = l.versionId;
  const roles = rolesOf(user, l.ctx);

  const [users, assignments, access, sds, ops, blocking, decisions, conditions, progress, snaps, versions, events, marks, fields, records, entities, owner, dpo] =
    await Promise.all([
      prisma.user.findMany({ orderBy: { displayName: "asc" } }),
      prisma.assignment.findMany({ where: { assessmentId, ...(roles.owner ? {} : { assigneeId: user.id }) }, orderBy: { createdAt: "asc" } }),
      prisma.assessmentAccess.findMany({ where: { assessmentId, revokedAt: null } }),
      prisma.screeningDecision.findMany({ where: { assessmentId }, orderBy: { createdAt: "asc" } }),
      prisma.dpoOpinion.findMany({ where: { assessmentId }, orderBy: { createdAt: "asc" } }),
      prisma.blockingIssue.findMany({ where: { assessmentId }, orderBy: { raisedAt: "asc" } }),
      prisma.ownerDecision.findMany({ where: { assessmentId }, orderBy: { createdAt: "asc" } }),
      prisma.condition.findMany({ where: { assessmentId, versionId: vid }, orderBy: { createdAt: "asc" } }),
      prisma.progressRecord.findMany({ where: { assessmentId }, orderBy: { createdAt: "asc" } }),
      prisma.snapshot.findMany({ where: { assessmentId }, orderBy: { takenAt: "asc" }, select: { id: true, kind: true, versionId: true, takenAt: true, takenById: true, contentHash: true } }),
      prisma.assessmentVersion.findMany({ where: { assessmentId }, orderBy: { createdAt: "asc" } }),
      prisma.event.findMany({ where: { assessmentId }, orderBy: { createdAt: "desc" }, take: 120 }),
      prisma.reviewMark.findMany({ where: { versionId: vid, confirmedAt: null } }),
      prisma.responseField.findMany({ where: { versionId: vid } }),
      prisma.recordItem.findMany({ where: { versionId: vid, deletedAt: null } }),
      prisma.entity.findMany({ where: { versionId: vid, deletedAt: null }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: a.ownerId } }),
      prisma.user.findUnique({ where: { id: a.assignedDpoId } }),
    ]);
  void entities;
  const nameOf = new Map(users.map((u) => [u.id, u.displayName]));
  const n = (id: string | null | undefined) => (id ? (nameOf.get(id) ?? "Unknown user") : "—");
  const person = (u: (typeof users)[number]): PersonView => ({ id: u.id, name: u.displayName, title: u.jobTitle, roles: u.roles as string[] });
  const todayIso = new Date().toISOString().slice(0, 10);

  // Submission blockers, computed from persisted answers only.
  const responses = fields.map((f) => ({ fieldId: f.fieldId, recordId: f.recordId, value: f.value as unknown, state: f.state, rationale: f.rationale }));
  const rows = records.map((r) => ({ id: r.id, collection: r.collection, parentId: r.parentId, ordering: r.ordering }));
  const result = evaluateAssessment(buildModel(responses, rows, a.screeningPath as Path));
  const unreviewed = marks.map((m) => m.subsectionId);
  const screeningBlockers = submissionBlockers(result, { subsections: SCREENING_SUBSECTIONS, unreviewed });
  const fullBlockers = submissionBlockers(result, { unreviewed });

  const lastScreeningSnap = [...snaps].reverse().find((s) => s.kind === "SCREENING_SUBMITTED" && s.versionId === vid);
  let screening: GovernanceData["screening"] = null;
  if (lastScreeningSnap) {
    const full = await prisma.snapshot.findUnique({ where: { id: lastScreeningSnap.id } });
    const sc = (full?.payload as unknown as SnapshotPayload | undefined)?.screening;
    if (sc) screening = { fullDpiaIndicated: sc.fullDpiaIndicated, tiaIndicated: sc.tiaIndicated, unresolved: sc.unresolved, snapshotId: lastScreeningSnap.id };
  }

  const opSup = new Set(ops.map((o) => o.supersedesId).filter(Boolean));
  // A screening-cycle opinion whose screening decision was superseded (screening reopened) belongs to an earlier cycle.
  const supersededScreeningSnapshots = new Set(sds.filter((d) => d.supersededAt).map((d) => d.snapshotId));
  const progressFor = (type: string, id: string) =>
    progress.filter((p) => p.itemType === type && p.itemId === id).map((p) => ({ status: p.status, note: p.note, authorName: n(p.authorId), createdAt: p.createdAt.toISOString() }));

  const conditionViews = conditions.map((c) => ({
    id: c.id,
    description: c.description,
    responsibleName: c.responsibleUserId ? n(c.responsibleUserId) : (c.responsibleText ?? "—"),
    responsibleUserId: c.responsibleUserId,
    deadline: day(c.deadline),
    overdue: Boolean(c.deadline && !c.confirmedAt && day(c.deadline)! < todayIso),
    confirmedAt: iso(c.confirmedAt),
    confirmationNote: c.confirmationNote,
    progress: progressFor("CONDITION", c.id),
  }));

  // Risk measures with their latest recorded progress.
  const val = (fid: string, rid: string) => fields.find((f) => f.fieldId === fid && f.recordId === rid)?.value as unknown;
  const measures: MeasureView[] = records
    .filter((r) => r.collection === "J.risk.measure")
    .map((m) => {
      const status = (typeof val("J.risk.status", m.id) === "string" ? (val("J.risk.status", m.id) as string) : "") || "";
      const prog = progressFor("MEASURE", m.id);
      const latest = [...prog].reverse().find((p) => p.status);
      const eff = latest?.status ?? status;
      const due = typeof val("J.risk.due", m.id) === "string" ? (val("J.risk.due", m.id) as string) : "";
      const ownerVal = val("J.risk.owner", m.id) as { userId?: string; text?: string } | null;
      return {
        id: m.id,
        riskName: String(val("J.risk.name", m.parentId ?? "") ?? "").trim() || "(unnamed risk)",
        description: String(val("J.risk.measures", m.id) ?? ""),
        responsibleName: ownerVal?.userId ? n(ownerVal.userId) : (ownerVal?.text ?? "—"),
        responsibleUserId: ownerVal?.userId ?? null,
        due,
        status: eff,
        registerStatus: status,
        latestRecordedStatus: latest?.status ?? null,
        overdue: due !== "" && due < todayIso && eff !== "COMPLETED",
        progress: prog,
      };
    });

  const assignmentViews: AssignmentView[] = assignments.map((x) => ({
    id: x.id,
    assigneeId: x.assigneeId,
    assigneeName: n(x.assigneeId),
    subsectionIds: x.subsectionIds,
    taskDescription: x.taskDescription,
    deadline: day(x.deadline),
    status: x.status,
    overdue: Boolean(x.deadline && x.status !== "COMPLETED" && x.status !== "CANCELLED" && day(x.deadline)! < todayIso),
  }));

  const ver = (versionId: string) => ({ versionNumber: versions.find((v) => v.id === versionId)?.versionNumber ?? "", currentVersion: versionId === vid });
  const sharedIds = new Set(access.map((x) => x.userId));
  const state = await stateOf(prisma, a);

  return {
    state: { lifecycle: state.lifecycle, screeningStatus: state.screeningStatus, path: state.path, everSubmitted: state.everSubmitted, openBlocking: state.openBlocking, latestOpinion: state.latestOpinion },
    ownerName: owner?.displayName ?? "",
    dpoName: dpo?.displayName ?? "",
    archivedFrom: a.archivedFrom,
    screening,
    screeningBlockers,
    fullBlockers,
    assignments: assignmentViews,
    access: roles.owner ? access.map((x) => ({ userId: x.userId, name: n(x.userId) })) : [],
    people: {
      owners: users.filter((u) => u.roles.includes("OWNER") && u.id !== a.ownerId && u.id !== a.assignedDpoId).map(person),
      dpos: users.filter((u) => u.roles.includes("DPO") && u.id !== a.ownerId && u.id !== a.assignedDpoId).map(person),
      assignable: users.filter((u) => (u.roles.includes("CONTRIBUTOR") || u.roles.includes("OWNER")) && u.id !== a.ownerId && u.id !== a.assignedDpoId).map(person),
      shareable: users.filter((u) => u.id !== a.ownerId && !sharedIds.has(u.id)).map(person),
    },
    screeningDecisions: sds.map((d) => ({
      id: d.id, dpoName: n(d.dpoId), decision: d.decision, rationale: d.rationale, exceptionJustification: d.exceptionJustification,
      mitigationControls: d.mitigationControls, advice: d.advice, indicatedFull: d.screeningIndicatedFull, superseded: Boolean(d.supersededAt), ...ver(d.versionId), createdAt: d.createdAt.toISOString(),
    })),
    opinions: ops.map((o) => ({
      id: o.id, kind: o.kind, dpoName: n(o.dpoId), category: o.category, opinionText: o.opinionText, recommendations: o.recommendations,
      supersedesId: o.supersedesId, superseded: opSup.has(o.id), earlierScreeningCycle: o.kind === "SCREENING" && supersededScreeningSnapshots.has(o.snapshotId), ...ver(o.versionId), createdAt: o.createdAt.toISOString(),
    })),
    blocking: blocking.map((b) => ({
      id: b.id, reason: b.reason, subsectionId: b.subsectionId, raisedByName: n(b.raisedById), raisedAt: b.raisedAt.toISOString(), status: b.status,
      resolvedByName: b.resolvedById ? n(b.resolvedById) : null, resolvedAt: iso(b.resolvedAt), resolutionNote: b.resolutionNote, ownerResponse: b.ownerResponse,
    })),
    ownerDecisions: decisions.map((d) => ({
      id: d.id, ownerName: n(d.ownerId), decision: d.decision, rationale: d.rationale, departsFromDpo: d.departsFromDpo, departureRationale: d.departureRationale,
      supersedesId: d.supersedesId, reviewedSnapshotId: d.reviewedSnapshotId, ...ver(d.versionId), createdAt: d.createdAt.toISOString(),
    })),
    conditions: conditionViews,
    measures: measures.filter((m) => m.description || m.responsibleUserId),
    snapshots: snaps.map((s) => ({
      id: s.id, kind: s.kind, versionNumber: versions.find((v) => v.id === s.versionId)?.versionNumber ?? "", takenAt: s.takenAt.toISOString(), takenByName: n(s.takenById), hash: s.contentHash.slice(0, 12),
    })),
    versions: versions.map((v) => ({
      id: v.id, versionNumber: v.versionNumber, kind: v.kind, createdAt: v.createdAt.toISOString(), reason: v.revisionReason, changeDescription: v.changeDescription,
      categories: v.changeCategories, current: v.id === vid, rejected: isVersionRejected(decisions, v.id),
    })),
    events: events.map((e) => ({ id: e.id, type: e.type, actorName: n(e.actorId), createdAt: e.createdAt.toISOString(), summary: describeEvent(e.type, e.payload as Record<string, unknown> | null, n) })),
    unreviewed,
  };
}

function describeEvent(type: string, p: Record<string, unknown> | null, n: (id: string | null | undefined) => string): string {
  const base = EVENT_TEXT[type] ?? type;
  if (!p) return base;
  if (type === "OWNERSHIP_TRANSFERRED") return `${base}: ${n(p.from as string)} → ${n(p.to as string)}`;
  if (type === "DPO_REASSIGNED") return `${base}: ${n(p.previousDpoId as string)} → ${n(p.newDpoId as string)}. Reason: ${String(p.reason ?? "")}`;
  if (type === "OWNER_DECISION") return `${base}: ${String(p.decision ?? "")}`;
  if (type === "SCREENING_DECIDED") return `${base}: ${String(p.decision ?? "")}`;
  if (type === "DPO_OPINION_SUBMITTED" || type === "DPO_OPINION_AMENDED") return `${base}: ${String(p.category ?? "")}`;
  if (type === "ACCESS_GRANTED" || type === "ACCESS_REVOKED") return `${base}: ${n(p.userId as string)}`;
  if (type === "ASSIGNMENT_CREATED") return `${base} to ${n(p.assigneeId as string)}: ${(p.subsectionIds as string[] | undefined)?.join(", ") ?? ""}`;
  if (type === "NEW_REVISION") return `${base}: version ${String(p.versionNumber ?? "")}`;
  if (type === "PROGRESS_RECORDED") return `${base} (${String(p.itemType ?? "")}${p.status ? `, ${String(p.status)}` : ""})`;
  return base;
}

export async function loadThreads(versionId: string, assessmentId: string): Promise<ThreadView[]> {
  const threads = await prisma.commentThread.findMany({ where: { assessmentId, versionId }, include: { comments: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } });
  const ids = [...new Set(threads.flatMap((t) => t.comments.map((c) => c.authorId)))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } } });
  const name = new Map(users.map((u) => [u.id, u.displayName]));
  return threads.map((t) => ({
    id: t.id,
    subsectionId: t.subsectionId,
    fieldId: t.fieldId,
    recordId: t.recordId,
    state: t.state,
    comments: t.comments.map(
      (c): CommentView => ({ id: c.id, authorId: c.authorId, authorName: name.get(c.authorId) ?? "Unknown user", body: c.body, createdAt: c.createdAt.toISOString(), parentId: c.parentId, isReview: c.isReview }),
    ),
  }));
}
