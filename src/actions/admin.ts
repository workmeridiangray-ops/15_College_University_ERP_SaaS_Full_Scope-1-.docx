"use server";
import { guard, requireSession, str, type FormState } from "@/lib/web";
import * as core from "@/services/core";
import * as st from "@/services/students";
import * as ac from "@/services/academics";
import * as fe from "@/services/fees";
import * as lib from "@/services/library";
import * as hr from "@/services/hr";
import * as pf from "@/services/platform";
import { deliverLink } from "./shared";

const obj = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$ACTION")).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
const A = (fn: (u: Awaited<ReturnType<typeof requireSession>>, fd: FormData) => Promise<Partial<NonNullable<FormState>> | void>) =>
  async (_: FormState, fd: FormData): Promise<FormState> => guard(async () => fn(await requireSession(), fd));

/* ---- Settings, users ---- */
export const updateProfile = A(async (u, fd) => { await core.updateInstitutionProfile(u, obj(fd)); return { message: "Institution profile saved." }; });
export const createStaff = A(async (u, fd) => { await core.createStaffUser(u, obj(fd)); return { message: `Account created for ${str(fd, "email")}. They will be asked to choose their own password at first sign-in.` }; });
export const toggleUser = A(async (u, fd) => { await core.setUserActive(u, str(fd, "id"), str(fd, "active") === "true"); return { message: "Updated." }; });
export const resetLinkFor = A(async (u, fd) => { const t = await core.issueResetLink(u, str(fd, "id")); return deliverLink(str(fd, "email"), "Reset your Campus ERP password", "An administrator issued a password reset link for your account.", t); });

/* ---- Academic structure ---- */
export const addDepartment = A(async (u, fd) => { await core.createDepartment(u, obj(fd)); return { message: "Department added." }; });
export const addProgram = A(async (u, fd) => { await core.createProgram(u, obj(fd)); return { message: "Program added." }; });
export const addSection = A(async (u, fd) => { await core.createSection(u, obj(fd)); return { message: "Section added." }; });
export const addCourse = A(async (u, fd) => { await core.createCourse(u, obj(fd)); return { message: "Course added." }; });

/* ---- Students & admissions ---- */
export const addStudent = A(async (u, fd) => {
  const r = await st.createStudent(u, obj(fd));
  const d = await deliverLink(str(fd, "email"), "Welcome to Campus ERP", "Your student account is ready. Choose a password to activate it.", r.setupToken);
  return { message: `Student created with enrolment number ${r.enrolmentNo}. ${d.message}`, data: d.data };
});
export const addGuardian = A(async (u, fd) => {
  const r = await st.addGuardian(u, str(fd, "studentId"), obj(fd));
  if (!r.setupToken) return { message: "Linked to the existing parent account (no new login needed)." };
  const d = await deliverLink(str(fd, "email"), "Your parent portal account", "You have been added as a guardian. Choose a password to activate your account.", r.setupToken);
  return { message: d.message, data: d.data };
});
export const setStudentStatus = A(async (u, fd) => { await st.updateStudentStatus(u, str(fd, "id"), str(fd, "status") as never); return { message: "Status updated." }; });
export const decideApp = A(async (u, fd) => {
  const r = await st.decideApplication(u, str(fd, "id"), str(fd, "status") as never, str(fd, "remarks") || undefined);
  if (r.setupToken) {
    const d = await deliverLink(str(fd, "email"), "You are admitted", `Congratulations, you have been admitted. Your enrolment number is ${r.enrolmentNo}. Choose a password to activate your account.`, r.setupToken);
    return { message: `Admitted as ${r.enrolmentNo}. ${d.message}`, data: d.data };
  }
  return { message: "Application updated." };
});

/* ---- Timetable, attendance, assignments, exams ---- */
export const addSlot = A(async (u, fd) => { await ac.createSlot(u, obj(fd)); return { message: "Class added to the timetable." }; });
export const removeSlot = A(async (u, fd) => { await ac.deleteSlot(u, str(fd, "id")); });
export const saveAttendance = A(async (u, fd) => {
  const entries = [...fd.keys()].filter((k) => k.startsWith("s_")).map((k) => ({ studentId: k.slice(2), status: str(fd, k) }));
  const r = await ac.markAttendance(u, { courseId: str(fd, "courseId"), sectionId: str(fd, "sectionId"), date: str(fd, "date"), entries });
  return { message: `Attendance saved for ${r.saved} students.` };
});
export const addAssignment = A(async (u, fd) => { await ac.createAssignment(u, obj(fd)); return { message: "Assignment published to the section." }; });
export const grade = A(async (u, fd) => { await ac.gradeSubmission(u, str(fd, "id"), Number(str(fd, "marks")), str(fd, "feedback")); return { message: "Graded." }; });
export const submitWork = A(async (u, fd) => { await ac.submitAssignment(u, str(fd, "id"), str(fd, "body")); return { message: "Submitted. You can resubmit until the deadline or until it is graded." }; });
export const addExam = A(async (u, fd) => { await ac.createExam(u, obj(fd)); return { message: "Exam created." }; });
export const saveMarks = A(async (u, fd) => {
  const entries = [...fd.keys()].filter((k) => k.startsWith("m_") && str(fd, k) !== "").map((k) => { const id = k.slice(2); const v = str(fd, "v_" + id); return { studentId: id, marks: Number(str(fd, k)), version: v ? Number(v) : undefined }; });
  if (!entries.length) { const { invalid } = await import("@/lib/errors"); throw invalid("Enter at least one mark."); }
  const r = await ac.enterMarks(u, str(fd, "examId"), entries);
  return { message: `Saved marks for ${r.saved} students.` };
});
export const publish = A(async (u, fd) => { await ac.setPublished(u, str(fd, "id"), str(fd, "publish") === "true"); return { message: "Updated." }; });
export const announce = A(async (u, fd) => { const r = await ac.createAnnouncement(u, obj(fd)); return { message: `Sent to ${r.recipients} people.` }; });
export const readAll = A(async (u) => { await ac.markNotificationsRead(u); });

/* ---- Fees ---- */
export const addFeeStructure = A(async (u, fd) => { await fe.createFeeStructure(u, obj(fd)); return { message: "Fee structure created. Generate invoices when ready." }; });
export const generate = A(async (u, fd) => { const r = await fe.generateInvoices(u, str(fd, "id")); return { message: r.created ? `Created ${r.created} invoice(s).` : "Every eligible student already has this invoice." }; });
export const concession = A(async (u, fd) => { await fe.setConcession(u, str(fd, "id"), Number(str(fd, "amount")), Number(str(fd, "version"))); return { message: "Concession saved." }; });
export const payOffline = A(async (u, fd) => { const r = await fe.recordPayment(u, { ...obj(fd), amount: Number(str(fd, "amount")) }); return { message: r.duplicate ? `This payment was already recorded (receipt ${r.receiptNo}).` : `Payment recorded. Receipt ${r.receiptNo}.` }; });
export const cancelInv = A(async (u, fd) => { await fe.cancelInvoice(u, str(fd, "id")); return { message: "Invoice cancelled." }; });

/* ---- Library ---- */
export const addBook = A(async (u, fd) => { await lib.addBook(u, obj(fd)); return { message: "Book added." }; });
export const issue = A(async (u, fd) => { await lib.issueBook(u, str(fd, "bookId"), str(fd, "studentId"), Number(str(fd, "days") || 14)); return { message: "Book issued." }; });
export const giveBack = A(async (u, fd) => { const r = await lib.returnBook(u, str(fd, "id")); return { message: r.finePaise ? `Returned late. Fine invoice ${r.invoiceNo} raised.` : "Returned." }; });

/* ---- HR ---- */
export const requestLeave = A(async (u, fd) => { await hr.requestLeave(u, obj(fd)); return { message: "Leave request sent for approval." }; });
export const decideLeave = A(async (u, fd) => { await hr.decideLeave(u, str(fd, "id"), str(fd, "status") as never); });
export const payroll = A(async (u, fd) => { const r = await hr.runPayroll(u, str(fd, "month")); return { message: `Payroll generated for ${r.staff} staff.` }; });
export const salary = A(async (u, fd) => { await hr.updateSalary(u, str(fd, "id"), Number(str(fd, "amount"))); return { message: "Salary updated." }; });

/* ---- Support & platform ---- */
export const newTicket = A(async (u, fd) => { await pf.createTicket(u, obj(fd)); return { message: "Ticket sent. We will reply here." }; });
export const reply = A(async (u, fd) => { await pf.replyTicket(u, str(fd, "id"), str(fd, "body")); return { message: "Reply sent." }; });
export const closeTicket = A(async (u, fd) => { await pf.closeTicket(u, str(fd, "id")); });
export const setInstStatus = A(async (u, fd) => { await pf.setInstitutionStatus(u, str(fd, "id"), str(fd, "status") as never, str(fd, "reason") || undefined); return { message: "Status updated." }; });
export const setPlan = A(async (u, fd) => { await pf.changePlan(u, str(fd, "id"), str(fd, "plan")); return { message: "Plan changed." }; });
export const extend = A(async (u, fd) => { await pf.extendTrial(u, str(fd, "id"), Number(str(fd, "days"))); return { message: "Trial extended." }; });
export const adminLink = A(async (u, fd) => { const t = await pf.issueAdminResetLink(u, str(fd, "id")); const { appUrl } = await import("@/lib/mail"); return { message: "Share this one-time link with the institution's administrator:", data: { link: `${appUrl()}/reset-password?token=${t}` } }; });
