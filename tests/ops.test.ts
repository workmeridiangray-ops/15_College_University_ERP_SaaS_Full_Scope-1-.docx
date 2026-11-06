import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, makeInstitution, seedAcademics, makeFaculty } from "./helpers";
import { createStudent } from "@/services/students";
import { listInvoices } from "@/services/fees";
import * as lib from "@/services/library";
import * as hr from "@/services/hr";
import * as pf from "@/services/platform";
import { login, authorize, userFromToken } from "@/lib/session";
import { query } from "@/lib/db";

let A: Awaited<ReturnType<typeof makeInstitution>>, B: Awaited<ReturnType<typeof makeInstitution>>;
let acad: Awaited<ReturnType<typeof seedAcademics>>;
let librarian: Awaited<ReturnType<typeof makeFaculty>>, hrm: Awaited<ReturnType<typeof makeFaculty>>, fac: Awaited<ReturnType<typeof makeFaculty>>;
let student: string;
let sa: NonNullable<Awaited<ReturnType<typeof userFromToken>>>;

beforeAll(async () => {
  await freshDb();
  A = await makeInstitution("Alpha College", "admin@alpha.test");
  B = await makeInstitution("Beta University", "admin@beta.test");
  acad = await seedAcademics(A.admin, "A");
  librarian = await makeFaculty(A.admin, "lib@alpha.test", "librarian");
  hrm = await makeFaculty(A.admin, "hr@alpha.test", "hr_manager");
  fac = await makeFaculty(A.admin, "fac@alpha.test", "faculty");
  student = (await createStudent(A.admin, { name: "Book Worm", email: "bw@m.test", programId: acad.program })).studentId;
  await pf.bootstrapSuperAdmin("root@platform.test", "RootPassw0rd!");
  sa = (await login("root@platform.test", "RootPassw0rd!")).user;
});

describe("library", () => {
  let book: string, issue: string;
  it("issues books, tracks copies and enforces limits", async () => {
    book = await lib.addBook(librarian.user, { title: "Algorithms", author: "CLRS", copies: 1 });
    issue = await lib.issueBook(librarian.user, book, student);
    await expect(lib.issueBook(librarian.user, book, student)).rejects.toThrow(/No copies/);
    const book2 = await lib.addBook(librarian.user, { title: "Networks", author: "Tanenbaum", copies: 5 });
    await expect(lib.issueBook(librarian.user, book2, student, 99)).rejects.toThrow(/between 1 and 60/);
    const other = await createStudent(A.admin, { name: "Other Reader", email: "or@m.test", programId: acad.program });
    for (let i = 0; i < 3; i++) await lib.issueBook(librarian.user, await lib.addBook(librarian.user, { title: "T" + i, author: "Auth", copies: 2 }), other.studentId);
    await expect(lib.issueBook(librarian.user, book2, other.studentId)).rejects.toThrow(/3 books out/);
  });
  it("returns late books with a fine invoice, and cannot return twice", async () => {
    await query("UPDATE book_issues SET due_on = current_date - 5 WHERE id=$1", [issue]);
    expect((await lib.openIssues(librarian.user, true)).length).toBeGreaterThan(0);
    const r = await lib.returnBook(librarian.user, issue);
    expect(r.finePaise).toBe(1000);
    expect(r.invoiceNo).toMatch(/^INV-/);
    const inv = (await listInvoices(A.admin, { studentId: student })).find((i: any) => i.description.startsWith("Library fine")) as any;
    expect(Number(inv.amount_paise)).toBe(1000);
    await expect(lib.returnBook(librarian.user, issue)).rejects.toThrow(/already been returned/);
    expect(Number(((await query("SELECT copies_available n FROM books WHERE id=$1", [book])).rows[0] as any).n)).toBe(1);
  });
  it("is isolated per institution and per permission", async () => {
    await expect(lib.issueBook(B.admin, book, student)).rejects.toThrow(/not found/i);
    await expect(lib.returnBook(B.admin, issue)).rejects.toThrow(/not found/i);
    await expect(lib.addBook(fac.user, { title: "X1", author: "Y1", copies: 1 })).rejects.toThrow(/permission/);
    expect((await lib.listBooks(B.admin)).length).toBe(0);
  });
});

describe("HR and payroll", () => {
  const prev = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1));
  const month = prev.toISOString().slice(0, 7);
  const dim = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).getUTCDate();
  it("computes payslips exactly", () => {
    expect(hr.computePayslip(4_000_000, 3, 31)).toEqual({ grossPaise: 4_000_000, deductionsPaise: 387097, netPaise: 3_612_903 });
    expect(hr.computePayslip(4_000_000, 0, 30).netPaise).toBe(4_000_000);
    expect(hr.daysBetweenInclusive("2026-10-05", "2026-10-07")).toBe(3);
  });
  it("enforces paid-leave balance and overlap rules", async () => {
    await expect(hr.requestLeave(fac.user, { fromDate: `${month}-10`, toDate: `${month}-05`, kind: "unpaid" })).rejects.toThrow(/before the start/);
    await expect(hr.requestLeave(fac.user, { fromDate: `${month}-01`, toDate: `${month}-20`, kind: "paid" })).rejects.toThrow(/balance is 12/);
    await hr.requestLeave(fac.user, { fromDate: `${month}-05`, toDate: `${month}-07`, kind: "unpaid", reason: "Family" });
    await expect(hr.requestLeave(fac.user, { fromDate: `${month}-06`, toDate: `${month}-08`, kind: "unpaid" })).rejects.toThrow(/overlapping/);
  });
  it("lets HR approve, but never one's own request, and not twice", async () => {
    const id = ((await hr.pendingLeaves(hrm.user)).find((l: any) => l.name.includes("fac@")) as any).id;
    await hr.decideLeave(hrm.user, id, "approved");
    await expect(hr.decideLeave(hrm.user, id, "rejected")).rejects.toThrow(/already approved/);
    await hr.requestLeave(hrm.user, { fromDate: `${month}-20`, toDate: `${month}-20`, kind: "paid" });
    const own = ((await hr.pendingLeaves(hrm.user)).find((l: any) => l.status === "pending") as any).id;
    await expect(hr.decideLeave(hrm.user, own, "approved")).rejects.toThrow(/own leave/);
    await expect(hr.decideLeave(fac.user, own, "approved")).rejects.toThrow(/permission/);
  });
  it("runs payroll once per month with unpaid-leave deduction", async () => {
    await query("UPDATE staff SET joined_on='2020-01-01'");
    await expect(hr.runPayroll(hrm.user, "2999-01")).rejects.toThrow(/future/);
    const run = await hr.runPayroll(hrm.user, month);
    await expect(hr.runPayroll(hrm.user, month)).rejects.toThrow(/already been run/);
    const slips = await hr.runPayslips(hrm.user, run.runId);
    const mine = slips.find((s: any) => s.name.includes("fac@")) as any;
    expect(mine.unpaid_leave_days).toBe(3);
    expect(Number(mine.deductions_paise)).toBe(Math.round((4_000_000 * 3) / dim));
    expect(Number(mine.net_paise)).toBe(4_000_000 - Math.round((4_000_000 * 3) / dim));
    expect((await hr.myPayslips(fac.user)).length).toBe(1);
    await expect(hr.runPayslips(B.admin, run.runId)).rejects.toThrow(/permission|not found/i);
  });
});

describe("platform / super admin", () => {
  it("only super admins can use platform tools; super admins cannot enter tenant data", async () => {
    await expect(pf.listInstitutions(A.admin)).rejects.toThrow(/permission/);
    expect((await pf.listInstitutions(sa)).length).toBe(2);
    expect(() => authorize(sa, "students.read")).toThrow(/inside an institution/);
    expect((await pf.platformStats(sa)).institutions).toBe(2);
  });
  it("suspending an institution kills sessions and blocks logins", async () => {
    await pf.setInstitutionStatus(sa, B.institutionId, "suspended", "non-payment");
    expect(await userFromToken(B.token)).toBeNull(); // existing sessions are revoked immediately
    const relog = await login("admin@beta.test", "Passw0rd!long"); // may sign in, but every action is refused
    expect(() => authorize(relog.user, "students.read")).toThrow(/suspended/);
    await pf.setInstitutionStatus(sa, B.institutionId, "active");
    const reloaded = (await userFromToken(relog.token))!; // each real request reloads the user
    expect(() => authorize(reloaded, "students.read")).not.toThrow();
  });
  it("blocks downgrades below current usage", async () => {
    await expect(pf.changePlan(sa, A.institutionId, "starter")).resolves.toBeUndefined(); // tiny usage fits
    await query("UPDATE plans SET max_students=1 WHERE code='starter'");
    await expect(pf.changePlan(sa, A.institutionId, "starter")).rejects.toThrow(/exceeds the limits/);
  });
  it("refuses a second bootstrap", async () => {
    await expect(pf.bootstrapSuperAdmin("evil@x.test", "EvilPassw0rd!")).rejects.toThrow(/already exists/);
  });
});

describe("support tickets", () => {
  it("scopes tickets to the author, their institution admin, and super admin", async () => {
    const t = await pf.createTicket(fac.user, { subject: "Cannot mark attendance", body: "Button does nothing" });
    expect((await pf.listTickets(fac.user)).length).toBe(1);
    expect((await pf.listTickets(librarian.user)).length).toBe(0);
    await expect(pf.ticketThread(librarian.user, t)).rejects.toThrow(/not found/i);
    await expect(pf.ticketThread(B.admin, t)).rejects.toThrow(/not found/i);
    expect((await pf.ticketThread(A.admin, t)).messages.length).toBe(1);
    await pf.replyTicket(sa, t, "We have fixed this.");
    expect(((await pf.ticketThread(fac.user, t)).ticket as any).status).toBe("answered");
    await pf.closeTicket(fac.user, t);
    await expect(pf.replyTicket(fac.user, t, "thanks")).rejects.toThrow(/closed/);
  });
});
