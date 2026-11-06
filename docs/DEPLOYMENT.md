# Deployment, operations, backup and restore

Campus ERP is a Next.js 15 app (Node 22+) backed by PostgreSQL 14+. Nothing in this guide has been executed against a hosted environment by the author; the commands were exercised locally (embedded database) and the Docker files have not been built in this workspace. Treat the first deployment as a rehearsal.

## 1. What you need
| Item | Notes |
|---|---|
| PostgreSQL 14+ | Managed (RDS, Cloud SQL, Neon, Supabase…) or self-hosted. TLS recommended. |
| Node 22+ host or container | Any VM, PaaS or Kubernetes. One instance is fine; more are supported because state is in PostgreSQL. |
| Persistent disk for uploads | `UPLOAD_DIR`. Not shared between instances unless on a shared volume — use a single instance or a shared volume (NFS/EFS). |
| HTTPS in front | A reverse proxy or platform TLS. Set `APP_URL` to the public https URL. |
| SMTP (optional) | Without it, administrators see one-time links on screen instead of receiving email. |
| Razorpay account (optional) | Test keys first. |

## 2. Configure
Copy `.env.example` to `.env` (or set the same variables in your platform). Never commit `.env`. Required: `DATABASE_URL`, `APP_URL`, `UPLOAD_DIR`. See the file for the rest.

## 3. Build and run

### Option A — Docker
```bash
cp .env.example .env            # fill in values; add POSTGRES_PASSWORD for compose
docker compose up --build       # db + app; migrations run at start
```

### Option B — plain Node
```bash
npm ci
npm run build
npm run db:migrate              # idempotent; run on every release
NODE_ENV=production npx next start -p 3000
```
Run it under a process manager (systemd, pm2) with `Restart=always`.

### Create the first super admin (once)
Easiest, no terminal: set `SETUP_TOKEN` (16+ characters) in the environment, open `/setup` in a browser, fill in the form, then remove `SETUP_TOKEN`. Or use the command below.

```bash
BOOTSTRAP_ADMIN_EMAIL=you@example.com BOOTSTRAP_ADMIN_PASSWORD='a-long-passphrase' npm run db:bootstrap
```
Sign in at `/login`; you land on `/super`. Change the password afterwards from the Account menu.

### Demo data (optional, never on a production tenant database you care about)
`npm run db:seed-demo` creates one institution flagged **DEMO DATA** (slug `demo-institute`) with sample users (password `Demo@12345678`). Under `NODE_ENV=production` it refuses unless `ALLOW_DEMO_SEED=1`. Delete or suspend that institution from `/super` before real use, and never keep the demo password on an internet-facing system.

## 4. Reverse proxy checklist
* Forward `Host` and `X-Forwarded-Proto`/`X-Forwarded-For` headers unchanged.
* Serve over HTTPS: in production the session cookie is `Secure`, so browsers drop it on plain `http://` (except `localhost`).
* Terminate TLS; add `Strict-Transport-Security` at the proxy.
* Allow request bodies of at least 6 MB (uploads are capped at 5 MB by the app).
* If you serve the app on a different public host than the one it sees, Next.js server actions compare `Origin` with `Host`; make sure the proxy preserves `Host` (or add the public host to `experimental.serverActions.allowedOrigins` in `next.config.mjs`).

## 5. Health and logging
* `GET /api/health` → `200 {"status":"ok"}` when the database answers, `503` otherwise. Use it for load balancer and container health checks.
* Logs are single-line JSON on stdout/stderr (`level`, `msg`, fields). Unexpected errors show the user a short reference code that is also in the log line. Ship stdout to your log platform.
* Every write that matters is also recorded in the audit log (`/app/audit` per institution, `/super/audit` for the platform).

## 6. Payments (Razorpay)
1. Put **test** `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in the environment.
2. In the Razorpay dashboard add a webhook to `APP_URL/api/webhooks/razorpay`, subscribe to `payment.captured` and `payment.failed` (other events are acknowledged and ignored), and set the same secret as `RAZORPAY_WEBHOOK_SECRET`.
3. Pay a small invoice as a student/parent from the portal (card/UPI test credentials from Razorpay's docs). Confirm the invoice becomes paid and a receipt exists. Replays of the same webhook are ignored.
4. Switch to live keys only after this works.
Offline payments (cash/cheque/bank) are recorded by accountants and need no provider.

## 7. Backups
Two things hold state: the **database** and **UPLOAD_DIR**. Back up both on the same schedule so references stay consistent.

```bash
# Nightly (cron): logical backup, compressed, timestamped
pg_dump --format=custom --no-owner "$DATABASE_URL" -f "campus_erp_$(date +%F).dump"
tar czf "uploads_$(date +%F).tgz" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
```
Keep at least 14 daily and 6 monthly copies off the host. Managed databases also offer point-in-time recovery — enable it.

## 8. Restore (rehearse this quarterly)
```bash
createdb campus_erp_restore
pg_restore --no-owner --dbname campus_erp_restore campus_erp_YYYY-MM-DD.dump
tar xzf uploads_YYYY-MM-DD.tgz -C /var/data
# Point DATABASE_URL at campus_erp_restore, start the app, then verify:
curl -fsS localhost:3000/api/health
# Sign in as a known user, open a student profile, download an uploaded document.
```
Run `npm run db:migrate` after restoring an older dump so the schema matches the running code.

## 9. Upgrades
1. Take a backup. 2. Deploy new code. 3. `npm run db:migrate`. 4. Check `/api/health`. Migrations are forward-only SQL files in `migrations/`, applied once each and recorded in `schema_migrations`.

## 10. Security notes
* Passwords are hashed with scrypt; session tokens are stored only as SHA-256 hashes; the cookie is `httpOnly`, `SameSite=Lax`, and `Secure` in production.
* Accounts lock for 15 minutes after 5 failed sign-ins; sign-in attempts are also throttled (20 attempts per 15 minutes per key).
* Every institution-scoped query filters by `institution_id`, and every foreign id supplied by a user is checked to belong to the same institution before use.
* Uploads: 5 MB maximum, PDF/PNG/JPG only (verified by content, not file name), stored under random names inside a per-institution folder and served only through an authenticated route.
* Rotate `RAZORPAY_*` secrets and SMTP credentials through your platform's secret store. No secret is stored in the repository.
