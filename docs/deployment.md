# Deployment runbook (Railway)

Status: **written in Stage 2; not yet verified on Railway.** Nothing here has been run against a live database. Do not treat the app as deployed until the checks at the end pass.

Existing setup (do not duplicate): Railway project `chic-reverence`, environment `production`, GitHub-backed app service `privacy-assessment-guide` (branch `main`), PostgreSQL service `Postgres`. The app service has a `DATABASE_URL` variable whose value and connectivity are **unverified**.

## How the app starts

`npm start` runs `scripts/start.mjs`, which:

1. Skips migrations with a warning if `DATABASE_URL` is missing (the app still starts and shows a configuration message).
2. Runs `prisma migrate deploy` (versioned migrations in `prisma/migrations`). Output is scrubbed so connection strings are never printed. If migration fails, the app still starts so the problem is visible in the browser and the deploy logs.
3. Only if `RUN_SEED_USERS=true`: runs `prisma/seed.mjs` once.
4. Starts Next.js on `0.0.0.0:$PORT`.

The build (`npm run build`) runs `prisma generate` and `next build`. It does **not** connect to a database.

## One-time dashboard checks (you perform these; never share credentials)

1. **Branch connection.** Open service `privacy-assessment-guide` → Settings → Source. Confirm the repository `enelpitk/privacy-assessment-guide` and branch `main`.
2. **DATABASE_URL reference.** Service → Variables. `DATABASE_URL` should be a *reference* to the `Postgres` service’s connection variable (Add Reference → Postgres → `DATABASE_URL`), not a pasted value. Do not copy the value anywhere.
3. **Redeploy** the service after the latest commit builds. Previous failures were because the repository had no application yet.
4. **Public domain.** Service → Settings → Networking → Generate Domain. Send me the URL only.

## Stage 4 migration

The second migration (`20261108000000_stage4_governance`) is additive: new tables, one new enum value and database triggers that make submitted snapshots, DPO opinions and owner decisions immutable. It is applied automatically by `prisma migrate deploy` at startup. It does not touch existing rows, so existing assessments and the test data are kept. There is no reseed. If it fails, `/api/health` reports `not-migrated` and the deploy logs show why (connection strings are hidden).

## Adding the demo users (explicit, one time)

There is no shell in the dashboard, so the seed is run by the start script when you ask for it:

1. Service → Variables → add `RUN_SEED_USERS` = `true`. The service redeploys.
2. After the deploy shows the log line `Seed complete: 6 departments and 6 fictional demo users`, **delete the variable** (it redeploys again without seeding).

The seed only upserts rows that carry a seed key. It never deletes anything and does not touch assessments. Scenario assessments and the reset tool arrive in a later stage.

## Verifying (do not claim success before these)

- Open `<your-url>/api/health`. Expected: `{"app":"ok","database":"ok"}`. Other values: `not-configured` (no `DATABASE_URL`), `unreachable` (cannot connect), `not-migrated` (tables missing; check deploy logs).
- Open `<your-url>/enter`. After seeding, six demo identities are listed.
- Enter as a process owner, create an assessment, type an answer, reload the page: the answer must still be there. Open the same assessment in a private window under the same owner identity: it must show the same answer.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Build failed, no `package.json` | An old commit; redeploy the latest `main`. |
| `/api/health` says `not-configured` | `DATABASE_URL` missing on the app service. Add the reference. |
| `unreachable` | Postgres service offline, or wrong reference. |
| `not-migrated` | Migration failed at start; read the deploy logs (connection strings are hidden). |
| `/enter` says no demo users | The seed step has not been run (see above). |

## Local checks (no database, no server)

```
npm test          # pure domain tests, inventory coverage, render smoke tests
npm run typecheck
npm run build     # prisma generate + next build, no database connection
```
