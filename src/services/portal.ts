import { query } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import type { SessionUser } from "@/lib/session";
import { portalStudentIds, assertPortalAccess } from "./students";
import { studentAttendance, transcript, studentAssignments } from "./academics";
import { studentInvoices } from "./fees";

export async function portalContext(user: SessionUser, wanted?: string) {
  if (user.role !== "student" && user.role !== "parent") throw forbidden();
  const ids = await portalStudentIds(user);
  const kids = ids.length ? (await query<{ id: string; name: string; enrolment_no: string; program: string; section: string | null }>(
    `SELECT s.id, s.name, s.enrolment_no, p.name program, sec.name section FROM students s JOIN programs p ON p.id=s.program_id LEFT JOIN sections sec ON sec.id=s.section_id WHERE s.id = ANY($1::uuid[]) AND s.institution_id=$2 ORDER BY s.name`, [ids, user.institutionId])).rows : [];
  const current = kids.find((k) => k.id === wanted) ?? kids[0] ?? null;
  return { kids, current };
}

export async function portalOverview(user: SessionUser, studentId: string) {
  await assertPortalAccess(user, studentId);
  const [att, tr, inv, asg] = await Promise.all([studentAttendance(user, studentId), transcript(user, studentId), studentInvoices(user, studentId), studentAssignments(user, studentId)]);
  const total = (att as any[]).reduce((t, r) => t + r.total, 0), present = (att as any[]).reduce((t, r) => t + r.present, 0);
  const due = (inv as any[]).reduce((t, r) => t + Number(r.balance_paise), 0);
  const upcoming = (asg as any[]).filter((a) => !a.submitted_at && new Date(a.due_at) > new Date()).slice(0, 5);
  return { attendancePct: total ? Math.round((present / total) * 1000) / 10 : null, gpa: tr.gpa, dueRupeesPaise: due, upcoming };
}
