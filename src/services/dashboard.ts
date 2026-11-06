import { one, query } from "@/lib/db";
import { can } from "@/lib/permissions";
import { authorize, type SessionUser } from "@/lib/session";
import { collectionSummary } from "./fees";

export async function staffDashboard(user: SessionUser) {
  const ctx = authorize(user, "support.create");
  const i = ctx.institutionId;
  const out: Record<string, unknown> = {};
  if (can(user.role, "students.read")) {
    out.students = Number((await one<{ n: string }>("SELECT count(*) n FROM students WHERE institution_id=$1 AND status='active'", [i]))!.n);
    out.programs = Number((await one<{ n: string }>("SELECT count(*) n FROM programs WHERE institution_id=$1", [i]))!.n);
  }
  if (can(user.role, "admissions.manage")) out.pendingApps = Number((await one<{ n: string }>("SELECT count(*) n FROM applications WHERE institution_id=$1 AND status IN ('submitted','under_review','shortlisted')", [i]))!.n);
  if (can(user.role, "fees.read")) out.fees = await collectionSummary(user);
  if (can(user.role, "reports.read")) out.lowAttendance = Number((await one<{ n: string }>(`SELECT count(*) n FROM (SELECT student_id FROM attendance WHERE institution_id=$1 AND status<>'excused' GROUP BY student_id, course_id HAVING 100.0*count(*) FILTER (WHERE status IN ('present','late'))/count(*) < 75) x`, [i]))!.n);
  if (can(user.role, "hr.manage")) out.pendingLeaves = Number((await one<{ n: string }>("SELECT count(*) n FROM leave_requests WHERE institution_id=$1 AND status='pending'", [i]))!.n);
  if (can(user.role, "library.manage")) out.overdueBooks = Number((await one<{ n: string }>("SELECT count(*) n FROM book_issues WHERE institution_id=$1 AND returned_on IS NULL AND due_on < current_date", [i]))!.n);
  if (can(user.role, "attendance.mark")) {
    const dow = ((new Date().getDay() + 6) % 7) + 1;
    out.today = (await query(`SELECT to_char(t.start_time,'HH24:MI') start_time, to_char(t.end_time,'HH24:MI') end_time, t.room, c.code, c.name course, s.name section FROM timetable_slots t JOIN courses c ON c.id=t.course_id JOIN sections s ON s.id=t.section_id WHERE t.institution_id=$1 AND t.faculty_user_id=$2 AND t.weekday=$3 ORDER BY t.start_time`, [i, user.id, dow])).rows;
  }
  return out as {
    students?: number; programs?: number; pendingApps?: number; fees?: { billedPaise: number; collectedPaise: number; outstandingPaise: number };
    lowAttendance?: number; pendingLeaves?: number; overdueBooks?: number; today?: { start_time: string; end_time: string; room: string; code: string; course: string; section: string }[];
  };
}
