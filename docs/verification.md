# Verification checklist

Legend: **Implemented** = code exists. **Local** = verified by automated checks that were actually run on a developer machine, without a database or server. **Railway** = verified on the deployed app. **Not verified** = no evidence yet.

Last updated: after the navigation-panel change. Railway results below are **limited manual checks reported by the project owner**, not full acceptance.

## Limited manual verification on Railway (reported by the project owner)

| Check | Result | Scope |
|---|---|---|
| `/api/health` | `{"app":"ok","database":"ok"}` | Confirms the app runs and the database is reachable and migrated. Not application acceptance. |
| Create an assessment, save a form answer, reload the page | The saved answer was still present | One owner session. Cross-device/second-session access, other roles, conflicts, repeatable records and the register filters were **not** checked. |

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
| Health endpoint `/api/health` | Yes | Built | Limited manual check: ok/ok | See the manual verification table |
| Progressive disclosure in the form (guidance, examples, original wording and answer options behind labelled controls; no routine per-field Saved/last-edited text; one save indicator in the header; no Owner item in the questionnaire) | Yes | Render tests (92 tests total), build | Not verified | Not seen in a browser. Editor names and timestamps are still stored and loaded, just not shown. Owner is mapped to `A.owner` in the inventory and will be exported from the owner relationship (Stage 5) |
| Collapsible navigation panel (preference kept in the browser, not assessment data) | Yes | Toggle label/ARIA test; build | Not verified | Default open on desktop, collapsed on mobile; not seen in a browser by me |

## Not built yet (clearly shown as pending in the UI)

- **Stage 3:** suggested screening answers, automatic DPIA/TIA outcomes, guided risk register UX (example picker, plotted matrix), open-question summaries.
- **Stage 4:** assignments UI, comments, submission snapshots, DPO review and opinions, owner decision and conditions, revisions, archive/delete, ownership transfer, event history, review-date logging.
- **Stage 5:** notifications, reports and JSON export, seeded scenarios, demo guide, wording demonstration, glossary, admin reset, accessibility pass.
- **Stage 6:** Railway deployment and acceptance testing.

## Known limitations of Stage 2

- Every screening and full-assessment stage is open for completion. Gating of D–K by the screening decision arrives with Stages 3–4.
- Contributors cannot be created in the UI yet (assignments arrive in Stage 4); their rights are enforced and tested but cannot be exercised end to end.
- Moving a record up or down reloads the page.
- The demo cookie is unsigned by design (not authentication).
