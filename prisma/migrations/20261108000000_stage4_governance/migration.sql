-- CreateEnum
CREATE TYPE "ScreeningPath" AS ENUM ('OPEN', 'FULL', 'PRE_ONLY');

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('SCREENING_SUBMITTED', 'FULL_SUBMITTED', 'FINALISED');

-- CreateEnum
CREATE TYPE "ScreeningDecisionKind" AS ENUM ('PROCEED_FULL', 'PRE_ASSESSMENT_SUFFICIENT');

-- CreateEnum
CREATE TYPE "OpinionCategory" AS ENUM ('NO_OBJECTIONS', 'RECOMMENDATIONS', 'OBJECTIONS_REMAIN');

-- CreateEnum
CREATE TYPE "OwnerDecisionKind" AS ENUM ('APPROVED', 'CONDITIONALLY_APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ThreadState" AS ENUM ('OPEN', 'RESOLVED');

-- AlterEnum
ALTER TYPE "AssignmentStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "screeningPath" "ScreeningPath" NOT NULL DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "kind" "SnapshotKind" NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenById" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningDecision" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "dpoId" TEXT NOT NULL,
    "decision" "ScreeningDecisionKind" NOT NULL,
    "rationale" TEXT NOT NULL,
    "exceptionJustification" TEXT,
    "mitigationControls" TEXT,
    "advice" TEXT,
    "screeningIndicatedFull" BOOLEAN NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreeningDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DpoOpinion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "dpoId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" "OpinionCategory" NOT NULL,
    "opinionText" TEXT NOT NULL,
    "recommendations" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DpoOpinion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockingIssue" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "subsectionId" TEXT,
    "reason" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "ownerResponse" TEXT,
    "ownerRespondedAt" TIMESTAMP(3),

    CONSTRAINT "BlockingIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerDecision" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reviewedSnapshotId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "decision" "OwnerDecisionKind" NOT NULL,
    "rationale" TEXT NOT NULL,
    "departsFromDpo" BOOLEAN NOT NULL DEFAULT false,
    "departureRationale" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Condition" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibleUserId" TEXT,
    "responsibleText" TEXT,
    "deadline" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressRecord" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" TEXT,
    "note" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentThread" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "subsectionId" TEXT NOT NULL,
    "fieldId" TEXT,
    "recordId" TEXT,
    "state" "ThreadState" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CommentThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "isReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewMark" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "subsectionId" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Snapshot_assessmentId_versionId_idx" ON "Snapshot"("assessmentId", "versionId");

-- CreateIndex
CREATE INDEX "ScreeningDecision_assessmentId_versionId_idx" ON "ScreeningDecision"("assessmentId", "versionId");

-- CreateIndex
CREATE INDEX "DpoOpinion_assessmentId_versionId_idx" ON "DpoOpinion"("assessmentId", "versionId");

-- CreateIndex
CREATE INDEX "BlockingIssue_assessmentId_versionId_idx" ON "BlockingIssue"("assessmentId", "versionId");

-- CreateIndex
CREATE INDEX "OwnerDecision_assessmentId_versionId_idx" ON "OwnerDecision"("assessmentId", "versionId");

-- CreateIndex
CREATE INDEX "Condition_assessmentId_versionId_idx" ON "Condition"("assessmentId", "versionId");

-- CreateIndex
CREATE INDEX "ProgressRecord_assessmentId_itemType_itemId_idx" ON "ProgressRecord"("assessmentId", "itemType", "itemId");

-- CreateIndex
CREATE INDEX "CommentThread_assessmentId_versionId_idx" ON "CommentThread"("assessmentId", "versionId");

-- CreateIndex
CREATE INDEX "Comment_threadId_idx" ON "Comment"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewMark_versionId_subsectionId_key" ON "ReviewMark"("versionId", "subsectionId");

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningDecision" ADD CONSTRAINT "ScreeningDecision_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DpoOpinion" ADD CONSTRAINT "DpoOpinion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockingIssue" ADD CONSTRAINT "BlockingIssue_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerDecision" ADD CONSTRAINT "OwnerDecision_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentThread" ADD CONSTRAINT "CommentThread_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Immutability: submitted snapshots, formal DPO opinions and owner decisions can never be changed or deleted.
-- Corrections and amendments are new rows (see docs/architecture.md section 6).
CREATE OR REPLACE FUNCTION dpia_block_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable: record a new row instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Snapshot_immutable" BEFORE UPDATE OR DELETE ON "Snapshot"
  FOR EACH ROW EXECUTE FUNCTION dpia_block_change();
CREATE TRIGGER "DpoOpinion_immutable" BEFORE UPDATE OR DELETE ON "DpoOpinion"
  FOR EACH ROW EXECUTE FUNCTION dpia_block_change();
CREATE TRIGGER "OwnerDecision_immutable" BEFORE UPDATE OR DELETE ON "OwnerDecision"
  FOR EACH ROW EXECUTE FUNCTION dpia_block_change();
