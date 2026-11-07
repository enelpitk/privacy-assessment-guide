import { z } from "zod";

const text = (max = 8000) => z.string().max(max);
const id = z.string().min(1).max(64);

const ConditionIn = z.object({
  description: text(2000),
  responsibleUserId: id.nullable().optional(),
  responsibleText: text(200).nullable().optional(),
  deadline: z.string().max(10).nullable().optional(),
});

const A = <T extends string, S extends z.ZodRawShape>(action: T, shape: S) =>
  z.object({ action: z.literal(action), ...shape });

export const ActionSchema = z.discriminatedUnion("action", [
  A("submitScreening", {}),
  A("withdrawScreening", {}),
  A("reopenScreening", {}),
  A("recordScreeningDecision", {
    decision: z.enum(["PROCEED_FULL", "PRE_ASSESSMENT_SUFFICIENT"]),
    rationale: text(),
    exceptionJustification: text().optional(),
    mitigationControls: text().optional(),
    advice: text().optional(),
    opinionCategory: z.enum(["NO_OBJECTIONS", "RECOMMENDATIONS", "OBJECTIONS_REMAIN"]).optional(),
    opinionText: text().optional(),
  }),
  A("submitFull", {}),
  A("withdrawFull", {}),
  A("requestChanges", { comment: text() }),
  A("submitOpinion", {
    category: z.enum(["NO_OBJECTIONS", "RECOMMENDATIONS", "OBJECTIONS_REMAIN"]),
    opinionText: text(),
    recommendations: text().optional(),
  }),
  A("amendOpinion", {
    category: z.enum(["NO_OBJECTIONS", "RECOMMENDATIONS", "OBJECTIONS_REMAIN"]),
    opinionText: text(),
    recommendations: text().optional(),
  }),
  A("raiseBlocking", { reason: text(), subsectionId: z.string().max(10).optional() }),
  A("resolveBlocking", { issueId: id, resolutionNote: text() }),
  A("respondBlocking", { issueId: id, response: text() }),
  A("ownerDecision", {
    decision: z.enum(["APPROVED", "CONDITIONALLY_APPROVED", "REJECTED"]),
    rationale: text(),
    departsFromDpo: z.boolean().optional(),
    departureRationale: text().optional(),
    conditions: z.array(ConditionIn).max(30).optional(),
  }),
  A("confirmCondition", { conditionId: id, note: text(2000).optional() }),
  A("recordProgress", {
    itemType: z.enum(["CONDITION", "MEASURE"]),
    itemId: id,
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional(),
    note: text(4000),
  }),
  A("reopenForChanges", {}),
  A("startRevision", {
    reason: text(2000),
    changeDescription: text(4000),
    categories: z.array(z.string().max(30)).max(12),
  }),
  A("archive", {}),
  A("restore", {}),
  A("deleteDraft", { confirm: z.literal(true) }),
  A("transferOwnership", { newOwnerId: id, keepAsViewer: z.boolean().optional() }),
  A("reassignDpo", { newDpoId: id, reason: text(2000) }),
  A("createAssignment", {
    assigneeId: id,
    subsectionIds: z.array(z.string().max(10)).min(1).max(60),
    taskDescription: text(2000),
    deadline: z.string().max(10).nullable().optional(),
  }),
  A("updateAssignment", {
    assignmentId: id,
    subsectionIds: z.array(z.string().max(10)).min(1).max(60).optional(),
    taskDescription: text(2000).optional(),
    deadline: z.string().max(10).nullable().optional(),
    status: z.enum(["PENDING", "CANCELLED"]).optional(),
  }),
  A("setAssignmentStatus", { assignmentId: id, status: z.enum(["IN_PROGRESS", "COMPLETED"]) }),
  A("grantAccess", { userId: id }),
  A("revokeAccess", { userId: id }),
  A("addComment", {
    subsectionId: z.string().min(1).max(10),
    fieldId: z.string().max(120).optional(),
    recordId: z.string().max(64).optional(),
    threadId: id.optional(),
    parentId: id.optional(),
    body: text(4000),
  }),
  A("resolveThread", { threadId: id }),
  A("reopenThread", { threadId: id }),
  A("confirmReviewed", { subsectionId: z.string().min(1).max(10) }),
]);

export type ActionInput = z.infer<typeof ActionSchema>;
