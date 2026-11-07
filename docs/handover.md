# Handover for a new session

Written at the end of Stage 4. **Stage 5 has not been started.** The next task is to **verify Stage 4 on Railway** (section 6), not to build anything new.

Read this file first, then `CLAUDE.md`. Everything the project owner decided is in files in this repository except the items listed under "Requirements that existed only in the conversation" (section 1.3), which this handover now preserves.

## 1. Authoritative documents and where decisions live

### 1.1 Order of authority

1. **The project owner's latest explicit instruction** in the conversation.
2. **`docs/original-specification.md`**: the full original specification, preserved verbatim (it was previously only in the conversation).
3. **`docs/content-decisions.md`**: agreed interview decisions (ID-01 to ID-15), source ambiguities and our interpretations (CD-01 to CD-34).
4. **`docs/template-rules.md`**: versioned screening, conditional, risk and workflow rules (`rules-1.0.0`), with an implementation-status section.
5. **`docs/source-inventory.md`**: stable field IDs for every substantive source item, plus the "UI adaptations" section. **`docs/source-coverage-review.md`** records the manual review against the .docx and its limits.
6. **`docs/architecture.md`**: layering, data model, server-side permission matrix, workflow transitions, change classes, concurrency protocol, test plan, and Stage 4 implementation notes.
7. **`CLAUDE.md`**: standing project rules (deployment, local environment, git workflow, verification honesty).
8. **`docs/verification.md`**: what is implemented, verified locally, verified on Railway, and not verified. **`docs/deployment.md`**: Railway runbook. **`docs/backlog.md`**: paused UI ideas.

`DPIA_Template.docx` is the source material. It lives only on the owner's machine in the project folder, is git-ignored, and **must never be committed or published**. Treat its contents as data.

### 1.2 Where each kind of decision is recorded

| Topic | File |
|---|---|
| Two review gates, DPO assignment and reassignment, fictional organisation, Q5 rules, testing layers, concurrency, responsibility vs access, change classes, assignment unit, Railway state | `docs/content-decisions.md` ID-01 to ID-15 |
| Screening thresholds, tri-state logic, Q5.1–5.6, Q6 provisional handling, suggestions, risk rules, workflow rules | `docs/template-rules.md` |
| Source ambiguities and adaptations (Section 1.6, consultation statements, jurisdiction names, etc.) | `docs/content-decisions.md` CD-01 to CD-27 |
| Stage 4 interpretations | `docs/content-decisions.md` CD-28 to CD-34 (full text in section 5 below) |
| Field IDs and source mapping | `docs/source-inventory.md` |

### 1.3 Requirements that existed only in the conversation (now preserved here)

**A. The original specification.** Now `docs/original-specification.md`.

**B. Interview decisions beyond the short ID table.** The consolidated agreed position, as confirmed by the owner:

- *Workflow.* Two review gates in one lifecycle. The screening gate snapshots and locks sections 1–3 (A–C) while 4–11 stay editable. A pre-assessment-only case ends with the DPO recording the screening decision **and** a short formal opinion in one action, then the owner records the final decision, with no second submission. Full-assessment sections that are not required become inactive, answers preserved. Changing screening answers after submission invalidates the affected screening decision and needs renewed review; earlier snapshots and decisions stay in history. An exception to a "full DPIA indicated" result needs a justification and mitigation controls; a screening rationale is always recorded.
- *People.* Two fictional DPO users, distributed across the demo scenarios. The owner picks the assigned DPO at creation (eligible DPOs only; never the owner). The administrator may reassign with a required reason, recording previous DPO, new DPO, actor and time. Reassignment preserves earlier decisions with original authors, transfers a pending review to the new DPO and **notifies them** (notification part is Stage 5). Only the currently assigned DPO submits screening decisions, opinions and amendments.
- *Fictional content.* Organisation **Harbour Financial Group**, entities **Bank, Insurance, Asset Management** (offered as selectable suggestions with custom entries allowed; never prefilled). Named internal tools replaced by functional descriptions with optional text/link references (no integrations). "Supervisory authority" in the interface with an optional authority-name field; the original named authority is kept only in the inventory. Never invent or alter legal citations; flag those needing owner verification. Keep useful banking examples as clearly labelled fictional guidance.
- *Screening rules.* Thresholds (5000 / 10 000 / 50 000, inclusive) are versioned template rules, not statutory thresholds. Q1 counts distinct individuals across special-category and criminal data. **Each of Q5.1–5.6 needs both the specific risk and ≥ 10 000 individuals to whom that risk applies** (per sub-question, never the overall population, never summed). Results are Yes / No / Unresolved; an estimate that straddles a threshold is Unresolved; a Yes stays Yes while another sub-question is unresolved. 5.2 means compromise could enable identity theft or fraud (not merely that identity data exists); 5.3 property harm (account data is an example); 5.4 discriminatory outcomes (segmentation is an example); 5.6 has the same two-condition structure (computer-activity-monitoring scope flagged). A sub-population larger than the total is flagged, never silently adjusted. Q6 is flagged for DPO review when the population may be ≥ 50 000 and any of Q1–Q5 is confirmed Yes; it is never silently treated as No. Q7 alone indicates TIA follow-up only, never a full DPIA. A screening "No" is never a guarantee; the DPO may still require a full DPIA. All suggestions need user confirmation or an explained override, and the suggestion, confirmed answer and rationale are preserved.
- *Testing and operations.* Three layers: pure TypeScript tests locally (no DB, no server); HTTP acceptance tests on demand against Railway using fictional records with a unique run id, cleaned up by lifecycle rules (delete eligible drafts, archive submitted ones; no cleanup endpoint, no bypassing immutability); manual browser checks. **Use the single existing Railway database; create no extra infrastructure; do not run the seeded-demo reset against the shared database**; DB-level reset safety stays "not yet verified" until an isolated environment exists (ask before creating one). Distinguish implemented / local / Railway / manual / unverified; never claim a test passed unless it ran.
- *Concurrency.* Per-field optimistic concurrency; record-level checks for structural changes; different fields (even in one record) save independently; atomic revision check and write; permissions and locks rechecked on every save; stale autosaves cannot overwrite newer edits; "Use mine" still checks the latest revision; submission waits for pending saves and requires conflicts resolved.
- *Responsibility vs access.* A responsible person is a demo user who already has access, or free text. Naming someone never grants access (sharing is a separate, explicit, logged action). Free-text people get no notifications (the owner is notified instead). A responsible user may update only status and evidence of their own item; the owner still confirms conditions.
- *Change classes.* Substantive (locked in review; reopen after review; new revision after finalisation), progress (append-only timestamped records, never rewrite snapshots), administrative (logged, no revision). Every field must be classified (coverage test).
- *Assignments.* Unit is the subsection (stable IDs). Contributors cannot change unassigned content through shared entities; shared-entity deletion is owner-only; completing an assignment ends editing rights and the owner may reopen; decisions and administrative actions are non-assignable.
- *Railway.* Do not install the Railway or GitHub CLI. The owner performs dashboard actions guided step by step by the assistant. **Never ask for credentials.** Do not create duplicate services or a new project. `DATABASE_URL` must be a reference, not a pasted value.

**C. UI decisions made after Stage 2 (they supersede earlier UI preferences where they conflict).**

- Visible numbering: sections **1–11** and subsections **1.1, 1.2, 2.1 …** in order; "Stage" and letters A–K are never shown. Internal IDs, routes, stored answers and assignment references are unchanged. (The "Coming in Stage N" notices name development stages and are a known cosmetic leftover.)
- Compact typography (about 14–16 px), tighter spacing; progressive disclosure: guidance, examples and original wording behind one **Guidance** control; essential qualifications stay visible (flagged per field); one collapsible **About this section** replaces the always-open right-hand help column; **Answer options** control replaces the permanent status dropdown, with a selected "Not sure", "Complete later" or "Not applicable" state kept visible.
- Collapsible left navigation (open on desktop, collapsed on mobile; the preference is a browser setting, not assessment data).
- No routine per-field "Saved" badge or "Last edited by" text in the form (kept internally); one save indicator in the assessment header. The Owner item is not part of the questionnaire (owner shown in the header; exported from the owner relationship under inventory ID `A.owner`). The assessment identifier is hidden from the questionnaire and header (kept in the register and exports).
- 1.1 Processing and 1.2 Reason: no answer-options controls; "Select all that apply" and "Existing assessments are entered manually…" removed.
- 2.1 Controllers: compact controller records with a "Select" control (Harbour Insurance, Harbour Asset Management, Harbour Bank; saved custom names stay selectable); the controller-type radios and "no joint controllers" checkbox are retired but their stored data is preserved; **one** collapsed "Guidance" near the "Controller" heading; "+ Add a new Controller"; a single "Not sure – I need help" request (with comment) at the **bottom** of the page. 2.2 Processors: compact, collapsible processor records with nested sub-processors; "No processors are involved" checkbox kept; no suggestions list; "+ Add processor" / "+ Add sub-processor"; the same single help request. An active help request keeps the subsection unresolved until cleared; opening it changes nothing; existing "Not sure"/"Complete later" states are preserved and shown with an explicit "Mark as answered".
- Further UI refinement is **paused**; ideas are in `docs/backlog.md` and must not be implemented without a new instruction.

**D. Working agreements.**

- Wait for the owner's go-ahead before starting each stage; finish each stage with a concise handover and then stop.
- Commit and push each completed stage to `main` only after `npm run typecheck`, `npm test` and `npm run build` pass; never commit secrets, `.env` or the .docx. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Be explicit about what is verified locally versus on Railway/in a browser. A passing build is not acceptance.
- Practical notes: the Bash tool mishandles heredocs containing triple quotes, so write multi-line Python/edit scripts to a file in the scratchpad and run them; the repo is on Windows with CRLF warnings that are harmless; Prisma is pinned to 6.19.3, Next to 15.5.29, Tailwind 3.4, TypeScript 5.9, Vitest 3.2 (newer majors exist but were deliberately avoided).

## 2. Repository state

- GitHub: `https://github.com/enelpitk/privacy-assessment-guide`, branch `main` (Railway deploys from it).
- History: `11dab25` Stage 1; `edcca9d` Stage 1 review; `f633dad` Stage 2; `f24245a` collapsible navigation; `010e932` progressive disclosure; `d467fff` header save indicator and Owner item removed; `f66014c` numbering, density, sections 1.1–2.2; `86b8804` controllers page correction; `122f31e` Stage 3; `40d141a` Q7 repair and commit id on `/api/health`; `96d8f50` Stage 3 Railway verification record; **`5031588` Stage 4**.
- Layout: `src/domain` (pure rules, workflow, permissions, snapshots), `src/content` (structured template definitions with stable IDs), `src/server` (use cases), `src/app` (routes and pages), `src/components/form` (client form, store, governance screens), `prisma/` (schema, migrations, seed), `tests/`, `docs/`, `scripts/start.mjs`.
- Commands: `npm test`, `npm run typecheck`, `npm run build` (no database needed); `npm start` (Railway: migrate, optional seed, start). No local database, no local server.

## 3. Stage 4: commit `5031588`

### 3.1 Implemented functionality

- **Assignments and sharing.** Owner assigns subsections (grouped by section, with "select all assignable") to a Contributor or Process owner, with task description and optional deadline; statuses pending, in progress, completed, cancelled; the assignee starts and completes; completion ends editing; the owner reopens or cancels. Non-assignable: 3.9, 3.10, 11.1, 11.4, 11.5, 11.6. Explicit, logged, read-only sharing.
- **Comments.** Question-level threads and section-level threads with replies, resolve and reopen; available to the owner, assignees and any DPO; shared viewers and admins cannot comment; allowed while locked, not while archived. DPO comments are marked as review comments. Open threads are listed on the overview.
- **Ownership transfer** (to another process owner who is not the assigned DPO; optional logged "keep me as viewer") and **assigned-DPO reassignment** by the administrator on `/admin` (reason required; event records previous DPO, new DPO, actor, time and whether a review was pending).
- **Screening gate.** Owner submits sections 1–3 after blockers are cleared; atomic snapshot (`SCREENING_SUBMITTED`) plus lock; the assigned DPO records the decision (`PROCEED_FULL` or `PRE_ASSESSMENT_SUFFICIENT`); sufficient requires the short opinion in the same action and, if a full DPIA was indicated, an exception justification and mitigation controls. Withdraw, and reopen (supersedes the decision, keeps history).
- **Full-review gate.** Submit (blockers listed), atomic snapshot (`FULL_SUBMITTED`) and lock, withdraw, DPO request changes (comment required), DPO opinion (three workflow categories), DPO amendment as a new superseding row, blocking issues (raise, owner response, resolve by the assigned DPO only).
- **Owner decision and conditions.** Approved / conditionally approved / rejected with rationale; departure-from-DPO acknowledgement; blocked by open blocking issues (rejection still allowed); conditions with description, responsible person (demo user or free text) and deadline; append-only progress records for conditions and risk measures; owner confirmation completes conditions and then records an Approved decision and a finalised snapshot; reopen for changes (renewed review required).
- **Versions.** "Start review / update" creates a new draft revision (version 2.0, 3.0 …) with copied answers, records and shared entries (ids remapped), reason, description and change categories; every section marked "Carried forward — please review" and must be confirmed before submission; fresh screening; approvals and opinions not carried forward; read-only snapshot viewer pages with fingerprints.
- **Archive, restore and deletion.** Archive and restore by the owner; hard delete only for a never-submitted draft with confirmation.
- **Path activation.** `screeningPath` (OPEN / FULL / PRE_ONLY). PRE_ONLY deactivates sections 4–10 plus 11.2 and 11.3; answers kept.
- **Events.** Significant events are recorded (creation, sharing and assignment changes, ownership transfer, DPO reassignment, submissions, withdrawals, changes requested, opinions and amendments, blocking issues, decisions, conditions, progress, new revision, review-date changes, archive and restore). Individual keystrokes are not logged. Notifications are **not** built (Stage 5).
- **UI.** New screens: Review and decisions, Team and sharing, History and versions, `/admin`, snapshot viewer; questionnaire shows carried-forward banners, comment links and compact review status in 3.10, 11.1 and 11.4.
- **Server.** One validated action endpoint (`POST /api/assessments/[id]/actions`); every action rechecks role, state and content rules; state changes are guarded conditional updates inside one transaction with the snapshot and event writes.

### 3.2 Actual local verification (run just before the Stage 4 commit and again for this handover)

- `npm run typecheck`: clean.
- `npm test`: **259 tests pass in 12 files**: domain 28, permissions 18, inventory coverage 6, screening 34, risk summary 12, render 37, store 13, server save 18, **governance server flows 46**, workflow rules 28, governance UI by role 18, navigation toggle 1.
- `npm run build` with no `DATABASE_URL`: succeeds; all routes dynamic; no database queried.
- The 46 server-flow tests drive the real use-case code against an **in-memory fake database** (`tests/fakeDb.ts`): permission matrix, locks, screening and full review cycles, blocking issues, conditions and progress, reopen, revisions (id remapping), archive and deletion, ownership transfer, DPO reassignment, assignments, sharing, comments, review-date events. The fake emulates immutability and unknown-column errors but **not** PostgreSQL, real transactions, triggers or cascades.
- The tests found and fixed two real bugs before commit: the workflow patch used a non-existent `path` column instead of `screeningPath`, and `deleteDraft` read version ids after the cascade would have removed them.
- A check confirmed the committed migration equals the schema change plus the appended triggers.

### 3.3 Local-only limits (not claimed)

No test touched PostgreSQL, a browser or Railway for Stage 4. Layout, keyboard use, accessibility and mobile behaviour of the new screens have not been seen.

## 4. The new migration and what still needs verification

Migration `prisma/migrations/20261108000000_stage4_governance/migration.sql`, applied automatically by `prisma migrate deploy` at startup. It is additive: new tables (`Snapshot`, `ScreeningDecision`, `DpoOpinion`, `BlockingIssue`, `OwnerDecision`, `Condition`, `ProgressRecord`, `CommentThread`, `Comment`, `ReviewMark`), new enums, `Assessment.screeningPath` (default OPEN), enum value `AssignmentStatus.CANCELLED`, and triggers that raise an error on UPDATE or DELETE of `Snapshot`, `DpoOpinion` and `OwnerDecision`. It does not alter existing rows. **No reseed is needed; existing assessments and the Stage 3 test assessment must survive.**

Still requiring PostgreSQL / browser verification:

1. The migration applies cleanly on the existing production database and `/api/health` stays `ok` (check the `commit` field shows `5031588` or later).
2. Existing assessments and answers are intact (the test assessment named "TEST Stage 3 verification (fictional)", id `cmw6pqg3g0001o81vo2fz7mg4`, owner Alex Rowan).
3. The immutability triggers actually reject changes to snapshots, opinions and owner decisions.
4. Guarded atomic submissions under real transactions; no half-applied state if a step fails.
5. Cascading deletion of a never-submitted draft (and explicit removal of its review marks), and refusal to delete a submitted assessment.
6. A full review cycle across **two browser sessions and four identities** (owner, assigned DPO, other DPO, contributor), including admin DPO reassignment. Also verify the CD-32 boundary: a Process owner assigned to another owner's assessment has contributor permissions only (no ownership, sharing, transfer or decision rights).
7. New revision: finalised version intact, answers, records and shared entries copied consistently.
8. The review, team, history and snapshot pages, comment threads, and the carried-forward flow in a real browser; desktop and mobile.

## 5. Stage 4 interpretations: CD-28 to CD-34

**Status update (2026-11-07, later session): all of CD-28 to CD-34 and the rejected-decision rule (CD-35) are confirmed by the project owner, some with corrections implemented locally and not yet committed or deployed.** The table below keeps the original Stage 4 wording; `content-decisions.md` holds the confirmed scope (CD-30 reminder, CD-31 carry-forward of measure status, CD-33 reuse of an existing share, "Finalised — Rejected" label, "Earlier screening cycle" opinion label). (Wording below matches `docs/content-decisions.md`.)

| ID | Point | Interpretation implemented | Status |
|---|---|---|---|
| **CD-28** | Help-request resolution ("comments and help-request resolution") | A help request has its own question-level comment thread. Anyone who can comment (owner, assignees, any DPO) can reply and resolve or reopen the thread. **Resolving the thread does not clear the help request**: it stays unresolved until the person who raised it (owner or assigned contributor) clears it, because an active help request must remain unresolved. | Confirmed 2026-11-07 (see `content-decisions.md` for scope and later corrections) |
| **CD-29** | Sections that cannot be assigned | Decision and administrative subsections: 3.9 screening outcome, 3.10 DPO screening decision, 11.1 DPO review, 11.4 final decision and conditions, 11.5 periodic review, 11.6 version history. "All assignable sections" excludes them. | Confirmed 2026-11-07 (see `content-decisions.md` for scope and later corrections) |
| **CD-30** | Owner departing from the DPO's opinion | An explicit acknowledgement plus rationale is required when the latest opinion is "Recommendations / conditions" and the owner approves without conditions, or "Objections remain" and the owner approves or conditionally approves. The DPO opinion is preserved; the report (Stage 5) must show both. Risk acceptance never resolves a DPO blocking issue or satisfies a mandatory step. Rejection needs no departure. | Confirmed 2026-11-07 (see `content-decisions.md` for scope and later corrections) |
| **CD-31** | Progress on risk measures after review | In draft, measure status and evidence are edited in the risk register as ordinary answers. Recorded evidence uses append-only progress records on Review and decisions, available to the owner and the responsible demo user; these never edit a snapshot, score or decision. The register's own "measures completed" count still reads the register fields, not the progress records. | Confirmed 2026-11-07 (see `content-decisions.md` for scope and later corrections) |
| **CD-32** | Who can be assigned a section | Only users with the Contributor or Process owner role; never the owner; never the assigned DPO (the DPO reads and comments and does not edit owner answers). | Confirmed 2026-11-07 (see `content-decisions.md` for scope and later corrections) |
| **CD-33** | Ownership transfer | The new owner must hold the Process owner role and must not be the assigned DPO. The previous owner loses owner permissions and access unless "keep me as a viewer" is ticked, which creates an explicit, logged view share. | Confirmed 2026-11-07 (see `content-decisions.md` for scope and later corrections) |
| **CD-34** | Pre-assessment-only path | After "pre-assessment sufficient": sections 4–10 and 11.2 (views) and 11.3 (supervisory authority) are inactive and their answers are kept; sections 11.1, 11.4, 11.5, 11.6 and 11.7 stay active. Reopening the screening restores them. "Reopen for changes" is not offered on this path; use "Reopen screening". | Confirmed 2026-11-07 (see `content-decisions.md` for scope and later corrections) |

Other interpretations still open for the **template owner** (not the project owner's decision alone): CD-01 (the "Section 1.6" reference remains **unresolved**; only a provisional navigation highlight exists), CD-02 (two conflicting consultation statements; the app follows the residual-risk one), CD-04 and CD-11 (Q6 and Q5 readings), CD-05 (jurisdiction-specific citations), CD-07 (computer-activity monitoring scope), CD-27 (controller type and joint-controller question retired from the screen). The Q7 hint list is illustrative only. Also noted for confirmation: the Stage 4 decision that a rejected decision finalises the version (it stays recorded and visible, never "approved").

## 6. Railway: existing setup, public URL and the next task

- **Public URL:** `https://privacy-assessment-guide-production.up.railway.app`
- **Existing setup (do not duplicate):** Railway project `chic-reverence`, environment `production`, GitHub-backed app service `privacy-assessment-guide` (branch `main`, auto-deploys), PostgreSQL service `Postgres`. `DATABASE_URL` is configured as a reference and **has been verified working** (`/api/health` returned `{"app":"ok","database":"ok"}`; with the commit id from `40d141a` onward). The demo users were seeded (six fictional users, six departments; one-time `RUN_SEED_USERS`, since removed). No scenario assessments are seeded yet (Stage 5). The only assessment is the test draft named above.
- **Stage 3** was verified on Railway in a browser (results in `docs/verification.md`). **Stage 4 has not been deployed-checked.** The owner reported earlier deployments succeeding; whether `5031588` has deployed and its migration applied has **not** been confirmed.
- **Demo identities:** Alex Rowan and Priya Nandi (process owners), Sam Okafor (IT security contributor), Dana Whitfield and Tomas Reyes (DPOs), Morgan Hale (demo administrator). Enter via `/enter`.
- **Next task: verify Stage 4 on Railway.** Suggested order: (1) open `/api/health` and confirm the deployed `commit` and database `ok`; if it is not `5031588`, ask the owner to check the latest deployment's status and log in the Railway dashboard (one step at a time, never ask for credentials); (2) confirm the existing test assessment still opens and its answers are intact; (3) as Alex create a **new fictional test assessment** and run the cycle in section 4 item 6, keeping test data clearly named and fictional; (4) record results in `docs/verification.md` as a separate "Stage 4 verification on Railway" table; (5) fix functional failures, run checks, push, and stop before Stage 5.
- Use the built-in browser (`mcp__Claude_Browser__*`). Lessons from Stage 3: wait for the page to finish loading before scripted clicks (an early click before hydration is lost); read stored values from the server-rendered page data after a full reload when the UI does not show them; set React inputs via the native value setter plus an `input` event.
- Test data created during verification is not deletable until the owner uses "Delete draft" (only for never-submitted drafts) or archives it; do not wipe the database.

## 7. Paused UI work and the later footer / PR exercise

- **Paused.** UI refinement is paused by the owner. Ideas are in `docs/backlog.md` (compact-typography visual check, "Coming in Stage N" wording, collapsed "About this section", extending the compact record layout, in-place reordering, Q7 hint list, clipped Q5 result column, per-field comment links, notifications, version comparison, progress shown in the register, shared governance fetch). Do not implement them without a new instruction.
- **Footer / PR exercise.** The coursework later requires a manually controlled feature branch and pull request, including a footer change. **Do not create that footer change or perform the PR exercise unless the owner explicitly asks.** The active branch is `main`; check it before any commit.

## 8. What remains after Stage 4 verification

- **Stage 5 (not authorised yet):** in-app notifications (assignment, comment/reply, changes requested, DPO review complete, overdue, review due; idempotent with unique keys; no email; DPO-reassignment notification), reports (on-screen summary, print/PDF, JSON export, version-consistent, "DRAFT" marking, optional review comments), three seeded scenarios and the demo guide page, safe demo reset for the administrator (known seeded records only), the AI Improve Wording demonstration (isolated, predefined, never touching real answers), glossary, responsive and accessibility refinement.
- **Stage 6:** Railway acceptance: cross-device persistence, full cycle, earlier versions intact, data survives redeployment, reports complete and unclipped, desktop and mobile usability, AI demo cannot overwrite answers, DB-level reset safety (needs an isolated environment, ask first).
- **Known limitations today:** no notifications, reports, export, seeded scenarios, demo guide, glossary or wording demo; demo identity is not authentication; the Q7 suggestion is a short illustrative list; every Railway/browser result for Stage 4 is still unverified.
