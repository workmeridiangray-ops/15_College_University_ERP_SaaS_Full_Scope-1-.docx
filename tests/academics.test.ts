import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, makeInstitution, seedAcademics, makeFaculty } from "./helpers";
import { createStudent, addGuardian } from "@/services/students";
import { resetPassword, createDepartment } from "@/services/core";
import { login } from "@/lib/session";
import * as ac from "@/services/academics";
import { query } from "@/lib/db";

let A: Awaited<ReturnType<typeof makeInstitution>>, B: Awaited<ReturnType<typeof makeInstitution>>;
let acad: Awaited<ReturnType<typeof seedAcademics>>, bAcad: Awaited<ReturnType<typeof seedAcademics>>;
let fac: Awaited<ReturnType<typeof makeFaculty>>, other: Awaited<ReturnType<typeof makeFaculty>>;
let s1: string, s2: string, s3: string;

beforeAll(async () => {
  await freshDb();
  A = await makeInstitution("Alpha College", "admin@alpha.test");
  B = await makeInstitution("Beta University", "admin@beta.test");
  acad = await seedAcademics(A.admin, "A");
  bAcad = await seedAcademics(B.admin, "B");
  fac = await makeFaculty(A.admin, "fac@alpha.test");
  other = await makeFaculty(A.admin, "other@alpha.test");
  s1 = (await createStudent(A.admin, { name: "Student One", email: "s1@m.test", programId: acad.program, sectionId: acad.section })).studentId;
  s2 = (await createStudent(A.admin, { name: "Student Two", email: "s2@m.test", programId: acad.program, sectionId: acad.section })).studentId;
  s3 = (await createStudent(A.admin, { name: "Student Three", email: "s3@m.test", programId: acad.program, sectionId: acad.section })).studentId;
});

describe("timetable", () => {
  it("detects faculty, room and section clashes but allows adjacent slots", async () => {
    const base = { sectionId: acad.section, courseId: acad.course, facultyUserId: fac.id, room: "R101", weekday: 1, startTime: "09:00", endTime: "10:00" };
    await ac.createSlot(A.admin, base);
    await expect(ac.createSlot(A.admin, { ...base, startTime: "09:30", endTime: "10:30" })).rejects.toThrow(/Clash/);
    await expect(ac.createSlot(A.admin, { ...base, facultyUserId: other.id, room: "R999", startTime: "09:30", endTime: "10:30" })).rejects.toThrow(/section is already booked/);
    await expect(ac.createSlot(A.admin, { ...base, facultyUserId: other.id, sectionId: (await query("INSERT INTO sections (institution_id, program_id, name, year_no) VALUES ($1,$2,'B',1) RETURNING id", [A.institutionId, acad.program])).rows[0].id as string, startTime: "09:30", endTime: "10:30" })).rejects.toThrow(/room is already booked/);
    await ac.createSlot(A.admin, { ...base, startTime: "10:00", endTime: "11:00" });
    await expect(ac.createSlot(A.admin, { ...base, startTime: "12:00", endTime: "11:00" })).rejects.toThrow(/End time/);
  });
  it("rejects cross-tenant faculty and sections", async () => {
    await expect(ac.createSlot(A.admin, { sectionId: bAcad.section, courseId: acad.course, facultyUserId: fac.id, room: "Z", weekday: 2, startTime: "09:00", endTime: "10:00" })).rejects.toThrow(/not found/i);
    const bf = await makeFaculty(B.admin, "bfac@beta.test");
    await expect(ac.createSlot(A.admin, { sectionId: acad.section, courseId: acad.course, facultyUserId: bf.id, room: "Z", weekday: 2, startTime: "09:00", endTime: "10:00" })).rejects.toThrow(/active faculty/);
  });
});

describe("attendance", () => {
  const date = new Date().toISOString().slice(0, 10);
  it("only the assigned faculty can mark; others and future dates are rejected", async () => {
    const entries = [{ studentId: s1, status: "present" as const }, { studentId: s2, status: "absent" as const }, { studentId: s3, status: "late" as const }];
    await expect(ac.markAttendance(other.user, { courseId: acad.course, sectionId: acad.section, date, entries })).rejects.toThrow(/not assigned/);
    await expect(ac.markAttendance(fac.user, { courseId: acad.course, sectionId: acad.section, date: "2999-01-01", entries })).rejects.toThrow(/future/);
    await expect(ac.markAttendance(fac.user, { courseId: acad.course, sectionId: acad.section, date, entries: [{ studentId: crypto.randomUUID(), status: "present" }] })).rejects.toThrow(/not in this section/);
    expect((await ac.markAttendance(fac.user, { courseId: acad.course, sectionId: acad.section, date, entries })).saved).toBe(3);
  });
  it("re-marking updates instead of duplicating, and computes percentages", async () => {
    await ac.markAttendance(fac.user, { courseId: acad.course, sectionId: acad.section, date, entries: [{ studentId: s2, status: "present" }] });
    expect(Number(((await query("SELECT count(*) n FROM attendance WHERE student_id=$1", [s2])).rows[0] as any).n)).toBe(1);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await ac.markAttendance(fac.user, { courseId: acad.course, sectionId: acad.section, date: yesterday, entries: [{ studentId: s1, status: "absent" }] });
    const att = await ac.studentAttendance(A.admin, s1);
    expect(Number((att[0] as any).pct)).toBe(50);
    expect((await ac.lowAttendance(A.admin)).map((r: any) => r.id)).toContain(s1);
  });
  it("alerts the student when attendance drops below 75%", async () => {
    const u = (await query("SELECT user_id FROM students WHERE id=$1", [s1])).rows[0] as any;
    const n = (await query("SELECT title FROM notifications WHERE user_id=$1", [u.user_id])).rows as any[];
    expect(n.some((x) => x.title === "Low attendance")).toBe(true);
  });
});

describe("exams, marks and grades", () => {
  let exam1: string, exam2: string, student1User: any;
  it("keeps total exam weight within 100% and ties exams to taught courses", async () => {
    exam1 = await ac.createExam(fac.user, { courseId: acad.course, sectionId: acad.section, name: "Midterm", maxMarks: 50, weightPct: 40 });
    exam2 = await ac.createExam(fac.user, { courseId: acad.course, sectionId: acad.section, name: "Final", maxMarks: 100, weightPct: 60 });
    await expect(ac.createExam(fac.user, { courseId: acad.course, sectionId: acad.section, name: "Extra", maxMarks: 10, weightPct: 5 })).rejects.toThrow(/already total 100%/);
    await expect(ac.createExam(other.user, { courseId: acad.course, sectionId: acad.section, name: "Sneaky", maxMarks: 10, weightPct: 1 })).rejects.toThrow(/not assigned/);
  });
  it("validates marks, detects concurrent edits, and blocks publishing incomplete sheets", async () => {
    await expect(ac.enterMarks(fac.user, exam1, [{ studentId: s1, marks: 51 }])).rejects.toThrow(/between 0 and 50/);
    await ac.enterMarks(fac.user, exam1, [{ studentId: s1, marks: 40 }, { studentId: s2, marks: 25 }]);
    await expect(ac.setPublished(fac.user, exam1, true)).rejects.toThrow(/1 student\(s\) have no marks/);
    await ac.enterMarks(fac.user, exam1, [{ studentId: s3, marks: 50 }]);
    await expect(ac.enterMarks(fac.user, exam1, [{ studentId: s1, marks: 45, version: 99 }])).rejects.toThrow(/Another teacher changed/);
    const sheet = await ac.examSheet(fac.user, exam1);
    const v = (sheet.rows.find((r: any) => r.student_id === s1) as any).version;
    await ac.enterMarks(fac.user, exam1, [{ studentId: s1, marks: 45, version: v }]);
  });
  it("computes weighted percentage, grade and credit-weighted GPA; hides unpublished results", async () => {
    await ac.enterMarks(fac.user, exam2, [{ studentId: s1, marks: 80 }, { studentId: s2, marks: 60 }, { studentId: s3, marks: 95 }]);
    expect((await ac.transcript(A.admin, s1)).courses).toHaveLength(0);
    await ac.setPublished(fac.user, exam1, true);
    await ac.setPublished(fac.user, exam2, true);
    const t = await ac.transcript(A.admin, s1);
    // (45/50*40 + 80/100*60) / 100 = (36 + 48) = 84%
    expect(t.courses[0].percentage).toBe(84);
    expect(t.courses[0].grade).toBe("A");
    expect(t.gpa).toBe(9);
    await expect(ac.enterMarks(fac.user, exam1, [{ studentId: s1, marks: 10 }])).rejects.toThrow(/published/);
  });
  it("lets a student see only their own published results; parents likewise; outsiders get nothing", async () => {
    const su = (await query("SELECT user_id FROM students WHERE id=$1", [s1])).rows[0] as any;
    expect(su.user_id).toBeTruthy();
    const g = await addGuardian(A.admin, s1, { name: "Guardian G", relation: "Father", email: "g@m.test", phone: "9000000000" });
    await resetPassword(g.setupToken!, "GuardianPass123");
    const parent = (await login("g@m.test", "GuardianPass123")).user;
    expect((await ac.transcript(parent, s1)).courses).toHaveLength(1);
    await expect(ac.transcript(parent, s2)).rejects.toThrow(/not found/i);
    await expect(ac.transcript(B.admin, s1)).rejects.toThrow(/not found/i);
    await expect(ac.studentAttendance(parent, s3)).rejects.toThrow(/not found/i);
    student1User = parent;
  });
});

describe("assignments", () => {
  let aid: string;
  it("creates, accepts one editable submission per student, grades within range, blocks late work", async () => {
    aid = await ac.createAssignment(fac.user, { courseId: acad.course, sectionId: acad.section, title: "Lab 1", dueAt: new Date(Date.now() + 86400000).toISOString(), maxMarks: 10 });
    await expect(ac.createAssignment(fac.user, { courseId: acad.course, sectionId: acad.section, title: "Past", dueAt: "2020-01-01T00:00:00Z", maxMarks: 10 })).rejects.toThrow(/future/);
    const { setupToken } = await createStudent(A.admin, { name: "Login Student", email: "ls@m.test", programId: acad.program, sectionId: acad.section });
    await resetPassword(setupToken, "StudentPass1234");
    const stu = (await login("ls@m.test", "StudentPass1234")).user;
    await ac.submitAssignment(stu, aid, "my answer");
    await ac.submitAssignment(stu, aid, "my better answer");
    const subs = await ac.assignmentSubmissions(fac.user, aid);
    const mine = subs.find((r: any) => r.name === "Login Student") as any;
    expect(mine.body).toBe("my better answer");
    await expect(ac.gradeSubmission(fac.user, mine.submission_id, 11)).rejects.toThrow(/between 0 and 10/);
    await ac.gradeSubmission(fac.user, mine.submission_id, 9, "Good");
    await expect(ac.gradeSubmission(other.user, mine.submission_id, 5)).rejects.toThrow(/not assigned/);
    await query("UPDATE assignments SET due_at = now() - interval '1 hour' WHERE id=$1", [aid]);
    await expect(ac.submitAssignment(stu, aid, "late")).rejects.toThrow(/deadline/);
  });
});

describe("announcements", () => {
  it("delivers to the chosen audience within the institution only", async () => {
    const r = await ac.createAnnouncement(A.admin, { title: "Holiday notice", body: "College closed on Monday.", audience: "students" });
    expect(r.recipients).toBeGreaterThan(0);
    const bUsers = (await query("SELECT count(*) n FROM notifications WHERE title='Holiday notice' AND institution_id=$1", [B.institutionId])).rows[0] as any;
    expect(Number(bUsers.n)).toBe(0);
    expect((await ac.listAnnouncements(A.admin)).length).toBe(1);
    expect((await ac.listAnnouncements(B.admin)).length).toBe(0);
  });
});
