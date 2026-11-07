import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";
import { canView, type AccessCtx, type Lifecycle, type ScreeningStatus } from "@/domain/permissions";

export async function buildAccessCtx(
  user: Pick<CurrentUser, "id">,
  assessment: {
    id: string;
    ownerId: string;
    assignedDpoId: string;
    lifecycle: string;
    screeningStatus: string;
  },
): Promise<AccessCtx> {
  const [assignments, shared] = await Promise.all([
    prisma.assignment.findMany({ where: { assessmentId: assessment.id, assigneeId: user.id } }),
    prisma.assessmentAccess.findFirst({
      where: { assessmentId: assessment.id, userId: user.id, revokedAt: null },
    }),
  ]);
  const active = assignments.filter((a) => a.status !== "COMPLETED");
  return {
    ownerId: assessment.ownerId,
    assignedDpoId: assessment.assignedDpoId,
    lifecycle: assessment.lifecycle as Lifecycle,
    screeningStatus: assessment.screeningStatus as ScreeningStatus,
    assignedSubsections: [...new Set(active.flatMap((a) => a.subsectionIds))],
    isAssignee: assignments.length > 0,
    sharedViewer: Boolean(shared),
  };
}

/** Loads an assessment the user may view, or throws 404 (never reveals that it exists to others). */
export async function loadAccessible(user: CurrentUser, assessmentId: string) {
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) throw new HttpError(404, "Assessment not found.");
  const ctx = await buildAccessCtx(user, assessment);
  if (!canView(user, ctx)) throw new HttpError(404, "Assessment not found.");
  if (!assessment.currentVersionId) throw new HttpError(500, "Assessment has no current version.");
  return { assessment, ctx, versionId: assessment.currentVersionId };
}
