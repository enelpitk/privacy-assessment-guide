# Verification checklist

Legend: **Implemented** = code exists. **Local** = verified by automated checks that were actually run on a developer machine, without a database or server. **Railway** = verified on the deployed app. **Not verified** = no evidence yet.

Last updated: after the navigation-panel change. Railway results below are **limited manual checks reported by the project owner**, not full acceptance.

## Limited manual verification on Railway (reported by the project owner)

| Check | Result | Scope |
|---|---|---|
| `/api/health` | `{"app":"ok","database":"ok"}` | Confirms the app runs and the database is reachable and migrated. Not application acceptance. |
| Create an assessment, save a form answer, reload the page | The saved answer was still present | One owner session. Cross-device/second-session access, other roles, conflicts, repeatable records and the register filters were **not** checked. |

## Stage 3 verification on Railway (built-in browser, performed 2026-11-07)

Test data: one fictional draft assessment, "TEST Stage 3 verification (fictional)", created as Alex Rowan (owner). It was never submitted. It is still in the database because deleting drafts is a later-stage feature.

Method: driven in the built-in browser against `https://privacy-assessment-guide-production.up.railway.app`. Several clicks and text entries were made with small page scripts (DOM events), not by hand; results were read back from the rendered page and, where noted, from the server-rendered page data after a full reload. Item 1–6 ran on the Stage 3 deployment before the health endpoint showed a commit id, so its exact commit was not displayed then; the Q7 repair was verified on commit `40d141a`, which `/api/health` reported.

| # | Check | Result |
|---|---|---|
| 1 | Screening answers and recorded suggestions survive reload | **Passed.** Counts (20 000 total, 100 special category) persisted; question 1 showed "Suggested answer: No" with its reasoning; "Use this suggestion" confirmed it; after a full reload the answer and "You have confirmed this suggestion" were present, and the server page data held `C.q1.suggested` = `{"rules":"rules-1.0.0","suggested":"NO","confirmed":"NO"}` (revision 1, edited by Alex Rowan) |
| 2 | Q5 threshold with a relevant sub-population | **Passed.** 5.1 risk Yes with 9,999 individuals: sub-result **No** although the overall total was 20,000. Changed to 10,000 (inclusive): sub-result **Yes**, Q5 suggestion Yes. 10,000 persisted across reload |
| 3 | Q7 Yes alone gives TIA follow-up | **Passed.** With Q1–Q6 confirmed No and Q7 Yes: "TIA follow-up indicated"; Full DPIA section read "No screening indication from the template rules — every question is answered and none is Yes"; unresolved list empty |
| 4 | Unresolved answers stay visible and do not cancel a positive | **Passed.** Q5 confirmed Yes plus Q3 "Not sure" and Q2/Q4/Q6/Q7 unanswered: "Full DPIA indicated — awaiting DPO review"; unresolved list named each question and its reason; TIA not indicated |
| 5 | Risk scores | **Passed.** Probability 3 × impact 4 showed **12 HIGH**; current residual showed "Not assessed" until scored and target showed "Not set"; after setting residual 2 × 3 and target 1 × 2 the register showed 12 HIGH / 6 MEDIUM / 2 LOW as three separate values, and they persisted across reload |
| 6 | Matrix matches saved scores | **Passed.** After reload the labelled matrix placed R1 at impact 4 / probability 3 (12 HIGH) in Inherent mode, impact 3 / probability 2 (6 MEDIUM) in Current residual mode, and impact 2 / probability 1 (2 LOW) in Target mode |
| – | Override handling | Observed: confirming No against a Yes suggestion showed "differs from the suggestion… explain why in the rationale" |
| – | Overview "Open questions" | Rendered and consistent with the answers |
| – | Q7 repair (commit `40d141a`) | **Passed.** No recipients: "cannot be worked out yet"; "No data is shared" and "No processors" both saved and ticked: still unresolved (previously No); "Tallinn, Estonia": unresolved with "could not be judged automatically… does not mean they are inside the EU/EEA"; "Mumbai, India": Yes suggestion with "check each one". The confirmed answer is only ever the user's |

Q7 review finding (fixed in `40d141a`): the suggestion could say **No** when no sharing and no processors were recorded, and its unresolved wording could read as reassurance. It can now only suggest Yes (for a few recognised non-EU/EEA places) or stay unresolved, and it always reminds that question 7 also covers support teams, group companies, cloud providers and sub-processors. Unit tests cover unrecognised, ambiguous and EU-sounding locations.

Observed, not fixed (design, recorded in `docs/backlog.md`): the Q5 sub-question table's Result column is clipped at about 1000 px width with the navigation open.

Not checked in this session: a second browser or device, other demo roles, mobile layout, visual polish, accessibility, concurrency conflicts and the example-risk starting points.

Everything in the table below is still unverified on Railway unless stated here.

| Area | Implemented | Local (ran) | Railway | Notes |
|---|---|---|---|---|
| Next.js / TypeScript / Tailwind foundation | Yes | `npm run typecheck`, `npm run build` | Not verified | Build ran with no `DATABASE_URL` set |
| Prisma schema + versioned migration (`20261107000000_init`) | Yes | Client generates; SQL generated from the schema | **Not verified** | The migration SQL has never been applied to a real PostgreSQL |
| Start script (migrate → optional seed → `next start` on `$PORT`) | Yes | Not run | Not verified | Written, not executed |
| Seed of fictional users/departments (explicit, idempotent) | Yes | Not run | Not verified | Needs a database |
| Demo identity selection (cookie, not authentication) | Yes | Route code type-checked | Not verified | |
| Server-side permissions (visibility, edit scope, locks, owner≠DPO) | Yes | Pure matrix tests; server save path tested against an in-memory fake | Not verified | No test has hit a real database or real HTTP route |
| Assessment register (search, filters, views, table + cards) | Yes | Type-checked and built only | Not verified | No automated test exercises the query logic against Postgres |
| All source sections, questions, choices, repeatable records (A–K) | Yes | Inventory coverage test (291 IDs); render smoke test of all 38 subsections | Not verified | Not seen in a real browser |
| Source-inventory ↔ definition coverage (automated) | Yes | Passes | n/a | Does not prove wording fidelity; see `source-coverage-review.md` |
| Server-backed autosave with accurate states | Yes | Store tests with mocked network (success, failure, retry, stale response) | Not verified | |
| Optimistic concurrency + conflict resolution | Yes | Decision logic, store behaviour, server save (fake DB) | **Not verified** | Atomicity relies on a conditional `UPDATE ... WHERE revision = n` / `INSERT ... ON CONFLICT DO NOTHING` that has not run on PostgreSQL |
| Conditional answer preservation / applicable completeness | Yes | Domain tests | Not verified | |
| CD-24 inverted Yes (necessity question 2) | Yes | Definition + interpretation tests, render test | Not verified | Value stored as chosen; not reversed |
| Shared entities (create, rename, guarded delete) | Yes | Permission tests only | Not verified | Rename/delete queries untested against a DB |
| Resume last location, navigation guard, unsaved-change warning | Yes | Store tests (flush behaviour) | Not verified | `beforeunload` and navigation prompts untested in a browser |
| Responsive layout, keyboard and screen-reader behaviour | Partly | Not tested | Not verified | Written with labels, fieldsets, focus styles; no audit done |
| Health endpoint `/api/health` (now also reports the deployed commit) | Yes | Built | Verified: `{"app":"ok","database":"ok","commit":"40d141a"}` | |
| Progressive disclosure in the form (guidance, examples, original wording and answer options behind labelled controls; no routine per-field Saved/last-edited text; one save indicator in the header; no Owner item in the questionnaire) | Yes | Render tests (92 tests total), build | Not verified | Not seen in a browser. Editor names and timestamps are still stored and loaded, just not shown. Owner is mapped to `A.owner` in the inventory and will be exported from the owner relationship (Stage 5) |
| Stage 3: explainable screening suggestions, Q5 per-sub-question logic, independent DPIA/TIA indications, unresolved list, provisional Q6 flag, suggestion snapshots | Yes | 41 screening/risk tests + render + store + server-save (fake DB) tests | Not verified | Pure rules tested thoroughly; UI never seen in a browser |
| Stage 3: guided risk register (example starting points that must be confirmed, measures, calculated inherent/current residual/target, labelled matrix, overdue labels, consultation prompt) and open-questions summary | Yes | Domain + render tests | Not verified | Overdue notifications are not built yet (labels only) |
| Stage 4: assignments and explicit sharing; comments (replies, resolve/reopen); ownership transfer and DPO reassignment with audit history; screening gate and full-review gate with atomic snapshots, locks and server-enforced permissions; DPO opinions, amendments and blocking issues; owner decisions, conditions and separate progress; reopen and renewed review; new revisions with carried-forward review; draft deletion, archive and restore; path activation without deleting answers | Yes | 46 server-flow tests against an in-memory fake database, pure workflow/permission tests, UI tests by role; type check; build | **Not verified** | The migration has not been applied to PostgreSQL; the DB-level immutability triggers, cascading deletion, the enum addition and all transaction behaviour are untested on a real database. No browser check |
| Visible numbering 1–11 / 1.1, compact typography, simplified sections 1.1, 1.2, 2.1, 2.2 (help-request control, compact grouped records, controller select) | Yes | Domain + render tests (105 tests total), type check, build | Not verified | Not seen in a browser; typography, spacing and mobile usability need a visual check |
| Collapsible navigation panel (preference kept in the browser, not assessment data) | Yes | Toggle label/ARIA test; build | Not verified | Default open on desktop, collapsed on mobile; not seen in a browser by me |

## Stage 4 verification on Railway: Test 1 (built-in browser, performed 2026-11-07, commit `f9f9384`)

Deployment evidence: `/api/health` returned `{"app":"ok","database":"ok","commit":"f9f9384"}`. The owner reported the Railway deployment ACTIVE with the log "2 migrations found in prisma/migrations" and "No pending migrations to apply" (the repository has exactly two: `init` and `stage4_governance`; this log is from the latest deployment, so it shows the Stage 4 migration was already applied earlier, not when).

Test assessment: "TEST Stage 4 verification (fictional)", DPIA-2026-0004, created for this test only. Scope: creation, visibility and the assignment boundary (CD-32). Nothing was submitted, so no snapshot exists; nothing was deleted, reset or reseeded. The Stage 3 test assessment and the other two test drafts were not touched.

Legend: **Observed** = performed and seen in the browser, with the server involved. **UI only** = the interface prevented the attempt (disabled or hidden control), so the server's refusal was **not tested**.

| # | Step | Result | Basis |
|---|---|---|---|
| 1 | Alex creates the assessment | Pass | Observed: register shows Draft, 1.0, screening not submitted. DPO choices were only Dana and Tomas. Server refusal of owner-as-DPO **not tested** (never offered). |
| 2 | Alex saves answers in 1.1 | Pass | Observed: both values present after a full reload |
| 3 | Sam cannot see or open it | Pass | Observed server behaviour: empty register and HTTP 404 on the direct URL |
| 4 | Assignee list | Pass | Observed: only Priya and Sam; non-assignable sections not offered |
| 5 | Alex assigns 2.1 to Priya | Pass | Observed: Pending, section 2.1, task text |
| 6 | Priya sees it under "Assigned to me" | Pass | Observed: one assessment listed |
| 7 | Priya edits the assigned subsection | Pass | Observed: record and text saved, present after reload |
| 8 | Priya cannot edit unassigned 1.1 | Pass, UI only | Fields disabled; values unchanged. Server refusal **not tested** |
| 9 | Priya sees no assign, share, transfer, submit or decide controls | Pass, UI only | Team page shows only her own Start / Mark complete; Review page has no buttons. Server refusal **not tested** |
| 10 | Priya marks complete | Pass, UI only for the lock | Status Completed, fields disabled. Server refusal of a later edit **not tested** |
| 11 | Alex reopens | Pass | Observed: Pending, Priya's fields enabled again (no further save made) |
| 12 | Dana comments | Pass; edit denial UI only | Comment posted and labelled "DPO review comment". Dana's fields disabled; server refusal **not tested** |
| 13 | History | Pass | Observed: created, sections assigned, assignment completed, assignment reopened. Comments are not in the activity history (not decided whether they should be). |

Not verified by Test 1: server-side refusals for every denied case above; submission, snapshots and the immutability triggers; the DPO review cycle; owner decisions; ownership transfer; new revisions; deletion; answer-by-answer preservation of the Stage 3 test assessment (the earlier "20 of 133 answers" was an observation, not a baseline).

Note on method: the browser blocks native confirmation dialogs; the "Mark complete" and "Reopen" confirmations were accepted by script for the approved steps only.

## Stage 4 verification on Railway: Test 2 (built-in browser, performed 2026-11-07, commit `f9f9384`)

Scope: pre-assessment-only path end to end on "TEST Stage 4 verification (fictional)" (DPIA-2026-0004), then a new revision. The fictional scenario was a staff-training attendance register (about 300 employees, no special category data, EU only); every screening answer was entered as an honest "No" with a rationale, nothing was marked "Not sure" to bypass validation. Controller: Harbour Bank. The assessment is **retained** (now submitted, so archive-only); other assessments were not touched; no reset or reseed.

| # | Step | Result | Basis |
|---|---|---|---|
| 1 | Alex submits the screening | Pass | Observed: status "Screening awaiting DPO review"; indications "no full DPIA indication; no TIA follow-up indicated"; a screening snapshot (fingerprint `34fd5b041d10`) appeared in History. **Not observed:** that sections 1 to 3 became read-only, and Priya's assignment locking. |
| 2 | Dana records "Pre-assessment sufficient" with the short opinion in one action | Pass | Observed: "Screening decided", "Path: Pre-assessment only", "DPO review complete — awaiting owner decision". **Not observed section by section:** the page states the full-assessment sections are not applicable; I did not open each one. |
| 3 | Alex records "Approved" | Pass | Observed: "Finalised" (plain, not "— Rejected"); a finalised snapshot (fingerprint `df0dc7bb9da9`); no departure acknowledgement needed. |
| 4 | Baseline of both snapshots | Recorded | Fingerprints as above; page-content hashes (SHA-256, first 16 hex characters, taken from the rendered snapshot page text without the "Saved … by" line): screening `7d9a9897c5138c61` (11 160 characters), finalised `716f923f34c14607` (5 477 characters). Opinion and owner decision text were also read. |
| 5 | Alex "Start review / update" | Pass | Observed: version 2.0 "Current Draft", reason and description recorded, category "periodic_review"; 45 sections marked "Carried forward — please review"; screening "not submitted"; answers copied (1.1 text and the Q5 sub-question results present in 2.0). |
| 6 | Compare version 1.0 after the revision | Pass (observed preservation) | After revision 2.0 existed, both snapshot pages for 1.0 showed the same fingerprints and the same page-content hashes as the baseline; version 1.0 still shows "Finalised"; the snapshot pages show "Owner recorded when this snapshot was taken: Alex Rowan. Current owner of the assessment: Alex Rowan." |

What this does and does not show: it shows **observed preservation** in the browser (the displayed fingerprints and page content of the earlier version's snapshots did not change, and no approval, opinion or screening decision was carried into 2.0's workflow state). It is **not proof of database-level immutability**: the interface offers no way to alter a snapshot, opinion or decision, so the database triggers were not exercised. Server-side refusals of denied actions remain untested.

Observations (both since corrected in code and covered by local tests, **not yet re-checked on Railway**; see the backlog):
- While the screening awaited the DPO, the Review page showed "Full DPIA indicated — awaiting DPO review" although the same page said no full DPIA was indicated. The chip text appears unconditional.
- On the version 2.0 Review page the earlier version's screening decision, DPO opinion and "Approved" owner decision are listed under the draft revision without a version label. The status above them says Draft / Screening not submitted, but a reader could take "Approved" as applying to 2.0.
- The Stage 3 test assessment was not touched.

## Stage 4 items that specifically need Railway verification

- Migration `20261108000000_stage4_governance` applies cleanly at startup on the existing database and keeps all existing assessments and answers (the test assessment included).
- The triggers reject UPDATE and DELETE on `Snapshot`, `DpoOpinion` and `OwnerDecision`.
- Atomic guarded submissions (the conditional `UPDATE ... WHERE lifecycle = ...`) under real transactions.
- Cascading deletion of a never-submitted draft (and removal of its review marks), and that a submitted assessment cannot be deleted.
- A full review cycle across two browser sessions and four identities (owner, assigned DPO, other DPO, contributor), including the admin DPO reassignment page.
- A new revision keeps the finalised version intact and copies answers, records and shared entries consistently.
- Snapshot viewer pages, the review/team/history screens, the comment threads and the carried-forward review flow in a real browser.

## Not built yet (clearly shown as pending in the UI)

- **Stage 5:** notifications, reports and JSON export, seeded scenarios, demo guide, wording demonstration, glossary, admin reset, accessibility pass.
- **Stage 6:** Railway deployment and acceptance testing.

## Known limitations of Stage 2

- Every screening and full-assessment stage is open for completion. Gating of D–K by the screening decision arrives with Stages 3–4.
- Contributors cannot be created in the UI yet (assignments arrive in Stage 4); their rights are enforced and tested but cannot be exercised end to end.
- Moving a record up or down reloads the page.
- The demo cookie is unsigned by design (not authentication).
