# Deploy on Cloudflare Workers + Supabase (step by step)

Architecture: the app runs as a **Cloudflare Worker** (via the OpenNext adapter), data lives in **Supabase PostgreSQL**, uploaded documents live in **Cloudflare R2**.

**Status of this route:** the Worker bundle builds (1.6 MB gzipped) and was run in Cloudflare's local runtime (`wrangler dev`) against a real PostgreSQL 16 server with local R2: the 68-page role sweep and all 35 interactive journeys pass. It has **not** been deployed to a real Cloudflare account or connected to a real Supabase project by me, so treat your first deploy as a rehearsal.

## 0. What you need
* Cloudflare account on the **Workers Paid plan (about US$5/month)**. The free plan allows only 10 ms CPU per request and a password check takes about 45 ms, so sign-in would fail on free.
* **R2 enabled** in the Cloudflare dashboard (R2 → Get started; it asks for a payment card, the free allowance is 10 GB).
* A Supabase project. Node 22+ and Git on your computer.

## 1. Supabase connection strings
In Supabase: **Project → Connect**. You need two strings (replace `[PASSWORD]` with your database password; if it has special characters, URL-encode them):

| Use | Which string | Looks like |
|---|---|---|
| The deployed Worker | **Transaction pooler** (port 6543) | `postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres` |
| Migrations and setup from your computer | **Session pooler** (port 5432; works over IPv4) | `postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres` |

(The "Direct connection" string is IPv6-only on Supabase's free tier, so use the poolers.)

## 2. Get the code and create the tables
```bash
git clone https://github.com/workmeridiangray-ops/15_college_university_erp_saas_full_scope-1-.docx campus-erp
cd campus-erp && npm ci
export DATABASE_URL='<SESSION pooler string>'
npm run db:migrate                      # creates all tables and the three plans
BOOTSTRAP_ADMIN_EMAIL=you@example.com BOOTSTRAP_ADMIN_PASSWORD='a-long-passphrase' npm run db:bootstrap   # your super-admin login
```
Do **not** run `db:seed-demo` against your live database unless you want a flagged demo institution in it.

## 3. Cloudflare setup (one time)
```bash
npx wrangler login
npx wrangler r2 bucket create campus-erp-uploads
```
Edit `wrangler.jsonc`: set `APP_URL` to the address people will use (you will see the `*.workers.dev` address after the first deploy; edit and deploy again, or use your custom domain). Then add the secrets (each command prompts for the value):
```bash
npx wrangler secret put DATABASE_URL     # paste the TRANSACTION pooler string (port 6543)
# optional:
npx wrangler secret put SMTP_URL
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
```

## 4. Deploy
```bash
npm run cf:deploy
```
Wrangler prints the live URL. Open `<url>/api/health` — it must return `{"status":"ok"}` — then sign in at `<url>/login` with the super-admin you created and open `/super`.

## 5. Check it properly (do not skip)
1. Health check above.
2. Sign up a test institution at `/signup`, create a department/program/student, record a payment, print the receipt.
3. Upload a PDF on the public application form and open it as admissions staff (this exercises R2).
4. If using Razorpay: add the webhook `https://<url>/api/webhooks/razorpay` (events `payment.captured`, `payment.failed`) and pay a small test invoice with test keys.

## 6. Custom domain and updates
* Domain: Cloudflare dashboard → Workers → campus-erp → Settings → Domains & Routes → Add custom domain. Update `APP_URL` and redeploy.
* New version: `git pull && npm ci && DATABASE_URL=<session pooler> npm run db:migrate && npm run cf:deploy`.
* Local preview of the Worker: put `DATABASE_URL=...` in a `.dev.vars` file (git-ignored), then `npm run cf:preview`.

## 7. Backups
Supabase: enable daily backups (paid plans) or run `pg_dump` against the session pooler string on a schedule. R2: documents are in the `campus-erp-uploads` bucket; copy it periodically (`rclone` with R2's S3 endpoint) — R2 has no automatic backup. See `docs/DEPLOYMENT.md` §7–8 for the dump/restore commands.

## 8. Known limits of this route
* Not run on a real Cloudflare account or a real Supabase project (see status above).
* In the local Workers runtime about 1 page load in 25 logs a React hydration console error that the page recovers from; it never occurred on the Node server. Not yet checked on the real Cloudflare network.
* The page-transition skeleton (`loading.tsx`) was removed: with it, Workers streaming broke hydration on most pages.
* Database connections are opened per query (the Workers model); Supabase's transaction pooler absorbs this. TLS to the database is encrypted but the server certificate is not verified.
* Email through `SMTP_URL` and live Razorpay calls from inside a Worker are untested. If SMTP fails, administrators still get one-time links on screen; for email on Workers, a HTTP email API is the safer choice and would be a small change.
* Cloudflare's per-request CPU limit and Supabase connection limits were not load-tested.
