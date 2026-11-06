import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, makeInstitution, seedAcademics, makeFaculty } from "./helpers";
import { submitApplication, trackApplication, decideApplication, listApplications, createStudent, addGuardian, portalStudentIds, assertPortalAccess } from "@/services/students";
import { createFeeStructure, generateInvoices, listInvoices, recordPayment, setConcession, handleWebhook, collectionSummary, duesReport, duesCsv, studentInvoices, cancelInvoice } from "@/services/fees";
import { resetPassword } from "@/services/core";
import { login, userFromToken } from "@/lib/session";
import { toCsv } from "@/lib/csv";
import { query } from "@/lib/db";

let A: Awaited<ReturnType<typeof makeInstitution>>, B: Awaited<ReturnType<typeof makeInstitution>>;
let acad: Awaited<ReturnType<typeof seedAcademics>>, bAcad: Awaited<ReturnType<typeof seedAcademics>>;
let slugA: string;

beforeAll(async () => {
  await freshDb();
  A = await makeInstitution("Alpha College", "admin@alpha.test");
  B = await makeInstitution("Beta University", "admin@beta.test");
  acad = await seedAcademics(A.admin, "A");
  bAcad = await seedAcademics(B.admin, "B");
  slugA = A.slug;
});

describe("admissions", () => {
  let appId: string, code: string;
  it("accepts a public application and lets the applicant track it", async () => {
    const r = await submitApplication({ institutionSlug: slugA, programId: acad.program, name: "Riya Sen", email: "riya@mail.test", phone: "9876543210", previousPercentage: 88.5 });
    code = r.trackingCode;
    expect((await trackApplication(code, "riya@mail.test")).status).toBe("submitted");
    await expect(trackApplication(code, "other@mail.test")).rejects.toThrow(/No application/);
    appId = (await listApplications(A.admin))[0].id as string;
  });
  it("rejects duplicate applications and applications to another institution's program", async () => {
    await expect(submitApplication({ institutionSlug: slugA, programId: acad.program, name: "Riya Sen", email: "riya@mail.test", phone: "9876543210", previousPercentage: 80 })).rejects.toThrow(/already applied/);
    await expect(submitApplication({ institutionSlug: slugA, programId: bAcad.program, name: "Mallory", email: "m@mail.test", phone: "9876543210", previousPercentage: 80 })).rejects.toThrow(/not found/i);
  });
  it("enforces the state machine and creates exactly one student when accepted twice concurrently", async () => {
    await expect(decideApplication(A.admin, appId, "accepted")).rejects.toThrow(/cannot be moved/);
    await decideApplication(A.admin, appId, "under_review");
    await decideApplication(A.admin, appId, "shortlisted");
    const [r1, r2] = await Promise.allSettled([decideApplication(A.admin, appId, "accepted"), decideApplication(A.admin, appId, "accepted")]);
    expect([r1.status, r2.status]).toEqual(["fulfilled", "fulfilled"]);
    const n = (await query("SELECT count(*)::int n FROM students WHERE email='riya@mail.test'")).rows[0] as any;
    expect(n.n).toBe(1);
    const accepted = r1.status === "fulfilled" && r1.value.setupToken ? r1.value : (r2 as any).value;
    expect(accepted.enrolmentNo).toMatch(/^2026BSCA0001$/);
    // the new student activates their account via the one-time link
    await resetPassword(accepted.setupToken, "StudentPass123");
    const { user } = await login("riya@mail.test", "StudentPass123");
    expect(user.role).toBe("student");
  });
  it("blocks acceptance once program seats are full", async () => {
    await query("UPDATE programs SET seats=1 WHERE id=$1", [acad.program]);
    await submitApplication({ institutionSlug: slugA, programId: acad.program, name: "Late Comer", email: "late@mail.test", phone: "9876543211", previousPercentage: 70 });
    const late = (await listApplications(A.admin, "submitted"))[0].id as string;
    await decideApplication(A.admin, late, "under_review"); await decideApplication(A.admin, late, "shortlisted");
    await expect(decideApplication(A.admin, late, "accepted")).rejects.toThrow(/no seats left/);
    await query("UPDATE programs SET seats=60 WHERE id=$1", [acad.program]);
  });
});

describe("fees and payments", () => {
  let studentId: string, invoiceId: string, version: number;
  it("generates invoices once per student even if run twice", async () => {
    const s = await createStudent(A.admin, { name: "Arjun Das", email: "arjun@mail.test", programId: acad.program, sectionId: acad.section });
    studentId = s.studentId;
    const fs = await createFeeStructure(A.admin, { programId: acad.program, name: "Semester 1 Tuition", amount: 50000, dueOn: "2026-12-31" });
    const first = await generateInvoices(A.admin, fs);
    const second = await generateInvoices(A.admin, fs);
    expect(first.created).toBe(2); // Riya + Arjun
    expect(second.created).toBe(0);
    const inv = (await listInvoices(A.admin, { studentId }))[0] as any;
    invoiceId = inv.id; version = inv.version;
    expect(Number(inv.balance_paise)).toBe(5_000_000);
  });
  it("applies concessions, with version conflict detection", async () => {
    await setConcession(A.admin, invoiceId, 5000, version);
    await expect(setConcession(A.admin, invoiceId, 6000, version)).rejects.toThrow(/changed by someone else/);
    await expect(setConcession(A.admin, invoiceId, 60000)).rejects.toThrow(/cannot exceed/);
    expect(Number(((await listInvoices(A.admin, { studentId }))[0] as any).balance_paise)).toBe(4_500_000);
  });
  it("records partial payments, then full, with correct receipts and status", async () => {
    const acc = await makeFaculty(A.admin, "acct@alpha.test", "accountant");
    const p1 = await recordPayment(acc.user, { invoiceId, amount: 20000, method: "upi", reference: "UPI123", idempotencyKey: "key-aaaa-0001" });
    expect(p1.receiptNo).toMatch(/^RCP-2026-\d{6}$/);
    expect(((await listInvoices(A.admin, { studentId }))[0] as any).status).toBe("partial");
    await recordPayment(acc.user, { invoiceId, amount: 25000, method: "cash", idempotencyKey: "key-aaaa-0002" });
    const inv = (await listInvoices(A.admin, { studentId }))[0] as any;
    expect(inv.status).toBe("paid");
    expect(Number(inv.balance_paise)).toBe(0);
    await expect(recordPayment(acc.user, { invoiceId, amount: 1, method: "cash", idempotencyKey: "key-aaaa-0003" })).rejects.toThrow(/already fully paid/);
  });
  it("double-clicking Pay records one payment (idempotency)", async () => {
    const s = await createStudent(A.admin, { name: "Meera Nair", email: "meera@mail.test", programId: acad.program });
    const fs2 = await createFeeStructure(A.admin, { programId: acad.program, name: "Lab Fee", amount: 3000, dueOn: "2026-11-01" });
    await generateInvoices(A.admin, fs2);
    const inv = (await listInvoices(A.admin, { studentId: s.studentId }))[0] as any;
    const acc = (await userFromToken((await login("acct@alpha.test", "Passw0rd!long")).token))!;
    const [a, b] = await Promise.all([
      recordPayment(acc, { invoiceId: inv.id, amount: 1000, method: "cash", idempotencyKey: "dbl-click-0001" }),
      recordPayment(acc, { invoiceId: inv.id, amount: 1000, method: "cash", idempotencyKey: "dbl-click-0001" }),
    ]);
    expect(a.paymentId).toBe(b.paymentId);
    expect(Number(((await listInvoices(A.admin, { studentId: s.studentId }))[0] as any).balance_paise)).toBe(200_000);
    await expect(recordPayment(acc, { invoiceId: inv.id, amount: 5000, method: "cash", idempotencyKey: "over-pay-0001" })).rejects.toThrow(/exceeds the outstanding/);
  });
  it("blocks roles without fee permission and cross-tenant payments", async () => {
    const fac = await makeFaculty(A.admin, "fac@alpha.test");
    await expect(recordPayment(fac.user, { invoiceId, amount: 1, method: "cash", idempotencyKey: "nope-nope-01" })).rejects.toThrow(/permission/);
    await expect(recordPayment(B.admin, { invoiceId, amount: 1, method: "cash", idempotencyKey: "nope-nope-02" })).rejects.toThrow(/not found/i);
    await expect(setConcession(B.admin, invoiceId, 1)).rejects.toThrow(/not found/i);
    await expect(cancelInvoice(B.admin, invoiceId)).rejects.toThrow(/not found/i);
    expect((await listInvoices(B.admin)).length).toBe(0);
  });
  it("reports totals and dues consistently", async () => {
    const sum = await collectionSummary(A.admin);
    expect(sum.billedPaise - sum.collectedPaise).toBe(sum.outstandingPaise);
    const dues = await duesReport(A.admin);
    expect(dues.reduce((t: number, r: any) => t + Number(r.balance_paise), 0)).toBe(sum.outstandingPaise);
    expect(await duesCsv(A.admin)).toContain("Outstanding (INR)");
  });
  it("neutralises CSV formula injection", () => {
    expect(toCsv(["a"], [["=HYPERLINK(\"x\")"], ["+1"], ["ok, fine"]])).toBe('a\r\n\'=HYPERLINK("x")\r\n\'+1\r\n"ok, fine"\r\n'.replace("'=HYPERLINK(\"x\")", '"\'=HYPERLINK(""x"")"'));
  });
});

describe("online payment webhook", () => {
  const secret = "whsec_test_123";
  const sign = (body: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");
  let invoiceId: string, orderId = "order_TEST1";
  beforeAll(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    const s = await createStudent(A.admin, { name: "Web Hook", email: "wh@mail.test", programId: acad.program });
    const fs = await createFeeStructure(A.admin, { programId: acad.program, name: "Exam Fee", amount: 1000, dueOn: "2027-01-10" });
    await generateInvoices(A.admin, fs);
    invoiceId = ((await listInvoices(A.admin, { studentId: s.studentId }))[0] as any).id;
    await query("INSERT INTO payments (institution_id, invoice_id, amount_paise, method, status, provider_order_id) VALUES ($1,$2,100000,'online','pending',$3)", [A.institutionId, invoiceId, orderId]);
  });
  const evt = (event: string, amount = 100000) => JSON.stringify({ event, payload: { payment: { entity: { id: "pay_1", order_id: orderId, amount } } } });
  it("rejects forged signatures", async () => {
    await expect(handleWebhook(evt("payment.captured"), "deadbeef", "evt_x")).rejects.toThrow(/Invalid signature/);
  });
  it("rejects amount mismatches without settling", async () => {
    const body = evt("payment.captured", 50);
    await expect(handleWebhook(body, sign(body), "evt_mismatch")).rejects.toThrow(/mismatch/);
    expect(((await query("SELECT status FROM payments WHERE provider_order_id=$1", [orderId])).rows[0] as any).status).toBe("pending");
    // the failed attempt rolled back, so the same event id may be retried later
    expect((await query("SELECT 1 FROM webhook_events WHERE id='evt_mismatch'")).rowCount).toBe(0);
  });
  it("settles once and ignores replays", async () => {
    const body = evt("payment.captured");
    const first = await handleWebhook(body, sign(body), "evt_ok_1");
    const replay = await handleWebhook(body, sign(body), "evt_ok_1");
    const redelivered = await handleWebhook(body, sign(body), "evt_ok_2");
    expect(first.status).toBe("settled");
    expect(replay.status).toBe("duplicate");
    expect(redelivered.status).toBe("duplicate");
    expect(((await query("SELECT status FROM invoices WHERE id=$1", [invoiceId])).rows[0] as any).status).toBe("paid");
  });
});

describe("student and parent portal isolation", () => {
  it("parents see only their linked children, never other families or institutions", async () => {
    const s1 = await createStudent(A.admin, { name: "Child One", email: "c1@mail.test", programId: acad.program });
    const s2 = await createStudent(A.admin, { name: "Child Two", email: "c2@mail.test", programId: acad.program });
    const g = await addGuardian(A.admin, s1.studentId, { name: "Parent P", relation: "Mother", email: "parent@mail.test", phone: "9876500000" });
    await resetPassword(g.setupToken!, "ParentPass1234");
    const parent = (await login("parent@mail.test", "ParentPass1234")).user;
    expect(await portalStudentIds(parent)).toEqual([s1.studentId]);
    await expect(assertPortalAccess(parent, s2.studentId)).rejects.toThrow(/not found/i);
    await expect(studentInvoices(parent, s2.studentId)).rejects.toThrow(/not found/i);
    // sibling is linked to the same parent account rather than duplicated
    const g2 = await addGuardian(A.admin, s2.studentId, { name: "Parent P", relation: "Mother", email: "parent@mail.test", phone: "9876500000" });
    expect(g2.setupToken).toBeNull();
    expect((await portalStudentIds(parent)).sort()).toEqual([s1.studentId, s2.studentId].sort());
    // a different institution cannot attach a guardian to Alpha's student
    await expect(addGuardian(B.admin, s1.studentId, { name: "Xavier", relation: "Father", email: "x@mail.test" })).rejects.toThrow(/not found/i);
  });
});
