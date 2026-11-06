import { z } from "zod";
import { one, query, tx, type Queryable } from "@/lib/db";
import { hashPassword, randomToken, sha256, validatePasswordStrength } from "@/lib/crypto";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { authorize, type Ctx, type SessionUser } from "@/lib/session";
import type { Role } from "@/lib/permissions";

export type Q = Pick<Queryable, "query">;

const OWNED_TABLES = ["programs", "departments", "sections", "courses", "students", "users", "fee_structures", "invoices", "books", "staff", "exams", "assignments", "applications", "academic_years", "timetable_slots", "leave_requests", "tickets"] as const;
export type OwnedTable = (typeof OWNED_TABLES)[number];

/** Verifies a referenced id belongs to the caller's institution. Prevents cross-tenant references. */
export async function assertOwned(table: OwnedTable, id: string | null | undefined, institutionId: string, q: Q = { query }): Promise<void> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  if (!OWNED_TABLES.includes(table)) throw new Error("bad table");
  const r = await q.query(`SELECT 1 FROM ${table} WHERE id=$1 AND institution_id=$2`, [id, institutionId]);
  if (!r.rowCount) throw notFound();
}

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const i of r.error.issues) fields[i.path.join(".") || "_"] ??= i.message;
    throw invalid(Object.values(fields)[0] ?? "Invalid input", fields);
  }
  return r.data;
}

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
const name = z.string().trim().min(2, "Enter a name").max(120);
export const phone = z.string().trim().regex(/^[0-9+\-\s]{7,16}$/, "Enter a valid phone number");

/* ---------- Public sign-up (self-serve onboarding) ---------- */
export const signupSchema = z.object({
  institutionName: name, adminName: name, email, password: z.string(), planCode: z.enum(["starter", "growth", "enterprise"]).default("starter"),
});

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "college"; }

export async function signupInstitution(input: unknown, opts: { isDemo?: boolean } = {}) {
  const d = parse(signupSchema, input);
  const weak = validatePasswordStrength(d.password);
  if (weak) throw invalid(weak, { password: weak });
  if (await one("SELECT 1 FROM users WHERE lower(email)=$1", [d.email])) throw conflict("An account with this email already exists.");
  return tx(async (q) => {
    const plan = await one<{ id: string }>("SELECT id FROM plans WHERE code=$1", [d.planCode], q);
    let slug = slugify(d.institutionName);
    if (await one("SELECT 1 FROM institutions WHERE slug=$1", [slug], q)) slug += "-" + randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x");
    const inst = (await q.query<{ id: string }>(
      "INSERT INTO institutions (name, slug, status, plan_id, trial_ends_at, is_demo, contact_email) VALUES ($1,$2,'trial',$3, now() + interval '14 days', $4, $5) RETURNING id",
      [d.institutionName, slug, plan!.id, !!opts.isDemo, d.email])).rows[0];
    const user = (await q.query<{ id: string }>(
      "INSERT INTO users (institution_id, email, name, role, password_hash) VALUES ($1,$2,$3,'institution_admin',$4) RETURNING id",
      [inst.id, d.email, d.adminName, hashPassword(d.password)])).rows[0];
    const y = new Date().getFullYear();
    await q.query("INSERT INTO academic_years (institution_id, label, starts_on, ends_on, is_current) VALUES ($1,$2,$3,$4,true)",
      [inst.id, `${y}-${String(y + 1).slice(2)}`, `${y}-06-01`, `${y + 1}-05-31`]);
    await audit({ id: user.id, institutionId: inst.id }, "institution.created", "institution", inst.id, { plan: d.planCode }, q);
    return { institutionId: inst.id, userId: user.id, slug };
  });
}

/* ---------- Password reset ---------- */
export async function requestPasswordReset(emailIn: string): Promise<{ token: string | null }> {
  const e = parse(email, emailIn);
  const u = await one<{ id: string; institution_id: string | null; name: string }>("SELECT id, institution_id, name FROM users WHERE lower(email)=$1 AND active", [e]);
  if (!u) return { token: null }; // identical response either way: no account enumeration
  const token = randomToken();
  await query("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [sha256(token), u.id]);
  await audit({ id: u.id, institutionId: u.institution_id }, "auth.reset_requested");
  await query("INSERT INTO notifications (institution_id, user_id, title, body, link) VALUES ($1,$2,'Password reset requested','A reset link was generated for your account.', NULL)", [u.institution_id, u.id]);
  return { token };
}

export async function resetPassword(token: string, password: string) {
  const weak = validatePasswordStrength(password);
  if (weak) throw invalid(weak, { password: weak });
  await tx(async (q) => {
    const r = await one<{ user_id: string }>(
      "UPDATE password_resets SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING user_id", [sha256(token)], q);
    if (!r) throw invalid("This reset link is invalid or has expired. Request a new one.");
    await q.query("UPDATE users SET password_hash=$2, failed_logins=0, locked_until=NULL, must_change_password=false WHERE id=$1", [r.user_id, hashPassword(password)]);
    await q.query("DELETE FROM sessions WHERE user_id=$1", [r.user_id]);
    await audit({ id: r.user_id }, "auth.password_reset", "user", r.user_id, undefined, q);
  });
}

export async function changeOwnPassword(user: SessionUser, current: string, next: string) {
  const weak = validatePasswordStrength(next);
  if (weak) throw invalid(weak, { password: weak });
  const row = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1", [user.id]);
  const { verifyPassword } = await import("@/lib/crypto");
  if (!row || !verifyPassword(current, row.password_hash)) throw invalid("Current password is incorrect.", { current: "Incorrect password" });
  await query("UPDATE users SET password_hash=$2, must_change_password=false WHERE id=$1", [user.id, hashPassword(next)]);
  await audit(user, "auth.password_changed", "user", user.id);
}

/* ---------- Seat limits ---------- */
export async function assertSeat(ctx: Ctx, kind: "students" | "staff", q: Q = { query }) {
  const plan = await one<{ max_students: number; max_staff: number }>(
    "SELECT p.max_students, p.max_staff FROM institutions i JOIN plans p ON p.id=i.plan_id WHERE i.id=$1", [ctx.institutionId], q);
  if (!plan) return;
  const used = Number((await one<{ n: string }>(`SELECT count(*) n FROM ${kind} WHERE institution_id=$1`, [ctx.institutionId], q))!.n);
  const max = kind === "students" ? plan.max_students : plan.max_staff;
  if (used >= max) throw new AppError("limit", `Your plan allows ${max} ${kind}. Upgrade your plan to add more.`);
}

/* ---------- Users (staff accounts) ---------- */
const STAFF_ROLE_ENUM = z.enum(["institution_admin", "admissions_officer", "accountant", "hod", "faculty", "librarian", "hr_manager"]);
export const staffUserSchema = z.object({
  name, email, phone: phone.optional().or(z.literal("")), role: STAFF_ROLE_ENUM, password: z.string(),
  designation: z.string().trim().min(2).max(80), departmentId: z.string().uuid().optional().or(z.literal("")),
  baseSalary: z.coerce.number().min(0).max(10_000_000).default(0),
});

export async function createStaffUser(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "users.manage", { write: true });
  const d = parse(staffUserSchema, input);
  const weak = validatePasswordStrength(d.password);
  if (weak) throw invalid(weak, { password: weak });
  return tx(async (q) => {
    await assertSeat(ctx, "staff", q);
    if (d.departmentId) await assertOwned("departments", d.departmentId, ctx.institutionId, q);
    if (await one("SELECT 1 FROM users WHERE lower(email)=$1", [d.email], q)) throw conflict("An account with this email already exists.");
    const u = (await q.query<{ id: string }>(
      "INSERT INTO users (institution_id, email, name, phone, role, password_hash, must_change_password) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id",
      [ctx.institutionId, d.email, d.name, d.phone || null, d.role, hashPassword(d.password)])).rows[0];
    const count = Number((await q.query<{ n: string }>("SELECT count(*) n FROM staff WHERE institution_id=$1", [ctx.institutionId])).rows[0].n);
    await q.query("INSERT INTO staff (institution_id, user_id, employee_no, designation, department_id, base_salary_paise) VALUES ($1,$2,$3,$4,$5,$6)",
      [ctx.institutionId, u.id, `EMP${String(count + 1).padStart(4, "0")}`, d.designation, d.departmentId || null, Math.round(d.baseSalary * 100)]);
    await audit(user, "user.created", "user", u.id, { role: d.role }, q);
    return u.id;
  });
}

export async function setUserActive(user: SessionUser, userId: string, active: boolean) {
  const ctx = authorize(user, "users.manage", { write: true });
  await assertOwned("users", userId, ctx.institutionId);
  if (userId === user.id) throw invalid("You cannot deactivate your own account.");
  await query("UPDATE users SET active=$2 WHERE id=$1 AND institution_id=$3", [userId, active, ctx.institutionId]);
  if (!active) await query("DELETE FROM sessions WHERE user_id=$1", [userId]);
  await audit(user, active ? "user.activated" : "user.deactivated", "user", userId);
}

export async function listStaff(user: SessionUser) {
  const ctx = authorize(user, "users.manage");
  return (await query(
    `SELECT u.id, u.name, u.email, u.role, u.active, s.employee_no, s.designation, d.name AS department
     FROM users u LEFT JOIN staff s ON s.user_id=u.id LEFT JOIN departments d ON d.id=s.department_id
     WHERE u.institution_id=$1 AND u.role NOT IN ('student','parent','applicant') ORDER BY u.name`, [ctx.institutionId])).rows;
}

/* ---------- Academic structure ---------- */
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/, "Use 2–12 letters, numbers or dashes");

export async function createDepartment(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "academics.manage", { write: true });
  const d = parse(z.object({ name, code }), input);
  try {
    const r = await one<{ id: string }>("INSERT INTO departments (institution_id, name, code) VALUES ($1,$2,$3) RETURNING id", [ctx.institutionId, d.name, d.code]);
    await audit(user, "department.created", "department", r!.id);
    return r!.id;
  } catch (e) { if (String(e).includes("duplicate")) throw conflict("A department with this code already exists."); throw e; }
}

export async function createProgram(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "academics.manage", { write: true });
  const d = parse(z.object({ name, code, departmentId: z.string().uuid(), durationYears: z.coerce.number().int().min(1).max(8), seats: z.coerce.number().int().min(1).max(5000) }), input);
  await assertOwned("departments", d.departmentId, ctx.institutionId);
  try {
    const r = await one<{ id: string }>("INSERT INTO programs (institution_id, department_id, name, code, duration_years, seats) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [ctx.institutionId, d.departmentId, d.name, d.code, d.durationYears, d.seats]);
    await audit(user, "program.created", "program", r!.id);
    return r!.id;
  } catch (e) { if (String(e).includes("duplicate")) throw conflict("A program with this code already exists."); throw e; }
}

export async function createSection(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "academics.manage", { write: true });
  const d = parse(z.object({ programId: z.string().uuid(), name: z.string().trim().min(1).max(20), yearNo: z.coerce.number().int().min(1).max(8) }), input);
  await assertOwned("programs", d.programId, ctx.institutionId);
  try {
    const r = await one<{ id: string }>("INSERT INTO sections (institution_id, program_id, name, year_no) VALUES ($1,$2,$3,$4) RETURNING id", [ctx.institutionId, d.programId, d.name, d.yearNo]);
    await audit(user, "section.created", "section", r!.id);
    return r!.id;
  } catch (e) { if (String(e).includes("duplicate")) throw conflict("That section already exists."); throw e; }
}

export async function createCourse(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "academics.manage", { write: true });
  const d = parse(z.object({ programId: z.string().uuid(), code, name, credits: z.coerce.number().int().min(1).max(12), semester: z.coerce.number().int().min(1).max(16) }), input);
  await assertOwned("programs", d.programId, ctx.institutionId);
  try {
    const r = await one<{ id: string }>("INSERT INTO courses (institution_id, program_id, code, name, credits, semester) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [ctx.institutionId, d.programId, d.code, d.name, d.credits, d.semester]);
    await audit(user, "course.created", "course", r!.id);
    return r!.id;
  } catch (e) { if (String(e).includes("duplicate")) throw conflict("A course with this code already exists."); throw e; }
}

export async function structure(user: SessionUser) {
  const ctx = authorize(user, "students.read");
  const i = ctx.institutionId;
  const [departments, programs, sections, courses] = await Promise.all([
    query("SELECT * FROM departments WHERE institution_id=$1 ORDER BY name", [i]),
    query("SELECT p.*, d.name AS department FROM programs p JOIN departments d ON d.id=p.department_id WHERE p.institution_id=$1 ORDER BY p.name", [i]),
    query("SELECT s.*, p.name AS program FROM sections s JOIN programs p ON p.id=s.program_id WHERE s.institution_id=$1 ORDER BY p.name, s.year_no, s.name", [i]),
    query("SELECT c.*, p.name AS program FROM courses c JOIN programs p ON p.id=c.program_id WHERE c.institution_id=$1 ORDER BY c.code", [i]),
  ]);
  return { departments: departments.rows, programs: programs.rows, sections: sections.rows, courses: courses.rows };
}

export async function updateInstitutionProfile(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "org.manage", { write: true });
  const d = parse(z.object({ name, contactEmail: email, address: z.string().trim().max(300).optional() }), input);
  await query("UPDATE institutions SET name=$2, contact_email=$3, address=$4 WHERE id=$1", [ctx.institutionId, d.name, d.contactEmail, d.address || null]);
  await audit(user, "institution.updated", "institution", ctx.institutionId);
}

export async function getInstitution(user: SessionUser) {
  const ctx = authorize(user, "support.create"); // any signed-in member may read their own institution's name and plan
  return one<{ id: string; name: string; contact_email: string | null; address: string | null; status: string; plan_name: string; trial_ends_at: Date | null; is_demo: boolean; max_students: number; max_staff: number }>(
    `SELECT i.id, i.name, i.contact_email, i.address, i.status, p.name plan_name, i.trial_ends_at, i.is_demo, p.max_students, p.max_staff
     FROM institutions i LEFT JOIN plans p ON p.id=i.plan_id WHERE i.id=$1`, [ctx.institutionId]);
}

export { type Role };

/** Administrator-issued one-time link (24h) for invites and recovery when email is unavailable. */
export async function issueResetLink(user: SessionUser, targetUserId: string): Promise<string> {
  const ctx = authorize(user, "users.manage", { write: true });
  await assertOwned("users", targetUserId, ctx.institutionId);
  const token = randomToken();
  await query("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '24 hours')", [sha256(token), targetUserId]);
  await audit(user, "auth.reset_link_issued", "user", targetUserId);
  return token;
}
