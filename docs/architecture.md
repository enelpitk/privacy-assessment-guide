# Architecture, data model, permissions and workflow

Status: Stage 1 design. Nothing here is implemented yet. Decisions marked **[Interview]** come from the agreed pre-implementation interview and supplement the original specification.

## 1. Stack and layering

Next.js App Router + TypeScript, Tailwind CSS, accessible components (shadcn/ui where helpful), PostgreSQL via Prisma, GitHub → Railway (`main`).

Layers, to keep logic testable without a database:

1. `src/domain/**` is pure TypeScript with no database or framework imports. It holds: template definitions, screening rules, risk maths, completeness, permission matrix, workflow state machine, change classification, report assembly. Tested locally with Vitest.
2. `src/server/**` is data access and use cases. Each use case loads data, calls domain functions, and writes in one transaction.
3. `src/app/**` has routes, route handlers and UI. Route handlers call use cases. They never call Prisma directly.
4. `content/**` holds the structured template definition (fields, guidance, glossary, rules) with a template version.

The production build must not query the database. Prisma Client is generated at install/build; migrations are applied at start (`prisma migrate deploy`), seed is a separate explicit command.

## 2. Demo identity

- "Enter demo as…" sets a signed, HTTP-only cookie holding a demo user ID. No password, no verification. A visible banner states this is not authentication.
- The server resolves the user from the cookie on every request. Roles are never accepted from the client.
- Seed users (all fictional): Owner 1, Owner 2 (process owners), Contributor (IT/security), DPO A, DPO B, Demo administrator. A user may hold several functional roles (a `roles` set on the user, such as owner + contributor).
- Per-assessment capacity is derived, not stored on the user: owner of this assessment, contributor on this assessment (active assignment), assigned DPO, other DPO (view/comment), administrator.

## 3. Data model (hybrid)

Relational records for entities that need integrity, history and querying. Validated JSON for questionnaire responses. All primary keys are cuid strings.

### Identity and access
- `User`: id, displayName, email-like label (fictional), `roles[]` (OWNER, CONTRIBUTOR, DPO, ADMIN), demoSeedKey (nullable; set for seeded records).
- `Organisation`/`Department`: Harbour Financial Group; group entities Bank, Insurance, Asset Management; departments (small fictional set). Seed-managed.
- `AssessmentAccess`: assessmentId, userId, kind (SHARED_VIEW, CONTRIBUTOR), grantedBy, grantedAt, revokedAt. Responsibility never creates a row here. **[Interview]**

### Assessment and versions
- `Assessment`: id, displayId (generated, for example `DPIA-2026-0001`), organisationId, departmentId, ownerId, assignedDpoId, lifecycle (see §6), archivedAt, archivedFrom (lifecycle before archive), everSubmitted boolean, currentVersionId, previousAssessmentRef (text), demoSeedKey (nullable), createdAt, updatedAt.
- `AssessmentVersion`: id, assessmentId, versionNumber (`1.0`, `1.1`, `2.0`…), kind (DRAFT_REVISION, FINALISED), revisionReason, changeDescription, changeCategories[], carriedFromVersionId (nullable), templateVersion, status flags, createdAt. A new revision copies answers and marks sections "Carried forward — please review".
- `Snapshot`: id, versionId, kind (SCREENING_SUBMITTED, FULL_SUBMITTED, FINALISED), takenAt, takenBy, contentHash, `payload` JSON (immutable: responses, records, risks, derived outputs). Immutability is enforced by never updating rows and by a database trigger or Prisma middleware that rejects updates and deletes on `Snapshot`.

### Responses (JSON, per-field revisions)
- `ResponseField`: id, versionId, fieldId (inventory ID), recordId (nullable), value JSON, answerState (ANSWERED, UNANSWERED, NOT_APPLICABLE, NOT_SURE, COMPLETE_LATER), rationale text, active boolean (false when hidden by conditions; value preserved), revision int, lastEditorId, lastEditedAt. Unique on (versionId, fieldId, recordId). **[Interview]** per-field optimistic concurrency.
- `ReviewMark`: versionId, subsectionId, carriedForward boolean, reviewedConfirmedBy/At (for revisions).
- Validation is by a Zod schema generated from the field definitions. Unknown field IDs are rejected.

### Repeatable and shared entities
- `Party`: assessmentId, name, kind (CONTROLLER, JOINT_CONTROLLER, PROCESSOR, SUB_PROCESSOR, RECIPIENT, OTHER), parentPartyId (sub-processor → processor), fields in JSON where needed. Referenced from controllers, processors, recipients.
- `DataCategory`: assessmentId, name, isSpecialCategory, isCriminal, specificity hint dismissed flag.
- `Purpose`: assessmentId, ordering, fields in `ResponseField` with recordId; links to DataCategory and data-subject categories via `EntityLink`.
- `EntityLink`: from (type, id), to (type, id), role. Used for reference checks. Renaming propagates because everything references the entity ID. Deleting an entity with links returns the reference list and requires an explicit per-link choice (unlink, replace with another entity, cancel). **[Interview]** structural changes use record-level checks.
- Record-level `revision` on each repeatable record (`Party`, `DataCategory`, `Purpose`, `Risk`, `Measure`, `Condition`) covers delete, reorder and structural change only. Field edits inside a record use `ResponseField.revision`. **[Interview]**

### Collaboration
- `Assignment`: id, assessmentId, assigneeId, subsectionIds[], taskDescription, deadline (nullable), status (PENDING, IN_PROGRESS, COMPLETED), createdBy, completedAt, reopenedAt.
- `CommentThread`: assessmentId, versionId, fieldId (nullable), state (OPEN, RESOLVED), createdBy. `Comment`: threadId, authorId, body, createdAt, parentCommentId (replies), visibility (REVIEW or GENERAL for export default).
- `Notification`: id, userId, kind, assessmentId, link target, dedupeKey (unique), readAt, createdAt. Idempotency via unique `dedupeKey`, for example `OVERDUE:<measureId>:<dueDate>`.
- `Event` (audit): id, assessmentId, versionId, actorId, type, payload JSON, createdAt. Significant events only (creation, sharing, assignment, ownership transfer, DPO reassignment, submission, withdrawal, changes requested, opinion/amendment, decision, conditions confirmed, new revision, review-date change, archive/restore, reopen for changes).

### Review and decision
- `ScreeningRecord`: versionId, snapshotId, suggestions JSON (rule outputs), confirmed answers JSON (with rationale per question), outcomes JSON (`fullDpiaIndicated`, `tiaIndicated`, `unresolved[]`), ruleVersion, supersededAt (invalidated by later screening answer changes). **[Interview]**
- `ScreeningDecision`: screeningRecordId, dpoId, decision (PROCEED_FULL, PRE_ASSESSMENT_SUFFICIENT), rationale (always), exceptionJustification, mitigationControls, advice, decidedAt. Append-only.
- `DpoOpinion`: id, versionId, snapshotId, dpoId, category (NO_OBJECTIONS, RECOMMENDATIONS, OBJECTIONS_REMAIN), opinionText, recommendations, supersedesOpinionId (nullable, amendments), submittedAt. Append-only; the owner cannot change it.
- `BlockingIssue`: assessmentId, versionId, fieldId or subsection (nullable), reason, raisedBy (DPO), raisedAt, resolvedBy/At, resolutionNote, reviewedByDpoAt.
- `OwnerDecision`: versionId, reviewedSnapshotId, ownerId, decision (APPROVED, CONDITIONALLY_APPROVED, REJECTED), rationale, disagreesWithDpo boolean, disagreementRationale, acceptedRiskNote, decidedAt, supersedes (corrections create a new row). Risk acceptance never marks mandatory steps satisfied (§7 rules).
- `Condition`: id, versionId, description, responsibleUserId or responsibleText, deadline, state, `ownerConfirmedAt/By`. Wording, deadline and responsible person are substantive. **[Interview]**

### Risk
- `Risk`: assessmentId, versionId, name, whatCouldGoWrong, whoAffected, harm, inherentP, inherentI, residualP, residualI, targetP, targetI (all nullable; null renders "Not assessed", never 0), additionalActions, specialistReviewNote, exampleId (nullable), confirmedAdapted boolean, ordering, revision.
- `Measure`: riskId, description, responsibleUserId/responsibleText, dueDate, plannedStatus (NOT_STARTED, IN_PROGRESS, COMPLETED).
- `ProgressRecord`: id, itemType (MEASURE, ACTION, CONDITION), itemId, versionId, status, note/evidence, authorId, recordedAt. Append-only; never rewrites snapshots. **[Interview]** Current status is the latest record.

### Future optional fields
Process IDs and information-system IDs are not in the UI. They can be added later as nullable columns on `Assessment` via a migration with no impact on existing rows. No generic custom-field table.

### Seed and reset
Every seeded record carries `demoSeedKey`. Reset selects by that key and dependent records only, and runs in a transaction. Selection logic is a pure function with local tests. Database-level reset safety remains "not yet verified" until an isolated environment exists. **[Interview]**

## 4. Server-side permissions

Every use case calls `can(actor, action, assessmentContext)` from `src/domain/permissions`. Route handlers must not skip it, and a coverage test lists all actions and fails if an action has no matrix entry. The rule is re-evaluated on every save: role, assignment, lifecycle lock, change class, subsection scope.

Capacity per assessment: **O** owner, **C** contributor with active assignment for the subsection, **R** responsible person for the item, **D** assigned DPO, **D2** other DPO, **A** administrator, **S** shared viewer.

| Action | O | C | R | D | D2 | A | S |
|---|---|---|---|---|---|---|---|
| View assessment | ✔ | ✔ | ✔ (only if access) | ✔ | ✔ | ✔ (demo admin sees all for reset) | ✔ |
| Edit substantive answer in unlocked subsection | ✔ | ✔ in assigned subsection while assignment is pending or in progress | ✘ | ✘ | ✘ | ✘ | ✘ |
| Create or edit shared entity within editable scope | ✔ | ✔ if used only inside scope | ✘ | ✘ | ✘ | ✘ | ✘ |
| Change shared entity affecting references outside scope; delete shared entity | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Add/edit risk, measure wording | ✔ | ✔ in assigned J subsection | ✘ | ✘ | ✘ | ✘ | ✘ |
| Update progress status/evidence of own item | ✔ | ✘ unless also R | ✔ own item | ✘ | ✘ | ✘ | ✘ |
| Comment, reply, resolve/reopen thread | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ (see note 1) |
| Create/edit/reopen assignments | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Mark own assignment complete | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Share/revoke access | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Choose responsible person | ✔ (any person with access; others need sharing step) | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Submit screening / full assessment | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Withdraw for editing | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Request changes (requires comment) | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ |
| Record screening decision, submit opinion, amend opinion, raise/resolve blocking issue | ✘ (never, even if also DPO) | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ |
| Owner decision, confirm conditions | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Transfer ownership (to another process owner) | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Reassign DPO (reason required) | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| Reopen for changes (after DPO review) | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Start review/update revision | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Set next review date / no scheduled review | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Archive / restore | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Hard-delete never-submitted draft | ✔ (confirm) | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Reset seeded demo data (confirmation) | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |

Notes:
1. Shared viewers are users given explicit view access; they may comment only if the owner grants comment ability (default: view only).
2. Visibility: owners and contributors see only assessments they own or have been assigned/shared. Any DPO sees all demo assessments. The administrator sees the admin page and the data needed for reset, and otherwise follows normal visibility rules.
3. Owner ≠ DPO: a user who owns an assessment can never be its assigned DPO, and cannot submit DPO actions on it even if they hold the DPO role elsewhere.
4. Access removal keeps responsibility records, notifies the owner, and suppresses notifications with inaccessible links. **[Interview]**
5. Completing or removing an assignment does not remove access still granted by another active assignment, ownership or explicit sharing.

Non-assignable (never delegated by assignment): DPO decisions and opinions, owner decision, conditions confirmation, sharing, ownership, review dates, submissions. **[Interview]**

## 5. Change classification (central, versioned)

Every editable field and action maps to a class in the template-rules file. A test fails if a field ID in the inventory has no class.

| Class | Includes | Effect |
|---|---|---|
| SUBSTANTIVE | All questionnaire answers and rationales; parties, purposes, data categories, recipients; risk descriptions and all scores (inherent, residual, target); measure descriptions, deadlines, responsible persons; condition wording, deadline, responsible person | Locked during submitted review. After DPO review: explicit "Reopen for changes", then renewed submission and review. After finalisation: new revision. |
| PROGRESS | Measure/action/condition status; implementation notes/evidence | Append-only `ProgressRecord`. Allowed in permitted states. No re-review. If it reveals changed processing, failed controls or another substantive change, use the substantive workflow. |
| ADMINISTRATIVE | Review date and "no scheduled review" rationale; assignments; sharing; ownership transfer; DPO reassignment; comments; owner decision and rationale; archive/restore | Logged; no revision. Owner decision references the exact reviewed snapshot. Corrections are explicit, auditable new rows. |

A change to screening answers after screening submission supersedes the `ScreeningRecord`, invalidates the screening decision, and requires renewed screening review. **[Interview]**

## 6. Workflow

Lifecycle, review status and decision are modelled separately.

**Lifecycle (`Assessment.lifecycle`)**: `DRAFT`, `IN_DPO_REVIEW`, `CHANGES_REQUESTED`, `AWAITING_OWNER_DECISION` (DPO review complete), `AWAITING_CONDITIONS`, `FINALISED`, `ARCHIVED`.

**Screening status (`ScreeningStatus`)**: `NOT_SUBMITTED`, `AWAITING_DPO` (shows "Full DPIA indicated — awaiting DPO review" when indicated), `DECIDED`, `INVALIDATED`.

**Decision**: none / APPROVED / CONDITIONALLY_APPROVED / REJECTED (on `OwnerDecision`).

### Screening gate
- Owner submits A–C: creates a `SCREENING_SUBMITTED` snapshot of A–C and locks A–C. Editing a locked A–C field needs withdrawal of the screening submission; a change to a screening answer supersedes the `ScreeningRecord` and invalidates the screening decision (renewed review required).
- D–K remain editable while `ScreeningStatus = AWAITING_DPO`.
- The assigned DPO records `ScreeningDecision`: PROCEED_FULL, or PRE_ASSESSMENT_SUFFICIENT. Rationale always. If screening indicates a full DPIA and decision is sufficient: exception justification and mitigation controls are required.
- PRE_ASSESSMENT_SUFFICIENT additionally records a short formal `DpoOpinion` in the same action, then the lifecycle moves to `AWAITING_OWNER_DECISION`. Full-assessment sections become inactive (values preserved, excluded from completeness and active reports).
- PROCEED_FULL activates D–K as required.

### Full gate
Valid transitions (anything else is rejected by the state machine):

| From | Action | Actor | To | Effects |
|---|---|---|---|---|
| (none) | create | O | DRAFT | Starts at C (pre-assessment) first; no bypass |
| DRAFT | submit screening | O | DRAFT, ScreeningStatus AWAITING_DPO | Snapshot A–C |
| DRAFT | submit full | O | IN_DPO_REVIEW | Requires screening decided PROCEED_FULL; validates applicable content; unresolved answers allowed only with explanation or question; creates `FULL_SUBMITTED` snapshot; locks substantive edits; comments stay open; waits for pending saves; atomic |
| IN_DPO_REVIEW | withdraw for editing | O | DRAFT | Snapshot preserved |
| IN_DPO_REVIEW | request changes (comment required) | D | CHANGES_REQUESTED | Notifies owner |
| CHANGES_REQUESTED | edit/resubmit | O | DRAFT then IN_DPO_REVIEW | |
| IN_DPO_REVIEW | submit opinion | D | AWAITING_OWNER_DECISION | Immutable `DpoOpinion`; may submit despite unresolved issues; blocking issues persist |
| AWAITING_OWNER_DECISION | record decision: Approved | O | FINALISED | Allowed only if no blocking issue unresolved and reviewed (rule `BLOCK-HOLD`) |
| AWAITING_OWNER_DECISION | record decision: Conditionally approved | O | AWAITING_CONDITIONS | At least one condition with owner, deadline |
| AWAITING_OWNER_DECISION | record decision: Rejected | O | FINALISED (decision REJECTED recorded and visible) | |
| AWAITING_OWNER_DECISION | reopen for changes | O | DRAFT | Substantive edits require explicit reopen; reviewed snapshot and opinion preserved; renewed review |
| AWAITING_CONDITIONS | confirm all conditions | O | FINALISED (Approved) | Owner confirmation separate from responsible person's progress |
| FINALISED | start review/update | O | New version DRAFT (FINALISED version preserved) | Always revisit pre-assessment; approvals/opinions not carried forward |
| DRAFT (never submitted) | hard delete | O | deleted | Confirmation; only if `everSubmitted` is false |
| any except ARCHIVED | archive | O | ARCHIVED | Lifecycle restored on restore via `archivedFrom` |
| ARCHIVED | restore | O | previous lifecycle | |
| any | amend opinion | D | stays | New `DpoOpinion` row `supersedesOpinionId`; amendment is a new recorded version |

Substantive edit after DPO review: blocked unless the owner has executed "Reopen for changes" (renewed review required). Owner decision and rationale do not trigger renewed review.

Decision invariants:
- An `OwnerDecision` always records its `reviewedSnapshotId`.
- Disagreement with a DPO recommendation requires rationale; the DPO opinion is preserved and the report shows both.
- Risk acceptance never marks a missing legal basis, required consultation or other mandatory step as satisfied.
- A DPO-marked blocking issue stays blocking until the assigned DPO resolves it in a review; owner disagreement is preserved.
- Rejected decisions remain recorded and visible.

### Deadlines and notifications
Due items (assignments, measures, actions, conditions, review dates) are checked on relevant application visits. Each notification has a unique `dedupeKey`, so repeated checks create no duplicates. Overdue items show "Overdue" with the date, stay visible, and never change scores or revoke decisions. Free-text responsible persons are never notified; the owner is notified instead.

Documented demo limitation: no background scheduler, so overdue detection happens when a relevant user visits.

## 7. Reports and export
Report and JSON are assembled from a selected `Snapshot`/version by a pure function. Components of one export always come from the same version; a test asserts that opinion, answers and decisions share the version ID. Unfinished reports carry a prominent DRAFT mark. Help text and examples are excluded; inactive answers are excluded; unanswered and N/A items are labelled. Review comments are excluded unless "Include review comments"; formal DPO opinions and decision rationales are always included. Progress records after the snapshot are shown separately with timestamps.

## 8. Concurrency protocol
- Save request carries `{fieldId, recordId, baseRevision, newValue}` per changed field, plus a client request sequence number.
- The server, in one transaction, rechecks permission, assignment, lifecycle lock and class, then compares `baseRevision` to `ResponseField.revision`. Match: write and increment. Mismatch: return `409` with saved value, editor and time.
- The client shows saved value and the user's value; actions "Keep saved", "Use mine", "Edit merged". Each re-submits against the latest revision; no unchecked overwrite.
- The client ignores out-of-order responses (sequence number) so a delayed autosave can't mark newer edits as saved. Unsaved values stay in the view; saved, conflicting and failed fields are visually distinct. A `beforeunload` warning applies while unsaved.
- Submission first flushes pending saves and requires no conflicts or failures, then creates the snapshot and locks in one transaction.
- Structural changes (delete, reorder) use record revisions and reference checks.

## 9. Testing plan (agreed layers)
1. **Local**: Vitest on `src/domain` (screening, risk, completeness, permissions matrix, state machine, change-class coverage, inventory coverage, concurrency decision logic, report assembly, notification dedupe keys, reset selection). Command `npm test`, run with `npm run build` before each push.
2. **On demand against Railway**: HTTP acceptance script with a unique run ID and fictional records; checks real route authorisation and persistence; cleanup per lifecycle rules (delete eligible drafts, archive submitted); never auto-run on deploy; never runs the seeded reset.
3. **Manual browser checks** on Railway. Reset DB-level safety stays "not yet verified".
