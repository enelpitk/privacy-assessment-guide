import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";
import { TEMPLATE_VERSION, subsectionById } from "@/content";
import { canCreateAssessment, isEligibleDpo, type Role } from "@/domain/permissions";
import type { AnswerState } from "@/domain/conditions";
import { loadAccessible } from "./access";
import { loadThreads } from "./governanceData";
import type { Path } from "@/domain/workflow";
import type { ClientField, PageData } from "@/lib/types";
import { fieldKey } from "@/lib/types";

export interface CreateInput {
  name: string;
  departmentId: string;
  assignedDpoId: string;
}

export async function createAssessment(user: CurrentUser, input: CreateInput) {
  const perm = canCreateAssessment(user);
  if (!perm.ok) throw new HttpError(403, perm.reason);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 200) throw new HttpError(400, "Enter a name of 3 to 200 characters.");

  const [dept, dpo] = await Promise.all([
    prisma.department.findUnique({ where: { id: input.departmentId } }),
    prisma.user.findUnique({ where: { id: input.assignedDpoId } }),
  ]);
  if (!dept) throw new HttpError(400, "Choose a department.");
  if (!dpo || !isEligibleDpo({ id: dpo.id, roles: dpo.roles as Role[] }, user.id)) {
    throw new HttpError(400, "Choose an eligible DPO. An owner cannot be the DPO of their own assessment.");
  }

  const year = new Date().getUTCFullYear();
  for (let attempt = 0; attempt < 6; attempt++) {
    const count = await prisma.assessment.count();
    const displayId = `DPIA-${year}-${String(count + 1 + attempt).padStart(4, "0")}`;
    try {
      return await prisma.$transaction(async (tx) => {
        const a = await tx.assessment.create({
          data: {
            displayId,
            name,
            departmentId: dept.id,
            ownerId: user.id,
            assignedDpoId: dpo.id,
          },
        });
        const v = await tx.assessmentVersion.create({
          data: {
            assessmentId: a.id,
            versionNumber: "1.0",
            templateVersion: TEMPLATE_VERSION,
            createdById: user.id,
          },
        });
        await tx.assessment.update({ where: { id: a.id }, data: { currentVersionId: v.id } });
        await tx.responseField.create({
          data: {
            versionId: v.id,
            fieldId: "A.processingName",
            recordId: "",
            value: name,
            state: "ANSWERED",
            lastEditorId: user.id,
          },
        });
        await tx.event.create({
          data: {
            assessmentId: a.id,
            versionId: v.id,
            actorId: user.id,
            type: "ASSESSMENT_CREATED",
            payload: { displayId, dpoId: dpo.id, departmentId: dept.id },
          },
        });
        return { id: a.id, displayId };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new HttpError(503, "Could not allocate an assessment identifier. Please try again.");
}

// ------------------------------------------------------------ register

export type RegisterView = "mine" | "assigned" | "awaiting" | "reviewdue" | "all";

export interface RegisterFilters {
  view: RegisterView;
  q?: string;
  ownerId?: string;
  departmentId?: string;
  status?: string;
  reviewFrom?: string;
  reviewTo?: string;
  archived?: boolean;
}

export async function listAssessments(user: CurrentUser, f: RegisterFilters) {
  const isDpo = user.roles.includes("DPO");
  const visible: Prisma.AssessmentWhereInput = isDpo
    ? {}
    : {
        OR: [
          { ownerId: user.id },
          { assignments: { some: { assigneeId: user.id, status: { not: "CANCELLED" } } } },
          { accesses: { some: { userId: user.id, revokedAt: null } } },
        ],
      };

  const and: Prisma.AssessmentWhereInput[] = [visible];
  and.push(f.archived ? { lifecycle: "ARCHIVED" } : { lifecycle: { not: "ARCHIVED" } });

  if (f.view === "mine") and.push({ ownerId: user.id });
  if (f.view === "assigned") {
    and.push({
      OR: [
        { assignments: { some: { assigneeId: user.id, status: { not: "CANCELLED" } } } },
        { accesses: { some: { userId: user.id, revokedAt: null } } },
      ],
    });
  }
  if (f.view === "awaiting") {
    and.push({ OR: [{ lifecycle: "IN_DPO_REVIEW" }, { screeningStatus: "AWAITING_DPO" }] });
  }
  if (f.view === "reviewdue") {
    and.push({ nextReviewDate: { not: null, lte: new Date() } });
  }
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { displayId: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (f.ownerId) and.push({ ownerId: f.ownerId });
  if (f.departmentId) and.push({ departmentId: f.departmentId });
  if (f.status) and.push({ lifecycle: f.status as never });
  const range: Prisma.DateTimeNullableFilter = {};
  if (f.reviewFrom && !Number.isNaN(Date.parse(f.reviewFrom))) range.gte = new Date(`${f.reviewFrom}T00:00:00Z`);
  if (f.reviewTo && !Number.isNaN(Date.parse(f.reviewTo))) range.lte = new Date(`${f.reviewTo}T23:59:59Z`);
  if (range.gte || range.lte) and.push({ nextReviewDate: range });

  const rows = await prisma.assessment.findMany({
    where: { AND: and },
    include: { owner: true, department: true, versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return rows.map((a) => ({
    id: a.id,
    displayId: a.displayId,
    name: a.name,
    department: a.department.name,
    groupEntity: a.department.groupEntity,
    ownerName: a.owner.displayName,
    lifecycle: a.lifecycle,
    screeningStatus: a.screeningStatus,
    versionNumber: a.versions[0]?.versionNumber ?? "—",
    updatedAt: a.updatedAt.toISOString(),
    nextReviewDate: a.nextReviewDate ? a.nextReviewDate.toISOString().slice(0, 10) : null,
  }));
}

// ------------------------------------------------------------ page data

export async function loadPageData(user: CurrentUser, assessmentId: string): Promise<PageData> {
  const { assessment, ctx, versionId } = await loadAccessible(user, assessmentId);
  const [owner, dpo, dept, version, rows, records, entities, state, versions, assignees, shared] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: assessment.ownerId } }),
      prisma.user.findUnique({ where: { id: assessment.assignedDpoId } }),
      prisma.department.findUnique({ where: { id: assessment.departmentId } }),
      prisma.assessmentVersion.findUnique({ where: { id: versionId } }),
      prisma.responseField.findMany({ where: { versionId } }),
      prisma.recordItem.findMany({ where: { versionId, deletedAt: null } }),
      prisma.entity.findMany({ where: { versionId, deletedAt: null }, orderBy: { createdAt: "asc" } }),
      prisma.userAssessmentState.findUnique({
        where: { userId_assessmentId: { userId: user.id, assessmentId } },
      }),
      prisma.assessmentVersion.findMany({ where: { assessmentId }, orderBy: { createdAt: "asc" } }),
      prisma.assignment.findMany({ where: { assessmentId }, select: { assigneeId: true } }),
      prisma.assessmentAccess.findMany({ where: { assessmentId, revokedAt: null }, select: { userId: true } }),
    ]);
  if (!owner || !dpo || !dept || !version) throw new HttpError(500, "Assessment data is incomplete.");
  const [threads, marks] = await Promise.all([
    loadThreads(versionId, assessmentId),
    prisma.reviewMark.findMany({ where: { versionId, confirmedAt: null } }),
  ]);

  const editorIds = [...new Set(rows.map((r) => r.lastEditorId))];
  const editors = await prisma.user.findMany({ where: { id: { in: editorIds } } });
  const nameById = new Map(editors.map((u) => [u.id, u.displayName]));

  const fields: Record<string, ClientField> = {};
  for (const r of rows) {
    fields[fieldKey(r.fieldId, r.recordId)] = {
      value: r.value,
      state: r.state as AnswerState,
      rationale: r.rationale,
      revision: r.revision,
      editorName: nameById.get(r.lastEditorId) ?? "Unknown user",
      lastEditedAt: r.lastEditedAt.toISOString(),
    };
  }

  // People who already have access can be named as responsible. Naming someone never grants access.
  const personIds = [...new Set([owner.id, ...assignees.map((a) => a.assigneeId), ...shared.map((s) => s.userId)])];
  const people = (await prisma.user.findMany({ where: { id: { in: personIds } } })).map((u) => ({
    id: u.id,
    name: u.displayName,
    role: u.jobTitle,
  }));

  const authorIds = [...new Set(versions.map((v) => v.createdById))];
  const authors = await prisma.user.findMany({ where: { id: { in: authorIds } } });
  const authorName = new Map(authors.map((u) => [u.id, u.displayName]));

  return {
    assessment: {
      id: assessment.id,
      displayId: assessment.displayId,
      name: assessment.name,
      lifecycle: assessment.lifecycle,
      screeningStatus: assessment.screeningStatus,
      versionNumber: version.versionNumber,
      ownerId: owner.id,
      ownerName: owner.displayName,
      dpoName: dpo.displayName,
      department: dept.name,
      groupEntity: dept.groupEntity,
      createdAt: assessment.createdAt.toISOString(),
    },
    actor: { id: user.id, roles: user.roles },
    ctx,
    fields,
    records: records.map((r) => ({
      id: r.id,
      collection: r.collection,
      parentId: r.parentId,
      ordering: r.ordering,
      revision: r.revision,
    })),
    entities: entities.map((e) => ({ id: e.id, kind: e.kind, name: e.name, revision: e.revision })),
    people,
    versions: versions.map((v) => ({
      versionNumber: v.versionNumber,
      createdAt: v.createdAt.toISOString(),
      authorName: authorName.get(v.createdById) ?? "Unknown user",
      note: v.versionNumber === "1.0" ? "Initial draft" : (v.changeDescription ?? ""),
    })),
    lastSubsection: state?.lastSubsection ?? null,
    path: assessment.screeningPath as Path,
    threads,
    unreviewed: marks.map((m) => m.subsectionId),
  };
}

export async function rememberLocation(user: CurrentUser, assessmentId: string, subsectionId: string) {
  await loadAccessible(user, assessmentId); // same visibility rule as everything else
  if (!subsectionById.has(subsectionId)) throw new HttpError(400, "Unknown subsection.");
  await prisma.userAssessmentState.upsert({
    where: { userId_assessmentId: { userId: user.id, assessmentId } },
    update: { lastSubsection: subsectionId },
    create: { userId: user.id, assessmentId, lastSubsection: subsectionId },
  });
}
