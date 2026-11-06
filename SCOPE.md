# Campus ERP — Scope & Delivery Checklist

Multi-institution (multi-tenant) College/University ERP SaaS. Every record belongs to one institution (`institution_id`); every query is tenant-scoped on the server.

Status key: `[x]` built and verified by an automated test or a real-browser journey (evidence in `docs/VERIFICATION.md`) · `[~]` built and verified in part — the limit is stated on the line.

## Roles
| Role | Who | Portal |
|---|---|---|
| super_admin | Platform operator | /super |
| institution_admin | Principal / registrar | /app |
| admissions_officer | Admissions staff | /app/admissions |
| accountant | Fees and finance | /app/fees |
| hod | Head of department | /app |
| faculty | Teaching staff | /app |
| librarian | Library staff | /app/library |
| hr_manager | HR and payroll | /app/hr |
| student | Enrolled student | /portal |
| parent | Guardian of a student | /portal |
| applicant | Prospective student | /apply |

## Modules
### A. Public & Platform
- [x] A1 Marketing page, pricing page, institution sign-up (self-serve onboarding)
- [~] A2 Plans and subscription states, seat limits enforced server-side (state is set by the operator; no automated subscription billing)
- [x] A3 Super admin: institutions list, suspend/reactivate, plan change, platform audit log, support tickets
- [x] A4 Support: in-app ticket create/reply, super admin response
- [x] A5 Health endpoint, structured logging

### B. Authentication & Security
- [x] B1 Email + password login, scrypt hashing, secure httpOnly session cookie
- [x] B2 Forgot / reset password (single-use expiring token)
- [x] B3 Login rate limiting and lockout
- [x] B4 Session expiry with clear expired-session screen
- [x] B5 Role permissions matrix enforced in server code
- [x] B6 Audit trail for every write
- [~] B7 CSRF protection (same-origin check on mutating API routes; server actions use Next.js's built-in origin check) — implemented, no dedicated automated test

### C. Institution Setup
- [~] C1 Institution profile (name, contact email, address) — page renders for the admin and the save action is wired; no dedicated test. There is no separate academic-year object
- [x] C2 Departments, programs, courses, sections/batches
- [x] C3 User and role management (invite, deactivate)

### D. Admissions
- [x] D1 Public application form with document upload
- [x] D2 Applicant status tracking page
- [x] D3 Review, shortlist, accept, reject; accepting creates a student record + login

### E. Students
- [x] E1 Student records, guardians, enrolment per program/section
- [x] E2 Student search/filter, profile, documents

### F. Academics
- [x] F1 Timetable with clash detection (faculty and room)
- [x] F2 Attendance marking by faculty, percentage reports, low-attendance flags
- [x] F3 Assignments and submissions
- [x] F4 Exams, marks entry, grade calculation, result publishing, transcript
- [x] F5 Announcements / notifications

### G. Fees & Finance
- [x] G1 Fee structures, invoice generation per student
- [~] G2 Payments: offline recording verified end-to-end in the browser; online order + webhook verified with a locally signed test secret only (never run against Razorpay's servers)
- [x] G3 Receipts, dues report, concessions
- [x] G4 CSV exports

### H. Library
- [x] H1 Catalogue, issue, return, fines, overdue list

### I. HR & Payroll
- [x] I1 Staff records, leave requests and approvals
- [~] I2 Monthly payroll run and payslips (arithmetic tested; no PF/ESI/TDS statutory deductions)

### J. Portals
- [x] J1 Student portal: timetable, attendance, marks, fees, library, assignments
- [x] J2 Parent portal: linked children only

### K. Operations
- [~] K1 Migrations, env example, deploy guide, backup/restore guide, admin guide (written; Docker files and backup/restore commands not executed here)
- [x] K2 Demo data clearly separated from production (explicit command, flagged institution)
- [x] K3 Tests: tenant isolation, permissions, calculations, concurrency/idempotency
- [x] K4 Build, typecheck, lint pass
