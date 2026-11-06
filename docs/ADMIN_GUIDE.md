# Administrator guide

Written for the person who sets up and runs an institution on Campus ERP. Screen names match the left-hand menu.

## Roles at a glance
| Role | Can do | Cannot do |
|---|---|---|
| **Institution admin** | Everything inside their institution: settings, staff accounts, academics, students, admissions, fees, library, HR/payroll, reports, audit log | See other institutions or the platform console |
| **Admissions officer** | Review applications, shortlist/accept/reject (accepting enrols the student), read students, announcements, reports | Fees, marks, HR |
| **Accountant** | Fee structures, invoices, offline payments, concessions, receipts, dues, CSV exports | Academic records, admissions |
| **HOD** | Departments/programs/sections/courses, timetable, attendance, assignments, exams and marks, announcements | Fees, HR, staff accounts |
| **Faculty** | Take attendance, assignments, enter marks, announcements (read-only on students) | Academic structure, fees |
| **Librarian** | Catalogue, issue/return, fines | Anything else |
| **HR manager** | Staff leave approvals, payroll runs and payslips, reports | Student data |
| **Student / Parent** | Portal only: own (or linked children's) timetable, attendance, results, fees and receipts, assignments, library, announcements, support. Online payment of invoices. | Any staff screen; another family's data |
| **Applicant** | Public application form and `/track` status page | Everything else |
| **Super admin** | Platform console `/super`: institutions, plans, suspension, platform audit, support inbox | Day-to-day institution data entry |

Permissions are enforced on the server for every action; hiding a menu item is cosmetic only.

## Setting up a new institution (first hour)
1. **Sign up** at `/signup` (or ask the super admin to onboard you). You become the Institution admin and start a free trial.
2. **Settings** → fill in the institution profile (name, contact email, address). The name and address print on receipts. The page also shows your plan and usage against its limits.
3. **Academics** → add Departments → Programs (duration, seats) → Sections (year + letter) → Courses (credits, semester).
4. **Staff accounts** → create accounts for admissions officers, accountants, HODs, faculty, librarians and HR. Each person is asked to choose their own password at first sign-in. If email is not configured the screen shows a one-time link/temporary password to hand over securely.
5. **Timetable** → add classes; the app refuses a slot that double-books a faculty member or a room.
6. Share your application link: `/apply/<your-slug>` (shown on the Admissions screen).

## Day-to-day
* **Admissions**: `submitted → under review → shortlisted → accepted / rejected`. *Accept & enrol* creates the student record, assigns an enrolment number, checks program seats and your plan's seat limit, and gives you a one-time activation link for the student. Applicants see progress at `/track` with their tracking code and email.
* **Students**: search by name/enrolment number, open a profile to edit details, add guardians (a parent account is created or an existing one linked), change status, and view uploaded documents.
* **Fees**: *Structures* → create per program (amount, due date) → *Generate invoices* (one per active student; repeating is safe). *Invoices* → record a payment (amount defaults to the balance; overpayment is rejected; double-clicks are safe) or apply a concession. *Payments* lists receipts; open one to print. *Export dues CSV* for follow-up.
* **Attendance**: faculty pick a class and date, mark each student, save. Percentages and low-attendance flags appear on Reports and in portals.
* **Exams & marks**: create an exam with a weight, enter marks, publish results; students then see grades and GPA. Unpublished results stay hidden, and marks cannot be changed while results are published (unpublish first).
* **Library**: add books, issue to a student, return; fines are calculated on return; overdue list on the same screen.
* **HR**: staff submit leave in *My leave & payslips*; HR approves/rejects. Run monthly payroll to generate payslips. Statutory deductions (PF/ESI/TDS) are **not** calculated — see limitations.
* **Announcements** reach the chosen audience and appear in their notification bell.
* **Support**: any signed-in user can open a ticket; the platform operator replies from `/super/support`; replies show on the ticket.
* **Audit log**: the latest 200 recorded actions in your institution (who, what, when). Older entries remain in the database.

## Accounts and passwords
* Deactivating a user ends their sessions immediately and blocks sign-in; reactivate any time.
* *Staff accounts → Reset link* (or *Admin reset link* for the super admin on an institution) issues a single-use, one-hour reset link. Users can also use *Forgot password* (works by email when SMTP is configured).
* A user who fails five sign-ins is locked for 15 minutes.

## Plans and subscription state
Trial (14 days) → Active. If the trial expires or a payment is overdue (`past_due`) the institution becomes **read-only**: people can sign in and view, but nothing can be changed. `suspended` and `cancelled` institutions cannot sign in. Seat limits (staff, students) are enforced when you add people. Plan and status changes are made by the super admin in `/super`. Automated billing of subscriptions is **not** included: plan state is set by the operator.

## Super admin (platform operator)
`/super` shows institutions with plan, status, usage and demo flag. You can change plan, set status (trial, active, past due, suspended, cancelled; changes are audited), extend a trial by 14 days, read the platform audit log, and answer support tickets. Use *Reset link* on an institution's admin if they are locked out.

## Troubleshooting
| Symptom | What to do |
|---|---|
| "Your session has ended" | Sign in again; sessions last 12 hours. |
| Can't change anything, banner says read-only | Subscription is past due or trial ended — contact the platform operator. |
| "Too many attempts" | Wait 15 minutes. |
| Activation link says invalid or expired | Links are single-use and expire after one hour; issue a new one. |
| Something went wrong with a reference code | Quote the code to the operator; it appears in the server log. |
