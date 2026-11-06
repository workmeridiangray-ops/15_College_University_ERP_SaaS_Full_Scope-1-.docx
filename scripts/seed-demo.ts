import { migrate } from "../src/lib/migrate";
import { query } from "../src/lib/db";
import { login, userFromToken } from "../src/lib/session";
import { resetPassword, signupInstitution, createStaffUser, createDepartment, createProgram, createSection, createCourse } from "../src/services/core";
import { createStudent, addGuardian, submitApplication } from "../src/services/students";
import { createSlot, markAttendance, createExam, enterMarks, setPublished, createAnnouncement, createAssignment } from "../src/services/academics";
import { createFeeStructure, generateInvoices, listInvoices, recordPayment } from "../src/services/fees";
import { addBook, issueBook } from "../src/services/library";
import { bootstrapSuperAdmin } from "../src/services/platform";

/**
 * DEMO DATA ONLY. Creates one institution flagged is_demo=true (excluded from platform statistics) with fictional people.
 * Never run against a production database: refuses unless ALLOW_DEMO_SEED=1.
 */
const PW = "Demo@12345678";
const D = "demo.campus.test";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") throw new Error("Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=1 only on a throwaway environment.");
  await migrate();
  if ((await query("SELECT 1 FROM institutions WHERE slug='demo-institute'")).rowCount) { console.log("Demo institution already exists. Nothing to do."); return; }
  await signupInstitution({ institutionName: "Demo Institute of Technology", adminName: "Demo Principal", email: `admin@${D}`, password: PW, planCode: "growth" }, { isDemo: true });
  await query("UPDATE institutions SET slug='demo-institute', status='active' WHERE contact_email=$1", [`admin@${D}`]);
  const admin = (await userFromToken((await login(`admin@${D}`, PW)).token))!;
  await query("UPDATE users SET must_change_password=false WHERE institution_id=$1", [admin.institutionId]);

  const staff: Record<string, string> = {};
  for (const [role, name] of [["faculty", "Dr. Meera Iyer"], ["faculty", "Prof. Rahul Verma"], ["hod", "Dr. Anil Kapoor"], ["accountant", "Sunita Rao"], ["librarian", "Kiran Shah"], ["hr_manager", "Pooja Menon"], ["admissions_officer", "Vikram Singh"]] as const) {
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/\.$/, "")}@${D}`;
    staff[name] = await createStaffUser(admin, { name, email, role, password: PW, designation: role === "faculty" ? "Assistant Professor" : role.replace("_", " "), baseSalary: 45000 });
    await query("UPDATE users SET must_change_password=false WHERE id=$1", [staff[name]]);
  }
  const dep = await createDepartment(admin, { name: "Computer Science", code: "CS" });
  const prog = await createProgram(admin, { name: "BSc Computer Science", code: "BSCCS", departmentId: dep, durationYears: 3, seats: 60 });
  const secA = await createSection(admin, { programId: prog, name: "A", yearNo: 1 });
  const c1 = await createCourse(admin, { programId: prog, code: "CS101", name: "Programming Fundamentals", credits: 4, semester: 1 });
  const c2 = await createCourse(admin, { programId: prog, code: "CS102", name: "Discrete Mathematics", credits: 3, semester: 1 });
  await createSlot(admin, { sectionId: secA, courseId: c1, facultyUserId: staff["Dr. Meera Iyer"], room: "LH-1", weekday: 1, startTime: "09:00", endTime: "10:00" });
  await createSlot(admin, { sectionId: secA, courseId: c2, facultyUserId: staff["Prof. Rahul Verma"], room: "LH-2", weekday: 1, startTime: "10:00", endTime: "11:00" });

  const names = ["Aarav Sharma", "Diya Patel", "Rohan Gupta", "Ananya Reddy", "Ishaan Nair", "Kavya Menon"];
  const sids: string[] = [];
  for (const n of names) {
    const email = `${n.toLowerCase().replace(/ /g, ".")}@${D}`;
    const r = await createStudent(admin, { name: n, email, programId: prog, sectionId: secA });
    await resetPassword(r.setupToken, PW);
    sids.push(r.studentId);
  }
  const g = await addGuardian(admin, sids[0], { name: "Mr. Sharma", relation: "Father", email: `parent.sharma@${D}`, phone: "9876500001" });
  await resetPassword(g.setupToken!, PW);

  const fac = (await userFromToken((await login(`dr.meera.iyer@${D}`, PW)).token))!;
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const [i, date] of [yest, today].entries()) await markAttendance(fac, { courseId: c1, sectionId: secA, date, entries: sids.map((id, k) => ({ studentId: id, status: k === 3 && i === 0 ? "absent" : "present" })) });
  const e1 = await createExam(fac, { courseId: c1, sectionId: secA, name: "Midterm", maxMarks: 50, weightPct: 40 });
  const e2 = await createExam(fac, { courseId: c1, sectionId: secA, name: "Final", maxMarks: 100, weightPct: 60 });
  await enterMarks(fac, e1, sids.map((id, k) => ({ studentId: id, marks: 30 + k * 3 })));
  await enterMarks(fac, e2, sids.map((id, k) => ({ studentId: id, marks: 55 + k * 7 })));
  await setPublished(fac, e1, true); await setPublished(fac, e2, true);
  await createAssignment(fac, { courseId: c1, sectionId: secA, title: "Lab 1: Loops and functions", dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), maxMarks: 20, description: "Solve the five problems in the handout." });

  const fs = await createFeeStructure(admin, { programId: prog, name: "Semester 1 tuition", amount: 45000, dueOn: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10) });
  await generateInvoices(admin, fs);
  const acc = (await userFromToken((await login(`sunita.rao@${D}`, PW)).token))!;
  const invs = (await listInvoices(acc)) as any[];
  await recordPayment(acc, { invoiceId: invs[0].id, amount: 45000, method: "upi", reference: "DEMO-UPI-1", idempotencyKey: "demo-seed-pay-1" });
  await recordPayment(acc, { invoiceId: invs[1].id, amount: 20000, method: "cash", idempotencyKey: "demo-seed-pay-2" });

  const lib = (await userFromToken((await login(`kiran.shah@${D}`, PW)).token))!;
  const b = await addBook(lib, { title: "Introduction to Algorithms", author: "Cormen et al.", copies: 3 });
  await addBook(lib, { title: "Discrete Mathematics and Its Applications", author: "Rosen", copies: 2 });
  await issueBook(lib, b, sids[1]);
  await createAnnouncement(admin, { title: "Welcome to the demo institute", body: "This is sample content in a demo workspace. Nothing here is real.", audience: "all" });
  await submitApplication({ institutionSlug: "demo-institute", programId: prog, name: "Neha Joshi", email: "neha.joshi@applicant.test", phone: "9876500009", previousPercentage: 91.2 });
  await bootstrapSuperAdmin(`platform@${D}`, PW).catch(() => undefined);
  console.log(`Demo institution ready (flagged is_demo).\nPassword for every demo account: ${PW}\n  Admin    admin@${D}\n  Faculty  dr.meera.iyer@${D}\n  Accounts sunita.rao@${D}\n  Library  kiran.shah@${D}\n  HR       pooja.menon@${D}\n  Student  aarav.sharma@${D}\n  Parent   parent.sharma@${D}\n  Platform platform@${D} (only if no super admin existed)\nApply page: /apply/demo-institute`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
