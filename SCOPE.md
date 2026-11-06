# Campus ERP — Scope & Delivery Checklist

Multi-institution (multi-tenant) College/University ERP SaaS. Every record belongs to one institution (`institution_id`); every query is tenant-scoped on the server.

Status key: `[ ]` not started · `[~]` built, not yet verified · `[x]` built and verified by test (evidence in `docs/VERIFICATION.md`).

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
- [ ] A1 Marketing page, pricing page, institution sign-up (self-serve onboarding)
- [ ] A2 Plans and subscriptions (trial, active, past_due, cancelled), seat limits enforced server-side
- [ ] A3 Super admin: institutions list, suspend/reactivate, plan change, platform audit log, support tickets
- [ ] A4 Support: in-app ticket create/reply, super admin response
- [ ] A5 Health endpoint, structured logging

### B. Authentication & Security
- [ ] B1 Email + password login, scrypt hashing, secure httpOnly session cookie
- [ ] B2 Forgot / reset password (single-use expiring token)
- [ ] B3 Login rate limiting and lockout
- [ ] B4 Session expiry with clear expired-session screen
- [ ] B5 Role permissions matrix enforced in server code
- [ ] B6 Audit trail for every write
- [ ] B7 CSRF protection (same-origin check on mutating requests)

### C. Institution Setup
- [ ] C1 Institution profile and academic year
- [ ] C2 Departments, programs, courses, sections/batches
- [ ] C3 User and role management (invite, deactivate)

### D. Admissions
- [ ] D1 Public application form with document upload
- [ ] D2 Applicant status tracking page
- [ ] D3 Review, shortlist, accept, reject; accepting creates a student record + login

### E. Students
- [ ] E1 Student records, guardians, enrolment per program/section
- [ ] E2 Student search/filter, profile, documents

### F. Academics
- [ ] F1 Timetable with clash detection (faculty and room)
- [ ] F2 Attendance marking by faculty, percentage reports, low-attendance flags
- [ ] F3 Assignments and submissions
- [ ] F4 Exams, marks entry, grade calculation, result publishing, transcript
- [ ] F5 Announcements / notifications

### G. Fees & Finance
- [ ] G1 Fee structures, invoice generation per student
- [ ] G2 Payments: offline recording and online (Razorpay test mode), idempotent webhooks
- [ ] G3 Receipts, dues report, concessions
- [ ] G4 CSV exports

### H. Library
- [ ] H1 Catalogue, issue, return, fines, overdue list

### I. HR & Payroll
- [ ] I1 Staff records, leave requests and approvals
- [ ] I2 Monthly payroll run and payslips

### J. Portals
- [ ] J1 Student portal: timetable, attendance, marks, fees, library, assignments
- [ ] J2 Parent portal: linked children only

### K. Operations
- [ ] K1 Migrations, env example, deploy guide, backup/restore guide, admin guide
- [ ] K2 Demo data clearly separated from production (explicit command, flagged institution)
- [ ] K3 Tests: tenant isolation, permissions, calculations, concurrency/idempotency
- [ ] K4 Build, typecheck, lint pass
