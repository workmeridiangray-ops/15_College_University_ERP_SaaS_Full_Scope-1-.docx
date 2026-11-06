import { z } from "zod";
import { one, query, tx } from "@/lib/db";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { authorize, type SessionUser } from "@/lib/session";
import { assertOwned, parse, type Q } from "./core";
import { assertPortalAccess, portalStudentIds } from "./students";

const uuid = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const today = () => new Date().toISOString().slice(0, 10);

/** Admin/HOD manage anything; faculty only courses+sections they are timetabled to teach. */
async function assertCanTeach(user: SessionUser, courseId: string, sectionId: string, q: Q = { query }) {
  if (user.role === "institution_admin" || user.role === "hod") return;
  const r = await q.query("SELECT 1 FROM timetable_slots WHERE institution_id=$1 AND faculty_user_id=$2 AND course_id=$3 AND section_id=$4 LIMIT 1", [user.institutionId, user.id, courseId, sectionId]);
  if (!r.rowCount) throw forbidden("You are not assigned to teach this course and section.");
}

/* ---------- Timetable ---------- */
export async function createSlot(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "timetable.manage", { write: true });
  const d = parse(z.object({ sectionId: uuid, courseId: uuid, facultyUserId: uuid, room: z.string().trim().min(1).max(30), weekday: z.coerce.number().int().min(1).max(7), startTime: time, endTime: time }), input);
  if (d.endTime <= d.startTime) throw invalid("End time must be after start time.", { endTime: "Must be after start" });
  return tx(async (q) => {
    await assertOwned("sections", d.sectionId, ctx.institutionId, q);
    await assertOwned("courses", d.courseId, ctx.institutionId, q);
    const f = (await q.query("SELECT 1 FROM users WHERE id=$1 AND institution_id=$2 AND role IN ('faculty','hod') AND active", [d.facultyUserId, ctx.institutionId])).rowCount;
    if (!f) throw invalid("Choose an active faculty member.", { facultyUserId: "Not a faculty member" });
    const clash = (await q.query<{ kind: string }>(
      `SELECT CASE WHEN faculty_user_id=$3 THEN 'faculty' WHEN section_id=$2 THEN 'section' ELSE 'room' END kind
       FROM timetable_slots WHERE institution_id=$1 AND weekday=$5 AND start_time < $7::time AND end_time > $6::time
        AND (faculty_user_id=$3 OR section_id=$2 OR lower(room)=lower($4)) LIMIT 1`,
      [ctx.institutionId, d.sectionId, d.facultyUserId, d.room, d.weekday, d.startTime, d.endTime])).rows[0];
    if (clash) throw conflict(`Clash: that ${clash.kind} is already booked at this time.`);
    const r = (await q.query<{ id: string }>("INSERT INTO timetable_slots (institution_id, section_id, course_id, faculty_user_id, room, weekday, start_time, end_time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      [ctx.institutionId, d.sectionId, d.courseId, d.facultyUserId, d.room, d.weekday, d.startTime, d.endTime])).rows[0];
    await audit(user, "timetable.slot_created", "timetable_slot", r.id, undefined, q);
    return r.id;
  });
}

export async function deleteSlot(user: SessionUser, id: string) {
  const ctx = authorize(user, "timetable.manage", { write: true });
  await assertOwned("timetable_slots", id, ctx.institutionId);
  await query("DELETE FROM timetable_slots WHERE id=$1 AND institution_id=$2", [id, ctx.institutionId]);
  await audit(user, "timetable.slot_deleted", "timetable_slot", id);
}

const SLOT_SELECT = `SELECT t.id, t.weekday, to_char(t.start_time,'HH24:MI') start_time, to_char(t.end_time,'HH24:MI') end_time, t.room, c.code course_code, c.name course, sec.name section, u.name faculty
  FROM timetable_slots t JOIN courses c ON c.id=t.course_id JOIN sections sec ON sec.id=t.section_id JOIN users u ON u.id=t.faculty_user_id`;

export async function sectionTimetable(user: SessionUser, sectionId: string) {
  const ctx = authorize(user, "students.read");
  await assertOwned("sections", sectionId, ctx.institutionId);
  return (await query(`${SLOT_SELECT} WHERE t.institution_id=$1 AND t.section_id=$2 ORDER BY t.weekday, t.start_time`, [ctx.institutionId, sectionId])).rows;
}
export async function myTeachingTimetable(user: SessionUser) {
  const ctx = authorize(user, "attendance.read");
  return (await query(`${SLOT_SELECT} WHERE t.institution_id=$1 AND t.faculty_user_id=$2 ORDER BY t.weekday, t.start_time`, [ctx.institutionId, user.id])).rows;
}
export async function studentTimetable(user: SessionUser, studentId: string) {
  await assertPortalAccess(user, studentId);
  const s = await one<{ section_id: string | null }>("SELECT section_id FROM students WHERE id=$1 AND institution_id=$2", [studentId, user.institutionId]);
  if (!s?.section_id) return [];
  return (await query(`${SLOT_SELECT} WHERE t.institution_id=$1 AND t.section_id=$2 ORDER BY t.weekday, t.start_time`, [user.institutionId, s.section_id])).rows;
}

/* ---------- Attendance ---------- */
export async function markAttendance(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "attendance.mark", { write: true });
  const d = parse(z.object({
    courseId: uuid, sectionId: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    entries: z.array(z.object({ studentId: uuid, status: z.enum(["present", "absent", "late", "excused"]) })).min(1).max(500),
  }), input);
  if (d.date > today()) throw invalid("Attendance cannot be marked for a future date.", { date: "Future date" });
  return tx(async (q) => {
    await assertOwned("courses", d.courseId, ctx.institutionId, q);
    await assertOwned("sections", d.sectionId, ctx.institutionId, q);
    await assertCanTeach(user, d.courseId, d.sectionId, q);
    const ids = d.entries.map((e) => e.studentId);
    const valid = (await q.query<{ id: string }>("SELECT id FROM students WHERE institution_id=$1 AND section_id=$2 AND id = ANY($3::uuid[])", [ctx.institutionId, d.sectionId, ids])).rows.map((r) => r.id);
    if (valid.length !== new Set(ids).size) throw invalid("Some students are not in this section.");
    for (const e of d.entries) {
      await q.query(`INSERT INTO attendance (institution_id, course_id, student_id, on_date, status, marked_by) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (course_id, student_id, on_date) DO UPDATE SET status=EXCLUDED.status, marked_by=EXCLUDED.marked_by`, [ctx.institutionId, d.courseId, e.studentId, d.date, e.status, user.id]);
    }
    // alert students and guardians who have dropped below 75% in this course
    for (const e of d.entries.filter((x) => x.status === "absent")) {
      const pct = await attendancePct(q, e.studentId, d.courseId);
      if (pct !== null && pct < 75) {
        const link = `/portal/attendance?c=${d.courseId}&d=${d.date}`;
        await q.query(`INSERT INTO notifications (institution_id, user_id, title, body, link)
          SELECT $1, uid, 'Low attendance', $3, $4 FROM (
            SELECT user_id uid FROM students WHERE id=$2 UNION SELECT user_id FROM guardians WHERE student_id=$2 AND user_id IS NOT NULL) x
          WHERE NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id=x.uid AND n.link=$4)`,
          [ctx.institutionId, e.studentId, `Attendance is ${pct.toFixed(0)}%, below the 75% requirement.`, link]);
      }
    }
    await audit(user, "attendance.marked", "course", d.courseId, { date: d.date, count: d.entries.length }, q);
    return { saved: d.entries.length };
  });
}

async function attendancePct(q: Q, studentId: string, courseId: string): Promise<number | null> {
  const r = (await q.query<{ total: string; present: string }>(
    "SELECT count(*) total, count(*) FILTER (WHERE status IN ('present','late')) present FROM attendance WHERE student_id=$1 AND course_id=$2 AND status<>'excused'", [studentId, courseId])).rows[0];
  return Number(r.total) ? (Number(r.present) / Number(r.total)) * 100 : null;
}

export async function sectionRoster(user: SessionUser, sectionId: string, courseId: string, date: string) {
  const ctx = authorize(user, "attendance.read");
  await assertOwned("sections", sectionId, ctx.institutionId);
  await assertOwned("courses", courseId, ctx.institutionId);
  await assertCanTeach(user, courseId, sectionId);
  return (await query(`SELECT s.id, s.name, s.enrolment_no, a.status FROM students s
     LEFT JOIN attendance a ON a.student_id=s.id AND a.course_id=$3 AND a.on_date=$4
     WHERE s.institution_id=$1 AND s.section_id=$2 AND s.status='active' ORDER BY s.name`, [ctx.institutionId, sectionId, courseId, date])).rows;
}

export async function studentAttendance(user: SessionUser, studentId: string) {
  if (user.role === "student" || user.role === "parent") await assertPortalAccess(user, studentId);
  else { const ctx = authorize(user, "attendance.read"); await assertOwned("students", studentId, ctx.institutionId); }
  return (await query(`SELECT c.id course_id, c.code, c.name, count(*) FILTER (WHERE a.status<>'excused')::int total,
      count(*) FILTER (WHERE a.status IN ('present','late'))::int present,
      CASE WHEN count(*) FILTER (WHERE a.status<>'excused')=0 THEN NULL ELSE round(100.0*count(*) FILTER (WHERE a.status IN ('present','late'))/count(*) FILTER (WHERE a.status<>'excused'),1) END pct
    FROM attendance a JOIN courses c ON c.id=a.course_id WHERE a.student_id=$1 AND a.institution_id=$2 GROUP BY c.id, c.code, c.name ORDER BY c.code`, [studentId, user.institutionId])).rows;
}

export async function lowAttendance(user: SessionUser, threshold = 75) {
  const ctx = authorize(user, "reports.read");
  return (await query(`SELECT s.id, s.name, s.enrolment_no, c.code course,
      round(100.0*count(*) FILTER (WHERE a.status IN ('present','late'))/count(*),1) pct
    FROM attendance a JOIN students s ON s.id=a.student_id JOIN courses c ON c.id=a.course_id
    WHERE a.institution_id=$1 AND a.status<>'excused' GROUP BY s.id, s.name, s.enrolment_no, c.code
    HAVING 100.0*count(*) FILTER (WHERE a.status IN ('present','late'))/count(*) < $2 ORDER BY pct`, [ctx.institutionId, threshold])).rows;
}

/* ---------- Assignments ---------- */
export async function createAssignment(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "assignments.manage", { write: true });
  const d = parse(z.object({ courseId: uuid, sectionId: uuid, title: z.string().trim().min(3).max(120), description: z.string().max(4000).optional(), dueAt: z.string().min(10), maxMarks: z.coerce.number().int().min(1).max(1000) }), input);
  const due = new Date(d.dueAt);
  if (isNaN(due.getTime()) || due < new Date()) throw invalid("Choose a due date in the future.", { dueAt: "Must be in the future" });
  await assertOwned("courses", d.courseId, ctx.institutionId);
  await assertOwned("sections", d.sectionId, ctx.institutionId);
  await assertCanTeach(user, d.courseId, d.sectionId);
  const r = await one<{ id: string }>("INSERT INTO assignments (institution_id, course_id, section_id, title, description, due_at, max_marks, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    [ctx.institutionId, d.courseId, d.sectionId, d.title, d.description || null, due.toISOString(), d.maxMarks, user.id]);
  await query(`INSERT INTO notifications (institution_id, user_id, title, body, link) SELECT $1, user_id, 'New assignment', $2, '/portal/assignments' FROM students WHERE section_id=$3 AND institution_id=$1 AND status='active'`,
    [ctx.institutionId, d.title, d.sectionId]);
  await audit(user, "assignment.created", "assignment", r!.id);
  return r!.id;
}

export async function listAssignmentsForStaff(user: SessionUser) {
  const ctx = authorize(user, "assignments.manage");
  const mine = user.role === "faculty";
  return (await query(`SELECT a.id, a.title, a.due_at, a.max_marks, c.code, sec.name section,
      (SELECT count(*)::int FROM submissions s WHERE s.assignment_id=a.id) submitted,
      (SELECT count(*)::int FROM students st WHERE st.section_id=a.section_id AND st.status='active') total
    FROM assignments a JOIN courses c ON c.id=a.course_id JOIN sections sec ON sec.id=a.section_id
    WHERE a.institution_id=$1 ${mine ? "AND a.created_by=$2" : ""} ORDER BY a.due_at DESC`, mine ? [ctx.institutionId, user.id] : [ctx.institutionId])).rows;
}

export async function assignmentSubmissions(user: SessionUser, assignmentId: string) {
  const ctx = authorize(user, "assignments.manage");
  await assertOwned("assignments", assignmentId, ctx.institutionId);
  const a = await one<{ course_id: string; section_id: string }>("SELECT course_id, section_id FROM assignments WHERE id=$1", [assignmentId]);
  await assertCanTeach(user, a!.course_id, a!.section_id);
  return (await query(`SELECT st.id student_id, st.name, st.enrolment_no, s.id submission_id, s.body, s.submitted_at, s.marks, s.feedback
    FROM students st LEFT JOIN submissions s ON s.student_id=st.id AND s.assignment_id=$2
    WHERE st.section_id=$3 AND st.institution_id=$1 AND st.status='active' ORDER BY st.name`, [ctx.institutionId, assignmentId, a!.section_id])).rows;
}

export async function submitAssignment(user: SessionUser, assignmentId: string, body: string) {
  if (user.role !== "student") throw forbidden("Only students can submit assignments.");
  const [sid] = await portalStudentIds(user);
  const a = await one<{ due_at: Date; section_id: string; institution_id: string }>("SELECT due_at, section_id, institution_id FROM assignments WHERE id=$1", [assignmentId]);
  const st = await one<{ section_id: string | null }>("SELECT section_id FROM students WHERE id=$1", [sid]);
  if (!a || a.institution_id !== user.institutionId || a.section_id !== st?.section_id) throw notFound();
  if (new Date(a.due_at) < new Date()) throw conflict("The deadline for this assignment has passed.");
  const text = body.trim();
  if (text.length < 1 || text.length > 10000) throw invalid("Write your answer (up to 10,000 characters).", { body: "Required" });
  await query(`INSERT INTO submissions (institution_id, assignment_id, student_id, body) VALUES ($1,$2,$3,$4)
    ON CONFLICT (assignment_id, student_id) DO UPDATE SET body=EXCLUDED.body, submitted_at=now() WHERE submissions.marks IS NULL`, [user.institutionId, assignmentId, sid, text]);
  await audit(user, "assignment.submitted", "assignment", assignmentId);
}

export async function gradeSubmission(user: SessionUser, submissionId: string, marks: number, feedback?: string) {
  const ctx = authorize(user, "assignments.manage", { write: true });
  const s = await one<{ max_marks: number; course_id: string; section_id: string; student_id: string }>(
    "SELECT a.max_marks, a.course_id, a.section_id, s.student_id FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=$1 AND s.institution_id=$2", [submissionId, ctx.institutionId]);
  if (!s) throw notFound();
  await assertCanTeach(user, s.course_id, s.section_id);
  if (!(marks >= 0 && marks <= s.max_marks)) throw invalid(`Marks must be between 0 and ${s.max_marks}.`, { marks: "Out of range" });
  await query("UPDATE submissions SET marks=$2, feedback=$3 WHERE id=$1", [submissionId, marks, feedback?.slice(0, 1000) || null]);
  await audit(user, "submission.graded", "submission", submissionId, { marks });
}

export async function studentAssignments(user: SessionUser, studentId: string) {
  await assertPortalAccess(user, studentId);
  return (await query(`SELECT a.id, a.title, a.description, a.due_at, a.max_marks, c.code, s.body, s.submitted_at, s.marks, s.feedback
    FROM students st JOIN assignments a ON a.section_id=st.section_id JOIN courses c ON c.id=a.course_id
    LEFT JOIN submissions s ON s.assignment_id=a.id AND s.student_id=st.id
    WHERE st.id=$1 AND st.institution_id=$2 ORDER BY a.due_at DESC`, [studentId, user.institutionId])).rows;
}

/* ---------- Exams, marks, grades ---------- */
export const GRADE_SCALE: { min: number; grade: string; points: number }[] = [
  { min: 90, grade: "A+", points: 10 }, { min: 80, grade: "A", points: 9 }, { min: 70, grade: "B+", points: 8 },
  { min: 60, grade: "B", points: 7 }, { min: 50, grade: "C", points: 6 }, { min: 40, grade: "D", points: 5 }, { min: 0, grade: "F", points: 0 },
];
export function gradeFor(pct: number) { return GRADE_SCALE.find((g) => pct >= g.min)!; }

export async function createExam(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "exams.manage", { write: true });
  const d = parse(z.object({ courseId: uuid, sectionId: uuid, name: z.string().trim().min(2).max(80), maxMarks: z.coerce.number().int().min(1).max(1000), weightPct: z.coerce.number().int().min(1).max(100), examDate: z.string().optional().or(z.literal("")) }), input);
  await assertOwned("courses", d.courseId, ctx.institutionId);
  await assertOwned("sections", d.sectionId, ctx.institutionId);
  await assertCanTeach(user, d.courseId, d.sectionId);
  const total = Number((await one<{ w: string }>("SELECT COALESCE(sum(weight_pct),0) w FROM exams WHERE course_id=$1 AND section_id=$2", [d.courseId, d.sectionId]))!.w);
  if (total + d.weightPct > 100) throw invalid(`Weights for this course already total ${total}%. This exam can be at most ${100 - total}%.`, { weightPct: "Exceeds 100% total" });
  const r = await one<{ id: string }>("INSERT INTO exams (institution_id, course_id, section_id, name, max_marks, weight_pct, exam_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [ctx.institutionId, d.courseId, d.sectionId, d.name, d.maxMarks, d.weightPct, d.examDate || null]);
  await audit(user, "exam.created", "exam", r!.id);
  return r!.id;
}

export async function listExams(user: SessionUser) {
  const ctx = authorize(user, "marks.enter");
  return (await query(`SELECT e.*, c.code course_code, c.name course, sec.name section,
      (SELECT count(*)::int FROM marks m WHERE m.exam_id=e.id) entered,
      (SELECT count(*)::int FROM students s WHERE s.section_id=e.section_id AND s.status='active') total
    FROM exams e JOIN courses c ON c.id=e.course_id JOIN sections sec ON sec.id=e.section_id WHERE e.institution_id=$1 ORDER BY e.exam_date DESC NULLS LAST, e.name`, [ctx.institutionId])).rows;
}

export async function examSheet(user: SessionUser, examId: string) {
  const ctx = authorize(user, "marks.enter");
  await assertOwned("exams", examId, ctx.institutionId);
  const e = (await one<{ course_id: string; section_id: string; max_marks: number; published: boolean; name: string }>("SELECT course_id, section_id, max_marks, published, name FROM exams WHERE id=$1", [examId]))!;
  await assertCanTeach(user, e.course_id, e.section_id);
  const rows = (await query(`SELECT s.id student_id, s.name, s.enrolment_no, m.marks_obtained, m.version FROM students s
    LEFT JOIN marks m ON m.student_id=s.id AND m.exam_id=$2 WHERE s.section_id=$3 AND s.institution_id=$1 AND s.status='active' ORDER BY s.name`, [ctx.institutionId, examId, e.section_id])).rows;
  return { exam: e, rows };
}

export async function enterMarks(user: SessionUser, examId: string, entries: { studentId: string; marks: number; version?: number }[]) {
  const ctx = authorize(user, "marks.enter", { write: true });
  await assertOwned("exams", examId, ctx.institutionId);
  return tx(async (q) => {
    const e = (await q.query<{ course_id: string; section_id: string; max_marks: number; published: boolean }>("SELECT course_id, section_id, max_marks, published FROM exams WHERE id=$1 FOR UPDATE", [examId])).rows[0];
    await assertCanTeach(user, e.course_id, e.section_id, q);
    if (e.published) throw conflict("Results are published. Unpublish before changing marks.");
    for (const x of entries) {
      if (!(typeof x.marks === "number" && x.marks >= 0 && x.marks <= e.max_marks)) throw invalid(`Marks must be between 0 and ${e.max_marks}.`);
      const inSec = (await q.query("SELECT 1 FROM students WHERE id=$1 AND section_id=$2 AND institution_id=$3", [x.studentId, e.section_id, ctx.institutionId])).rowCount;
      if (!inSec) throw invalid("A student in the list is not in this section.");
      const cur = (await q.query<{ version: number }>("SELECT version FROM marks WHERE exam_id=$1 AND student_id=$2 FOR UPDATE", [examId, x.studentId])).rows[0];
      if (cur) {
        if (x.version !== undefined && x.version !== cur.version) throw conflict("Another teacher changed these marks while you were editing. Reload the sheet and review before saving.");
        await q.query("UPDATE marks SET marks_obtained=$3, version=version+1, entered_by=$4 WHERE exam_id=$1 AND student_id=$2", [examId, x.studentId, x.marks, user.id]);
      } else {
        await q.query("INSERT INTO marks (institution_id, exam_id, student_id, marks_obtained, entered_by) VALUES ($1,$2,$3,$4,$5)", [ctx.institutionId, examId, x.studentId, x.marks, user.id]);
      }
    }
    await audit(user, "marks.entered", "exam", examId, { count: entries.length }, q);
    return { saved: entries.length };
  });
}

export async function setPublished(user: SessionUser, examId: string, published: boolean) {
  const ctx = authorize(user, "exams.manage", { write: true });
  await assertOwned("exams", examId, ctx.institutionId);
  await tx(async (q) => {
    const e = (await q.query<{ course_id: string; section_id: string; name: string }>("SELECT course_id, section_id, name FROM exams WHERE id=$1 FOR UPDATE", [examId])).rows[0];
    await assertCanTeach(user, e.course_id, e.section_id, q);
    if (published) {
      const missing = Number((await q.query<{ n: string }>(`SELECT count(*) n FROM students s WHERE s.section_id=$1 AND s.institution_id=$2 AND s.status='active' AND NOT EXISTS (SELECT 1 FROM marks m WHERE m.exam_id=$3 AND m.student_id=s.id)`, [e.section_id, ctx.institutionId, examId])).rows[0].n);
      if (missing) throw conflict(`${missing} student(s) have no marks yet. Enter marks for everyone before publishing.`);
    }
    await q.query("UPDATE exams SET published=$2 WHERE id=$1", [examId, published]);
    if (published) await q.query(`INSERT INTO notifications (institution_id, user_id, title, body, link)
      SELECT $1, uid, 'Results published', $3, '/portal/results' FROM (SELECT user_id uid FROM students WHERE section_id=$2 AND institution_id=$1 UNION SELECT g.user_id FROM guardians g JOIN students s ON s.id=g.student_id WHERE s.section_id=$2 AND g.user_id IS NOT NULL) x`,
      [ctx.institutionId, e.section_id, e.name]);
    await audit(user, published ? "exam.published" : "exam.unpublished", "exam", examId, undefined, q);
  });
}

/** Weighted course percentage over published exams, GPA weighted by credits. Only published results are ever visible to students/parents. */
export async function transcript(user: SessionUser, studentId: string) {
  if (user.role === "student" || user.role === "parent") await assertPortalAccess(user, studentId);
  else { const ctx = authorize(user, "students.read"); await assertOwned("students", studentId, ctx.institutionId); }
  const rows = (await query<{ code: string; name: string; credits: number; exam: string; max_marks: number; weight_pct: number; marks_obtained: string }>(
    `SELECT c.code, c.name, c.credits, e.name exam, e.max_marks, e.weight_pct, m.marks_obtained
     FROM marks m JOIN exams e ON e.id=m.exam_id JOIN courses c ON c.id=e.course_id
     WHERE m.student_id=$1 AND m.institution_id=$2 AND e.published ORDER BY c.code, e.name`, [studentId, user.institutionId])).rows;
  const byCourse = new Map<string, { code: string; name: string; credits: number; num: number; den: number; exams: { exam: string; obtained: number; max: number }[] }>();
  for (const r of rows) {
    const c = byCourse.get(r.code) ?? { code: r.code, name: r.name, credits: r.credits, num: 0, den: 0, exams: [] };
    c.num += (Number(r.marks_obtained) / r.max_marks) * r.weight_pct; c.den += r.weight_pct;
    c.exams.push({ exam: r.exam, obtained: Number(r.marks_obtained), max: r.max_marks });
    byCourse.set(r.code, c);
  }
  const courses = [...byCourse.values()].map((c) => {
    const pct = c.den ? (c.num / c.den) * 100 : 0; const g = gradeFor(pct);
    return { code: c.code, name: c.name, credits: c.credits, percentage: Math.round(pct * 100) / 100, grade: g.grade, points: g.points, exams: c.exams };
  });
  const credits = courses.reduce((t, c) => t + c.credits, 0);
  const gpa = credits ? Math.round((courses.reduce((t, c) => t + c.points * c.credits, 0) / credits) * 100) / 100 : null;
  return { courses, gpa };
}

/* ---------- Announcements and notifications ---------- */
export async function createAnnouncement(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "announce.write", { write: true });
  const d = parse(z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(4000), audience: z.enum(["all", "students", "staff", "parents"]) }), input);
  return tx(async (q) => {
    const a = (await q.query<{ id: string }>("INSERT INTO announcements (institution_id, title, body, audience, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", [ctx.institutionId, d.title, d.body, d.audience, user.id])).rows[0];
    const roles = d.audience === "all" ? ["student", "parent", "institution_admin", "admissions_officer", "accountant", "hod", "faculty", "librarian", "hr_manager"]
      : d.audience === "students" ? ["student"] : d.audience === "parents" ? ["parent"] : ["institution_admin", "admissions_officer", "accountant", "hod", "faculty", "librarian", "hr_manager"];
    const n = await q.query("INSERT INTO notifications (institution_id, user_id, title, body, link) SELECT $1, id, $2, $3, '/app/announcements' FROM users WHERE institution_id=$1 AND active AND role = ANY($4::text[]) AND id<>$5", [ctx.institutionId, d.title, d.body.slice(0, 200), roles, user.id]);
    await audit(user, "announcement.created", "announcement", a.id, { recipients: n.rowCount }, q);
    return { id: a.id, recipients: n.rowCount };
  });
}

export async function listAnnouncements(user: SessionUser) {
  if (!user.institutionId) throw forbidden();
  const aud = user.role === "student" ? ["all", "students"] : user.role === "parent" ? ["all", "parents"] : ["all", "staff", "students", "parents"];
  return (await query("SELECT a.id, a.title, a.body, a.audience, a.created_at, u.name author FROM announcements a JOIN users u ON u.id=a.created_by WHERE a.institution_id=$1 AND a.audience = ANY($2::text[]) ORDER BY a.created_at DESC LIMIT 50", [user.institutionId, aud])).rows;
}

export async function listNotifications(user: SessionUser) {
  return (await query("SELECT id, title, body, link, read_at, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", [user.id])).rows;
}
export async function unreadCount(user: SessionUser) {
  return Number((await one<{ n: string }>("SELECT count(*) n FROM notifications WHERE user_id=$1 AND read_at IS NULL", [user.id]))!.n);
}
export async function markNotificationsRead(user: SessionUser) {
  await query("UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL", [user.id]);
}

/** Course+section combinations the user may teach: faculty by timetable, admin/HOD by program. */
export async function teachingOptions(user: SessionUser) {
  const ctx = authorize(user, "attendance.read");
  if (user.role === "faculty") {
    return (await query(`SELECT DISTINCT c.id course_id, c.code, c.name course, s.id section_id, s.name section, s.year_no, p.name program FROM timetable_slots t
      JOIN courses c ON c.id=t.course_id JOIN sections s ON s.id=t.section_id JOIN programs p ON p.id=s.program_id WHERE t.institution_id=$1 AND t.faculty_user_id=$2 ORDER BY c.code`, [ctx.institutionId, user.id])).rows as TeachOpt[];
  }
  return (await query(`SELECT c.id course_id, c.code, c.name course, s.id section_id, s.name section, s.year_no, p.name program FROM courses c
    JOIN sections s ON s.program_id=c.program_id AND s.institution_id=c.institution_id JOIN programs p ON p.id=c.program_id WHERE c.institution_id=$1 ORDER BY p.name, c.code, s.year_no, s.name`, [ctx.institutionId])).rows as TeachOpt[];
}
export type TeachOpt = { course_id: string; code: string; course: string; section_id: string; section: string; year_no: number; program: string };

export async function facultyList(user: SessionUser) {
  const ctx = authorize(user, "timetable.manage");
  return (await query("SELECT id, name FROM users WHERE institution_id=$1 AND role IN ('faculty','hod') AND active ORDER BY name", [ctx.institutionId])).rows as { id: string; name: string }[];
}
