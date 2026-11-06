# Campus ERP — multi-institution College/University ERP (SaaS)

One deployment serves many institutions. Each institution gets its own staff, students, parents and applicants; data is isolated per institution on the server.

**Stack:** Next.js 15 (App Router, server actions) · React 19 · TypeScript (strict) · Tailwind · PostgreSQL (embedded PGlite for local development and tests).

## What's inside
Public site (home, pricing, sign-up, sign-in, forgot/reset password, public application form, application tracking) · institution workspace (academics, admissions, students & guardians, timetable with clash detection, attendance, assignments, exams/marks/grades/GPA, fees & receipts with offline and Razorpay online payments, library, HR leave & payroll, announcements, reports with CSV export, audit log, settings, support tickets) · student and parent portals · platform console for the operator (institutions, plans, status, platform audit, support inbox).
Full checklist with verification status: [SCOPE.md](SCOPE.md). Evidence: [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Run it locally in two minutes
```bash
npm ci
npm run db:migrate          # creates ./.data/pglite (embedded Postgres)
npm run db:seed-demo        # optional: flagged demo institution, password Demo@12345678
npm run dev                 # http://localhost:3000
```
Demo sign-ins (after seeding): `admin@demo.campus.test`, `sunita.rao@demo.campus.test` (accountant), `dr.meera.iyer@demo.campus.test` (faculty), `vikram.singh@demo.campus.test` (admissions), `aarav.sharma@demo.campus.test` (student), `parent.sharma@demo.campus.test` (parent), `platform@demo.campus.test` (super admin).

## Quality gates
```bash
npm run typecheck && npm run lint && npm test          # 48 unit/integration tests (embedded DB)
TEST_DATABASE_URL=postgres://user@host:5432/scratch_db npm run test:pg   # same 48 tests on a real PostgreSQL (wipes that database's public schema!)
npm run build && ALLOW_EMBEDDED_DB=1 npx next start -p 3100 &   # then, in another shell:
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/e2e/smoke.mjs     # every role opens every page
tests/e2e/run-flows.sh                                                  # interactive journeys
```
(`BASE_URL` overrides the target for the browser scripts; they log in with the demo accounts, so seed first.)

## Deploying
* **Cloudflare Workers + Supabase + R2:** [docs/CLOUDFLARE_DEPLOY.md](docs/CLOUDFLARE_DEPLOY.md) — step by step.
* Any Node host or Docker with PostgreSQL: See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (environment, Docker, reverse proxy, health check, payments, backup/restore, upgrades) and [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) (roles, set-up, day-to-day use).

## Layout
`src/app` pages and API routes · `src/services` business rules (all authorisation and tenant checks live here) · `src/actions` server actions · `src/lib` db, auth, permissions, files, CSV, audit, logging · `migrations` versioned SQL · `scripts` migrate / seed / bootstrap · `tests` vitest + Playwright.

## Known limitations
See the last section of [docs/VERIFICATION.md](docs/VERIFICATION.md).
