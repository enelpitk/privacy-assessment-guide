-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'CONTRIBUTOR', 'DPO', 'ADMIN');

-- CreateEnum
CREATE TYPE "Lifecycle" AS ENUM ('DRAFT', 'IN_DPO_REVIEW', 'CHANGES_REQUESTED', 'AWAITING_OWNER_DECISION', 'AWAITING_CONDITIONS', 'FINALISED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('NOT_SUBMITTED', 'AWAITING_DPO', 'DECIDED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "AnswerState" AS ENUM ('ANSWERED', 'UNANSWERED', 'NOT_APPLICABLE', 'NOT_SURE', 'COMPLETE_LATER');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AccessKind" AS ENUM ('SHARED_VIEW');

-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('PARTY', 'DATA_SUBJECT', 'DATA_CATEGORY');

-- CreateEnum
CREATE TYPE "VersionKind" AS ENUM ('DRAFT', 'FINALISED');

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupEntity" TEXT NOT NULL,
    "demoSeedKey" TEXT,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "roles" "Role"[],
    "departmentId" TEXT,
    "demoSeedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "assignedDpoId" TEXT NOT NULL,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'DRAFT',
    "screeningStatus" "ScreeningStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "archivedAt" TIMESTAMP(3),
    "archivedFrom" "Lifecycle",
    "everSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "currentVersionId" TEXT,
    "previousAssessmentRef" TEXT,
    "nextReviewDate" TIMESTAMP(3),
    "demoSeedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentVersion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionNumber" TEXT NOT NULL,
    "kind" "VersionKind" NOT NULL DEFAULT 'DRAFT',
    "templateVersion" TEXT NOT NULL,
    "revisionReason" TEXT,
    "changeDescription" TEXT,
    "changeCategories" TEXT[],
    "carriedFromVersionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "parentId" TEXT,
    "ordering" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecordItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseField" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL DEFAULT '',
    "value" JSONB,
    "state" "AnswerState" NOT NULL DEFAULT 'ANSWERED',
    "rationale" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "lastEditorId" TEXT NOT NULL,
    "lastEditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResponseField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "kind" "EntityKind" NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAccess" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AccessKind" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "subsectionIds" TEXT[],
    "taskDescription" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAssessmentState" (
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "lastSubsection" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAssessmentState_pkey" PRIMARY KEY ("userId","assessmentId")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "versionId" TEXT,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_demoSeedKey_key" ON "Department"("demoSeedKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_demoSeedKey_key" ON "User"("demoSeedKey");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_displayId_key" ON "Assessment"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_demoSeedKey_key" ON "Assessment"("demoSeedKey");

-- CreateIndex
CREATE INDEX "Assessment_ownerId_idx" ON "Assessment"("ownerId");

-- CreateIndex
CREATE INDEX "Assessment_assignedDpoId_idx" ON "Assessment"("assignedDpoId");

-- CreateIndex
CREATE INDEX "Assessment_lifecycle_idx" ON "Assessment"("lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentVersion_assessmentId_versionNumber_key" ON "AssessmentVersion"("assessmentId", "versionNumber");

-- CreateIndex
CREATE INDEX "RecordItem_versionId_collection_idx" ON "RecordItem"("versionId", "collection");

-- CreateIndex
CREATE INDEX "ResponseField_versionId_idx" ON "ResponseField"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseField_versionId_fieldId_recordId_key" ON "ResponseField"("versionId", "fieldId", "recordId");

-- CreateIndex
CREATE INDEX "Entity_versionId_kind_idx" ON "Entity"("versionId", "kind");

-- CreateIndex
CREATE INDEX "AssessmentAccess_assessmentId_idx" ON "AssessmentAccess"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentAccess_userId_idx" ON "AssessmentAccess"("userId");

-- CreateIndex
CREATE INDEX "Assignment_assessmentId_idx" ON "Assignment"("assessmentId");

-- CreateIndex
CREATE INDEX "Assignment_assigneeId_idx" ON "Assignment"("assigneeId");

-- CreateIndex
CREATE INDEX "Event_assessmentId_createdAt_idx" ON "Event"("assessmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_assignedDpoId_fkey" FOREIGN KEY ("assignedDpoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordItem" ADD CONSTRAINT "RecordItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseField" ADD CONSTRAINT "ResponseField_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssessmentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAccess" ADD CONSTRAINT "AssessmentAccess_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAccess" ADD CONSTRAINT "AssessmentAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAssessmentState" ADD CONSTRAINT "UserAssessmentState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAssessmentState" ADD CONSTRAINT "UserAssessmentState_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

