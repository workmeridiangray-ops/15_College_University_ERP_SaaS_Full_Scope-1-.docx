# Verification record

Everything below was run in the build workspace against a production build (`next build`, served with `next start`) using the embedded PostgreSQL-compatible database (PGlite). It was **not** run against a managed PostgreSQL server, a real SMTP server, Razorpay's servers, or any hosted environment.

## Commands and results (final run)
| Check | Result |
|---|---|
| `npm run typecheck` (TypeScript strict) | clean |
| `npm run lint` | no warnings or errors |
| `npm test` (vitest, 4 files) | **48 / 48 passed** |
| `npm run build` | compiled successfully |
| `tests/e2e/smoke.mjs` — real Chromium signs in through the login form as 9 roles and opens every page for each | **68 pages, 0 problems** |
| `tests/e2e/run-flows.sh` — interactive journeys (A–G below), each section in a fresh browser | **35 / 35 checks passed** (A 16, B 5, C 2, D 7, E 2, F 2, G 1) |

## Journeys driven through the real UI (`tests/e2e/flows.mjs`)
* **A — Onboarding to money.** Self-serve sign-up; create department → program → section; create a student and receive a one-time activation link; the student activates in a separate browser, signs in and lands in the portal; the link cannot be reused; fee structure → invoice generation; overpayment is rejected with a clear message; a double-clicked "Record" produces exactly one payment; receipt page shows institution, student and amount; invoice becomes partial with the correct balance; the student sees the same balance and receipt; another institution's student page and document id return not-found; CSV export contains only own students; an institution admin cannot open the platform console.
* **B — Sign-in security.** Wrong password and unknown email give the same message; correct login works; a missing/expired session redirects to sign-in with an explanation; five wrong passwords lock the account even for the right password afterwards.
* **C — Faculty.** Load a class roster, mark a student absent, save; faculty are redirected away from Fees.
* **D — Admissions.** Public application → tracking code → applicant checks status → a file disguised as a PDF is rejected, a real PDF is accepted → admissions officer reviews, shortlists, accepts and receives an activation link → the applicant is now a student → the applicant's tracking page shows the admitted status.
* **E — Parent isolation.** A parent cannot switch to a child who isn't theirs and cannot open staff pages.
* **F — Phone layout.** 21 staff pages at 375 px wide produce no horizontal page scroll; the mobile menu opens.
* **G — Unsaved work.** Leaving a half-filled form raises the browser's confirmation.

## Defects found by these runs and fixed
Success messages were never shown on action buttons · the one-time activation link was not shown after accepting an applicant · applicant documents could not be opened from the Admissions screen · Academics overflowed horizontally on phones · duplicate form-field ids when several forms shared a page · the HR dashboard crashed (HR role lacked student read access) · a failed-login update would have errored on PostgreSQL and prevented lockout · saves left stale data on screen (pages now reload with a banner carrying the success message) · "Record payment"/"Concession" panels collapsed after saving (now controlled panels).

## Scope status
See [SCOPE.md](../SCOPE.md): 35 items verified, 5 partly verified with the limit written on the line.

## Known limitations (precise)
1. **Not deployed.** No deployment target or credentials were provided, so there is no live URL and nothing here claims the app is published.
2. **Razorpay** order creation and webhook handling are covered by tests using a locally generated test secret (valid signature settles once, replays ignored, forged signature and amount mismatch rejected). They were never exercised against Razorpay itself.
3. **Email** (SMTP) was never exercised. Without `SMTP_URL`, administrators see one-time links on screen.
4. **PostgreSQL**: automated tests and browser runs use embedded PGlite. The same SQL is used for the `pg` driver, and a type-inference bug that would only have failed on real PostgreSQL was found and fixed, but a run against a real server has not been done.
5. **Payroll** has no statutory deductions (PF, ESI, TDS, professional tax).
6. **Subscriptions**: plan and status are set by the platform operator; there is no automated recurring billing of institutions.
7. **Docker files, backup and restore commands** are written but were not executed here.
8. **Pages reload after each save** (by design, to keep every figure current); long forms lose scroll position of inner panels, not data.
9. Not covered by an automated test: CSRF origin check on API routes, institution-profile save, notification read-state, and the printed-receipt layout beyond its content.
10. No load/performance testing and no third-party penetration test.
