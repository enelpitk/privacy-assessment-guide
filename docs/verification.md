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
| Visible numbering 1–11 / 1.1, compact typography, simplified sections 1.1, 1.2, 2.1, 2.2 (help-request control, compact grouped records, controller select) | Yes | Domain + render tests (105 tests total), type check, build | Not verified | Not seen in a browser; typography, spacing and mobile usability need a visual check |
| Collapsible navigation panel (preference kept in the browser, not assessment data) | Yes | Toggle label/ARIA test; build | Not verified | Default open on desktop, collapsed on mobile; not seen in a browser by me |

## Not built yet (clearly shown as pending in the UI)

- **Stage 4:** assignments UI, comments, submission snapshots, DPO review and opinions, owner decision and conditions, revisions, archive/delete, ownership transfer, event history, review-date logging.
- **Stage 5:** notifications, reports and JSON export, seeded scenarios, demo guide, wording demonstration, glossary, admin reset, accessibility pass.
- **Stage 6:** Railway deployment and acceptance testing.

## Known limitations of Stage 2

- Every screening and full-assessment stage is open for completion. Gating of D–K by the screening decision arrives with Stages 3–4.
- Contributors cannot be created in the UI yet (assignments arrive in Stage 4); their rights are enforced and tested but cannot be exercised end to end.
- Moving a record up or down reloads the page.
- The demo cookie is unsigned by design (not authentication).
