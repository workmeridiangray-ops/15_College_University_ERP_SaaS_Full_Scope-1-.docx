import { z } from "zod";
import { one, query, tx } from "@/lib/db";
import { hashPassword, randomToken, sha256 } from "@/lib/crypto";
import { AppError, conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { authorize, type SessionUser } from "@/lib/session";
import { assertOwned, assertSeat, parse, phone, type Q } from "./core";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
const name = z.string().trim().min(2, "Enter a name").max(120);

/** Creates a login that the person activates by choosing a password via a one-time link. */
async function createInvitedUser(q: Q, institutionId: string, role: "student" | "parent", nameIn: string, emailIn: string, phoneIn?: string | null) {
  if ((await q.query("SELECT 1 FROM users WHERE lower(email)=$1", [emailIn.toLowerCase()])).rowCount) throw conflict(`An account with ${emailIn} already exists.`);
  const u = (await q.query<{ id: string }>(
    "INSERT INTO users (institution_id, email, name, phone, role, password_hash, must_change_password) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id",
    [institutionId, emailIn.toLowerCase(), nameIn, phoneIn || null, role, hashPassword(randomToken(24))])).rows[0];
  const token = randomToken();
  await q.query("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '7 days')", [sha256(token), u.id]);
  return { userId: u.id, setupToken: token };
}

async function nextEnrolmentNo(q: Q, institutionId: string, programId: string): Promise<string> {
  await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["enrol:" + institutionId]);
  const prog = (await q.query<{ code: string }>("SELECT code FROM programs WHERE id=$1", [programId])).rows[0];
  const n = Number((await q.query<{ n: string }>("SELECT count(*) n FROM students WHERE institution_id=$1", [institutionId])).rows[0].n) + 1;
  return `${new Date().getFullYear()}${prog.code}${String(n).padStart(4, "0")}`;
}

/* ---------- Students ---------- */
export const studentSchema = z.object({
  name, email, phone: phone.optional().or(z.literal("")), dob: z.string().optional().or(z.literal("")),
  programId: z.string().uuid(), sectionId: z.string().uuid().optional().or(z.literal("")),
});

export async function createStudent(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "students.write", { write: true });
  const d = parse(studentSchema, input);
  return tx(async (q) => {
    await assertSeat(ctx, "students", q);
    await assertOwned("programs", d.programId, ctx.institutionId, q);
    if (d.sectionId) {
      await assertOwned("sections", d.sectionId, ctx.institutionId, q);
      const ok = await q.query("SELECT 1 FROM sections WHERE id=$1 AND program_id=$2", [d.sectionId, d.programId]);
      if (!ok.rowCount) throw invalid("That section does not belong to the selected program.", { sectionId: "Wrong program" });
    }
    const inv = await createInvitedUser(q, ctx.institutionId, "student", d.name, d.email, d.phone);
    const enrol = await nextEnrolmentNo(q, ctx.institutionId, d.programId);
    const s = (await q.query<{ id: string }>(
      `INSERT INTO students (institution_id, user_id, enrolment_no, name, email, phone, dob, program_id, section_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [ctx.institutionId, inv.userId, enrol, d.name, d.email, d.phone || null, d.dob || null, d.programId, d.sectionId || null])).rows[0];
    await audit(user, "student.created", "student", s.id, { enrolment: enrol }, q);
    return { studentId: s.id, enrolmentNo: enrol, setupToken: inv.setupToken };
  });
}

export async function listStudents(user: SessionUser, f: { search?: string; programId?: string; sectionId?: string; status?: string; page?: number } = {}) {
  const ctx = authorize(user, "students.read");
  const page = Math.max(1, f.page ?? 1), size = 25;
  const params: unknown[] = [ctx.institutionId];
  let where = "s.institution_id=$1";
  if (f.search) { params.push(`%${f.search.replace(/[%_]/g, "")}%`); where += ` AND (s.name ILIKE $${params.length} OR s.enrolment_no ILIKE $${params.length} OR s.email ILIKE $${params.length})`; }
  if (f.programId) { params.push(f.programId); where += ` AND s.program_id=$${params.length}`; }
  if (f.sectionId) { params.push(f.sectionId); where += ` AND s.section_id=$${params.length}`; }
  if (f.status) { params.push(f.status); where += ` AND s.status=$${params.length}`; }
  const total = Number((await query<{ n: string }>(`SELECT count(*) n FROM students s WHERE ${where}`, params)).rows[0].n);
  params.push(size, (page - 1) * size);
  const rows = (await query(
    `SELECT s.id, s.enrolment_no, s.name, s.email, s.phone, s.status, p.name program, sec.name section, sec.year_no
     FROM students s JOIN programs p ON p.id=s.program_id LEFT JOIN sections sec ON sec.id=s.section_id
     WHERE ${where} ORDER BY s.name LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function getStudent(user: SessionUser, id: string) {
  const ctx = authorize(user, "students.read");
  await assertOwned("students", id, ctx.institutionId);
  const s = await one(`SELECT s.*, p.name program, sec.name section FROM students s JOIN programs p ON p.id=s.program_id LEFT JOIN sections sec ON sec.id=s.section_id WHERE s.id=$1 AND s.institution_id=$2`, [id, ctx.institutionId]);
  const guardians = (await query("SELECT id, name, relation, phone, email, user_id FROM guardians WHERE student_id=$1 AND institution_id=$2", [id, ctx.institutionId])).rows;
  const docs = (await query("SELECT id, filename, size_bytes, created_at FROM documents WHERE owner_type='student' AND owner_id=$1 AND institution_id=$2 ORDER BY created_at DESC", [id, ctx.institutionId])).rows;
  return { student: s, guardians, documents: docs };
}

export async function updateStudentStatus(user: SessionUser, id: string, status: "active" | "graduated" | "withdrawn" | "suspended") {
  const ctx = authorize(user, "students.write", { write: true });
  await assertOwned("students", id, ctx.institutionId);
  await tx(async (q) => {
    await q.query("UPDATE students SET status=$2 WHERE id=$1 AND institution_id=$3", [id, status, ctx.institutionId]);
    const u = (await q.query<{ user_id: string }>("SELECT user_id FROM students WHERE id=$1", [id])).rows[0];
    await q.query("UPDATE users SET active=$2 WHERE id=$1", [u.user_id, status === "active"]);
    if (status !== "active") await q.query("DELETE FROM sessions WHERE user_id=$1", [u.user_id]);
    await audit(user, "student.status_changed", "student", id, { status }, q);
  });
}

export async function addGuardian(user: SessionUser, studentId: string, input: unknown) {
  const ctx = authorize(user, "students.write", { write: true });
  const d = parse(z.object({ name, relation: z.string().trim().min(2).max(40), email, phone: phone.optional().or(z.literal("")) }), input);
  await assertOwned("students", studentId, ctx.institutionId);
  return tx(async (q) => {
    // A parent with the same email in this institution is linked, not duplicated (siblings).
    const existing = (await q.query<{ id: string; role: string; institution_id: string }>("SELECT id, role, institution_id FROM users WHERE lower(email)=$1", [d.email])).rows[0];
    let userId: string, setupToken: string | null = null;
    if (existing) {
      if (existing.institution_id !== ctx.institutionId || existing.role !== "parent") throw conflict("That email already belongs to a different account.");
      userId = existing.id;
    } else {
      const inv = await createInvitedUser(q, ctx.institutionId, "parent", d.name, d.email, d.phone);
      userId = inv.userId; setupToken = inv.setupToken;
    }
    const g = (await q.query<{ id: string }>("INSERT INTO guardians (institution_id, student_id, user_id, name, relation, phone, email) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [ctx.institutionId, studentId, userId, d.name, d.relation, d.phone || null, d.email])).rows[0];
    await audit(user, "guardian.added", "student", studentId, { guardian: g.id }, q);
    return { guardianId: g.id, setupToken };
  });
}

/** Resolves which students a portal user may see. Students: themselves. Parents: only linked children. */
export async function portalStudentIds(user: SessionUser): Promise<string[]> {
  if (!user.institutionId) throw forbidden();
  if (user.role === "student") {
    const r = await query<{ id: string }>("SELECT id FROM students WHERE user_id=$1 AND institution_id=$2", [user.id, user.institutionId]);
    return r.rows.map((x) => x.id);
  }
  if (user.role === "parent") {
    const r = await query<{ student_id: string }>("SELECT student_id FROM guardians WHERE user_id=$1 AND institution_id=$2", [user.id, user.institutionId]);
    return r.rows.map((x) => x.student_id);
  }
  throw forbidden();
}

export async function assertPortalAccess(user: SessionUser, studentId: string) {
  const ids = await portalStudentIds(user);
  if (!ids.includes(studentId)) throw notFound();
}

/* ---------- Admissions ---------- */
const applySchema = z.object({
  institutionSlug: z.string().min(2).max(60), programId: z.string().uuid(), name, email, phone,
  dob: z.string().optional().or(z.literal("")), previousPercentage: z.coerce.number().min(0).max(100),
});

function trackingCode() { return "APP-" + randomToken(6).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8); }

export async function listPublicPrograms(slug: string) {
  const inst = await one<{ id: string; name: string; status: string }>("SELECT id, name, status FROM institutions WHERE slug=$1", [slug]);
  if (!inst || inst.status === "suspended" || inst.status === "cancelled") throw notFound("This institution is not accepting applications.");
  const programs = (await query("SELECT id, name, code, duration_years FROM programs WHERE institution_id=$1 ORDER BY name", [inst.id])).rows;
  return { institution: inst.name, programs };
}

export async function submitApplication(input: unknown) {
  const d = parse(applySchema, input);
  const inst = await one<{ id: string; status: string }>("SELECT id, status FROM institutions WHERE slug=$1", [d.institutionSlug]);
  if (!inst || inst.status === "suspended" || inst.status === "cancelled") throw notFound("This institution is not accepting applications.");
  await assertOwned("programs", d.programId, inst.id);
  const code = trackingCode();
  try {
    await query(`INSERT INTO applications (institution_id, program_id, tracking_code, name, email, phone, dob, previous_percentage)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [inst.id, d.programId, code, d.name, d.email, d.phone, d.dob || null, d.previousPercentage]);
  } catch (e) {
    if (String(e).includes("duplicate")) throw conflict("You have already applied to this program with this email. Use your tracking code to check status.");
    throw e;
  }
  await audit({ institutionId: inst.id }, "application.submitted", "application", code);
  return { trackingCode: code };
}

export async function trackApplication(code: string, emailIn: string) {
  const r = await one<{ status: string; name: string; program: string; remarks: string | null; created_at: Date }>(
    `SELECT a.status, a.name, p.name program, a.remarks, a.created_at FROM applications a JOIN programs p ON p.id=a.program_id
     WHERE a.tracking_code=$1 AND lower(a.email)=lower($2)`, [code.trim().toUpperCase(), emailIn.trim()]);
  if (!r) throw notFound("No application matches that code and email.");
  return r;
}

export async function listApplications(user: SessionUser, status?: string) {
  const ctx = authorize(user, "admissions.manage");
  const params: unknown[] = [ctx.institutionId]; let w = "a.institution_id=$1";
  if (status) { params.push(status); w += " AND a.status=$2"; }
  return (await query(`SELECT a.*, p.name program, (SELECT COALESCE(json_agg(json_build_object('id', d.id, 'name', d.filename) ORDER BY d.created_at), '[]'::json) FROM documents d WHERE d.owner_type='application' AND d.owner_id=a.id AND d.institution_id=a.institution_id) docs FROM applications a JOIN programs p ON p.id=a.program_id WHERE ${w} ORDER BY a.created_at DESC LIMIT 200`, params)).rows;
}

const NEXT: Record<string, string[]> = {
  submitted: ["under_review", "rejected"], under_review: ["shortlisted", "rejected"], shortlisted: ["accepted", "rejected"], accepted: [], rejected: [],
};

export async function decideApplication(user: SessionUser, id: string, status: "under_review" | "shortlisted" | "accepted" | "rejected", remarks?: string) {
  const ctx = authorize(user, "admissions.manage", { write: true });
  await assertOwned("applications", id, ctx.institutionId);
  return tx(async (q) => {
    const app = (await q.query<{ status: string; program_id: string; name: string; email: string; phone: string; dob: string | null; student_id: string | null }>(
      "SELECT status, program_id, name, email, phone, dob, student_id FROM applications WHERE id=$1 AND institution_id=$2 FOR UPDATE", [id, ctx.institutionId])).rows[0];
    if (!app) throw notFound();
    if (app.status === status) return { studentId: app.student_id, setupToken: null as string | null, enrolmentNo: null as string | null, unchanged: true };
    if (!NEXT[app.status].includes(status)) throw conflict(`An application that is ${app.status.replace("_", " ")} cannot be moved to ${status.replace("_", " ")}.`);
    let studentId: string | null = null, setupToken: string | null = null, enrolmentNo: string | null = null;
    if (status === "accepted") {
      const prog = (await q.query<{ seats: number }>("SELECT seats FROM programs WHERE id=$1 FOR UPDATE", [app.program_id])).rows[0];
      const taken = Number((await q.query<{ n: string }>("SELECT count(*) n FROM students WHERE program_id=$1 AND status IN ('active')", [app.program_id])).rows[0].n);
      if (taken >= prog.seats) throw new AppError("limit", "This program has no seats left. Increase the seat count or reject the application.");
      await assertSeat(ctx, "students", q);
      const inv = await createInvitedUser(q, ctx.institutionId, "student", app.name, app.email, app.phone);
      enrolmentNo = await nextEnrolmentNo(q, ctx.institutionId, app.program_id);
      studentId = (await q.query<{ id: string }>(
        "INSERT INTO students (institution_id, user_id, enrolment_no, name, email, phone, dob, program_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [ctx.institutionId, inv.userId, enrolmentNo, app.name, app.email, app.phone, app.dob, app.program_id])).rows[0].id;
      setupToken = inv.setupToken;
    }
    await q.query("UPDATE applications SET status=$2, remarks=$3, decided_by=$4, student_id=COALESCE($5, student_id) WHERE id=$1", [id, status, remarks || null, user.id, studentId]);
    await audit(user, "application." + status, "application", id, { studentId }, q);
    return { studentId, setupToken, enrolmentNo, unchanged: false };
  });
}
