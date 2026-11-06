import crypto from "node:crypto";
import { z } from "zod";
import { one, query, tx } from "@/lib/db";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { authorize, type SessionUser } from "@/lib/session";
import { assertOwned, parse, type Q } from "./core";
import { assertPortalAccess, portalStudentIds } from "./students";
import { toCsv, toPaise } from "@/lib/csv";

const money = z.coerce.number().positive("Enter an amount greater than zero").max(100_000_000);

export async function createFeeStructure(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "fees.write", { write: true });
  const d = parse(z.object({ programId: z.string().uuid(), name: z.string().trim().min(2).max(80), amount: money, dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date") }), input);
  await assertOwned("programs", d.programId, ctx.institutionId);
  const r = await one<{ id: string }>("INSERT INTO fee_structures (institution_id, program_id, name, amount_paise, due_on) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [ctx.institutionId, d.programId, d.name, toPaise(d.amount), d.dueOn]);
  await audit(user, "fee_structure.created", "fee_structure", r!.id);
  return r!.id;
}

export async function listFeeStructures(user: SessionUser) {
  const ctx = authorize(user, "fees.read");
  return (await query(`SELECT f.*, p.name program, (SELECT count(*) FROM invoices i WHERE i.fee_structure_id=f.id) invoices
    FROM fee_structures f JOIN programs p ON p.id=f.program_id WHERE f.institution_id=$1 ORDER BY f.due_on DESC`, [ctx.institutionId])).rows;
}

export async function nextNumber(q: Q, institutionId: string, kind: "INV" | "RCP"): Promise<string> {
  await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${kind}:${institutionId}`]);
  const tbl = kind === "INV" ? "invoices" : "payments";
  const col = kind === "INV" ? "number" : "receipt_no";
  const n = Number((await q.query<{ n: string }>(`SELECT count(*) n FROM ${tbl} WHERE institution_id=$1 AND ${col} IS NOT NULL`, [institutionId])).rows[0].n) + 1;
  return `${kind}-${new Date().getFullYear()}-${String(n).padStart(6, "0")}`;
}

/** Generates one invoice per active student in the structure's program. Safe to run twice: existing invoices are skipped. */
export async function generateInvoices(user: SessionUser, structureId: string) {
  const ctx = authorize(user, "fees.write", { write: true });
  await assertOwned("fee_structures", structureId, ctx.institutionId);
  return tx(async (q) => {
    const fs = (await q.query<{ program_id: string; name: string; amount_paise: string; due_on: string }>("SELECT program_id, name, amount_paise, due_on FROM fee_structures WHERE id=$1", [structureId])).rows[0];
    const students = (await q.query<{ id: string }>(
      `SELECT s.id FROM students s WHERE s.institution_id=$1 AND s.program_id=$2 AND s.status='active'
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.student_id=s.id AND i.fee_structure_id=$3)`, [ctx.institutionId, fs.program_id, structureId])).rows;
    let created = 0;
    for (const s of students) {
      const number = await nextNumber(q, ctx.institutionId, "INV");
      await q.query("INSERT INTO invoices (institution_id, student_id, fee_structure_id, number, description, amount_paise, due_on) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [ctx.institutionId, s.id, structureId, number, fs.name, fs.amount_paise, fs.due_on]);
      created++;
    }
    await audit(user, "invoices.generated", "fee_structure", structureId, { created }, q);
    return { created, skipped: 0 };
  });
}

const BAL = `(i.amount_paise - i.concession_paise - COALESCE((SELECT sum(p.amount_paise) FROM payments p WHERE p.invoice_id=i.id AND p.status='succeeded'),0))`;

export async function invoiceBalance(q: Q, invoiceId: string): Promise<number> {
  const r = await q.query<{ bal: string }>(`SELECT ${BAL} AS bal FROM invoices i WHERE i.id=$1`, [invoiceId]);
  return Number(r.rows[0].bal);
}

async function refreshStatus(q: Q, invoiceId: string) {
  await q.query(
    `UPDATE invoices i SET status = CASE WHEN i.status='cancelled' THEN 'cancelled' WHEN ${BAL} <= 0 THEN 'paid'
       WHEN COALESCE((SELECT sum(p.amount_paise) FROM payments p WHERE p.invoice_id=i.id AND p.status='succeeded'),0) > 0 THEN 'partial' ELSE 'unpaid' END,
       version = version + 1 WHERE i.id=$1`, [invoiceId]);
}

export async function setConcession(user: SessionUser, invoiceId: string, amount: number, expectedVersion?: number) {
  const ctx = authorize(user, "fees.write", { write: true });
  await assertOwned("invoices", invoiceId, ctx.institutionId);
  const paise = toPaise(amount);
  if (paise < 0) throw invalid("Concession cannot be negative.");
  return tx(async (q) => {
    const inv = (await q.query<{ amount_paise: string; version: number; status: string }>("SELECT amount_paise, version, status FROM invoices WHERE id=$1 AND institution_id=$2 FOR UPDATE", [invoiceId, ctx.institutionId])).rows[0];
    if (expectedVersion !== undefined && inv.version !== expectedVersion) throw conflict("This invoice was changed by someone else. Reload and try again.");
    if (inv.status === "cancelled") throw conflict("A cancelled invoice cannot be changed.");
    if (paise > Number(inv.amount_paise)) throw invalid("Concession cannot exceed the invoice amount.");
    const paid = Number((await q.query<{ s: string }>("SELECT COALESCE(sum(amount_paise),0) s FROM payments WHERE invoice_id=$1 AND status='succeeded'", [invoiceId])).rows[0].s);
    if (Number(inv.amount_paise) - paise < paid) throw invalid("Concession would leave the invoice over-paid. Refund the excess first.");
    await q.query("UPDATE invoices SET concession_paise=$2 WHERE id=$1", [invoiceId, paise]);
    await refreshStatus(q, invoiceId);
    await audit(user, "invoice.concession", "invoice", invoiceId, { amount }, q);
  });
}

export async function cancelInvoice(user: SessionUser, invoiceId: string) {
  const ctx = authorize(user, "fees.write", { write: true });
  await assertOwned("invoices", invoiceId, ctx.institutionId);
  await tx(async (q) => {
    const paid = Number((await q.query<{ s: string }>("SELECT COALESCE(sum(amount_paise),0) s FROM payments WHERE invoice_id=$1 AND status='succeeded'", [invoiceId])).rows[0].s);
    if (paid > 0) throw conflict("This invoice already has payments. Refund them before cancelling.");
    await q.query("UPDATE invoices SET status='cancelled' WHERE id=$1 AND institution_id=$2", [invoiceId, ctx.institutionId]);
    await audit(user, "invoice.cancelled", "invoice", invoiceId, undefined, q);
  });
}

/** Offline payment recorded by the accounts team. idempotencyKey makes double-clicks and retries safe. */
export async function recordPayment(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "fees.write", { write: true });
  const d = parse(z.object({
    invoiceId: z.string().uuid(), amount: money, method: z.enum(["cash", "upi", "card", "bank"]),
    reference: z.string().trim().max(80).optional(), idempotencyKey: z.string().min(8).max(100),
  }), input);
  await assertOwned("invoices", d.invoiceId, ctx.institutionId);
  const paise = toPaise(d.amount);
  return tx(async (q) => {
    const dup = (await q.query<{ id: string; receipt_no: string }>("SELECT id, receipt_no FROM payments WHERE institution_id=$1 AND idempotency_key=$2", [ctx.institutionId, d.idempotencyKey])).rows[0];
    if (dup) return { paymentId: dup.id, receiptNo: dup.receipt_no, duplicate: true };
    const inv = (await q.query<{ status: string }>("SELECT status FROM invoices WHERE id=$1 AND institution_id=$2 FOR UPDATE", [d.invoiceId, ctx.institutionId])).rows[0];
    if (inv.status === "cancelled") throw conflict("This invoice is cancelled.");
    const bal = await invoiceBalance(q, d.invoiceId);
    if (bal <= 0) throw conflict("This invoice is already fully paid.");
    if (paise > bal) throw invalid(`Amount exceeds the outstanding balance of ₹${(bal / 100).toFixed(2)}.`, { amount: "Exceeds balance" });
    const receipt = await nextNumber(q, ctx.institutionId, "RCP");
    const p = (await q.query<{ id: string }>(
      "INSERT INTO payments (institution_id, invoice_id, amount_paise, method, reference, status, receipt_no, received_by, idempotency_key) VALUES ($1,$2,$3,$4,$5,'succeeded',$6,$7,$8) RETURNING id",
      [ctx.institutionId, d.invoiceId, paise, d.method, d.reference || null, receipt, user.id, d.idempotencyKey])).rows[0];
    await refreshStatus(q, d.invoiceId);
    await audit(user, "payment.recorded", "payment", p.id, { amount: d.amount, method: d.method, receipt }, q);
    return { paymentId: p.id, receiptNo: receipt, duplicate: false };
  });
}

/* ---------- Online payments (Razorpay) ---------- */
export const onlineConfigured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

export async function createOnlineOrder(user: SessionUser, invoiceId: string, amountRupees?: number) {
  if (!user.institutionId) throw new AppError("forbidden", "Not allowed.");
  const inv = await one<{ student_id: string; institution_id: string }>("SELECT student_id, institution_id FROM invoices WHERE id=$1", [invoiceId]);
  if (!inv || inv.institution_id !== user.institutionId) throw notFound();
  await assertPortalAccess(user, inv.student_id);
  if (!onlineConfigured()) throw invalid("Online payment is not enabled for this institution yet. Please pay at the accounts office.");
  const bal = await invoiceBalance({ query }, invoiceId);
  const paise = amountRupees === undefined ? bal : toPaise(amountRupees);
  if (paise <= 0 || paise > bal) throw invalid("Enter an amount between ₹1 and the outstanding balance.");
  const keyId = process.env.RAZORPAY_KEY_ID!, secret = process.env.RAZORPAY_KEY_SECRET!;
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Basic " + Buffer.from(`${keyId}:${secret}`).toString("base64") },
    body: JSON.stringify({ amount: paise, currency: "INR", receipt: invoiceId.slice(0, 40), notes: { invoiceId, institutionId: user.institutionId } }),
  });
  if (!res.ok) throw new AppError("conflict", "The payment provider could not start this payment. Please try again shortly.");
  const order = (await res.json()) as { id: string };
  await query("INSERT INTO payments (institution_id, invoice_id, amount_paise, method, status, provider_order_id) VALUES ($1,$2,$3,'online','pending',$4)", [user.institutionId, invoiceId, paise, order.id]);
  await audit(user, "payment.order_created", "invoice", invoiceId, { orderId: order.id, amount: paise / 100 });
  return { orderId: order.id, amountPaise: paise, keyId };
}

export function verifyWebhookSignature(rawBody: string, signature: string | null, secret = process.env.RAZORPAY_WEBHOOK_SECRET): boolean {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Idempotent: the same event delivered twice settles the payment once. A failure rolls back so the provider's retry succeeds. */
export async function handleWebhook(rawBody: string, signature: string | null, eventId: string | null) {
  if (!verifyWebhookSignature(rawBody, signature)) throw new AppError("forbidden", "Invalid signature.");
  if (!eventId) throw invalid("Missing event id.");
  const evt = JSON.parse(rawBody) as { event: string; payload: { payment: { entity: { id: string; order_id: string; amount: number } } } };
  return tx(async (q) => {
    const fresh = await q.query("INSERT INTO webhook_events (id, payload) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING", [eventId, rawBody]);
    if (!fresh.rowCount) return { status: "duplicate" as const };
    const ent = evt.payload?.payment?.entity;
    if (!ent) return { status: "ignored" as const };
    const pay = (await q.query<{ id: string; invoice_id: string; institution_id: string; amount_paise: string; status: string }>(
      "SELECT id, invoice_id, institution_id, amount_paise, status FROM payments WHERE provider_order_id=$1 FOR UPDATE", [ent.order_id])).rows[0];
    if (!pay) return { status: "ignored" as const };
    if (evt.event === "payment.failed") {
      if (pay.status === "pending") await q.query("UPDATE payments SET status='failed', provider_payment_id=$2, provider_event_id=$3 WHERE id=$1", [pay.id, ent.id, eventId]);
      return { status: "failed" as const };
    }
    if (evt.event !== "payment.captured") return { status: "ignored" as const };
    if (pay.status === "succeeded") return { status: "duplicate" as const };
    if (Number(pay.amount_paise) !== ent.amount) throw new AppError("conflict", "Amount mismatch between order and capture.");
    await q.query("SELECT 1 FROM invoices WHERE id=$1 FOR UPDATE", [pay.invoice_id]);
    const bal = await invoiceBalance(q, pay.invoice_id);
    if (Number(pay.amount_paise) > bal) throw new AppError("conflict", "Captured amount exceeds the invoice balance; flagged for manual review.");
    const receipt = await nextNumber(q, pay.institution_id, "RCP");
    await q.query("UPDATE payments SET status='succeeded', provider_payment_id=$2, provider_event_id=$3, receipt_no=$4 WHERE id=$1", [pay.id, ent.id, eventId, receipt]);
    await refreshStatus(q, pay.invoice_id);
    await audit({ institutionId: pay.institution_id }, "payment.captured", "payment", pay.id, { receipt }, q);
    return { status: "settled" as const, receiptNo: receipt };
  });
}

/* ---------- Views and reports ---------- */
export async function listInvoices(user: SessionUser, f: { studentId?: string; status?: string; page?: number } = {}) {
  const ctx = authorize(user, "fees.read");
  const params: unknown[] = [ctx.institutionId]; let w = "i.institution_id=$1";
  if (f.studentId) { params.push(f.studentId); w += ` AND i.student_id=$${params.length}`; }
  if (f.status) { params.push(f.status); w += ` AND i.status=$${params.length}`; }
  const page = Math.max(1, f.page ?? 1); params.push(50, (page - 1) * 50);
  return (await query(`SELECT i.id, i.number, i.description, i.amount_paise, i.concession_paise, i.due_on, i.status, i.version, s.name student, s.enrolment_no,
      ${BAL} AS balance_paise FROM invoices i JOIN students s ON s.id=i.student_id WHERE ${w} ORDER BY i.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
}

export async function studentInvoices(user: SessionUser, studentId: string) {
  await assertPortalAccess(user, studentId);
  return (await query(`SELECT i.id, i.number, i.description, i.amount_paise, i.concession_paise, i.due_on, i.status, ${BAL} AS balance_paise,
      (SELECT json_agg(json_build_object('receipt', p.receipt_no, 'amount_paise', p.amount_paise, 'method', p.method, 'at', p.created_at) ORDER BY p.created_at)
         FROM payments p WHERE p.invoice_id=i.id AND p.status='succeeded') AS payments
      FROM invoices i WHERE i.student_id=$1 AND i.institution_id=$2 AND i.status<>'cancelled' ORDER BY i.due_on`, [studentId, user.institutionId])).rows;
}

export async function duesReport(user: SessionUser) {
  const ctx = authorize(user, "fees.read");
  return (await query(`SELECT s.id, s.name, s.enrolment_no, p.name program, count(*)::int invoices,
      sum(${BAL})::bigint balance_paise, min(i.due_on) earliest_due,
      bool_or(i.due_on < current_date AND ${BAL} > 0) overdue
    FROM invoices i JOIN students s ON s.id=i.student_id JOIN programs p ON p.id=s.program_id
    WHERE i.institution_id=$1 AND i.status IN ('unpaid','partial') GROUP BY s.id, s.name, s.enrolment_no, p.name HAVING sum(${BAL}) > 0 ORDER BY balance_paise DESC`, [ctx.institutionId])).rows;
}

export async function collectionSummary(user: SessionUser) {
  const ctx = authorize(user, "fees.read");
  const r = await one<{ billed: string; collected: string; outstanding: string }>(
    `SELECT COALESCE(sum(i.amount_paise - i.concession_paise) FILTER (WHERE i.status<>'cancelled'),0) billed,
            COALESCE((SELECT sum(p.amount_paise) FROM payments p WHERE p.institution_id=$1 AND p.status='succeeded'),0) collected,
            COALESCE(sum(${BAL}) FILTER (WHERE i.status IN ('unpaid','partial')),0) outstanding
     FROM invoices i WHERE i.institution_id=$1`, [ctx.institutionId]);
  return { billedPaise: Number(r!.billed), collectedPaise: Number(r!.collected), outstandingPaise: Number(r!.outstanding) };
}

export async function duesCsv(user: SessionUser): Promise<string> {
  const rows = await duesReport(user);
  return toCsv(["Enrolment", "Student", "Program", "Open invoices", "Outstanding (INR)", "Earliest due", "Overdue"],
    rows.map((r: any) => [r.enrolment_no, r.name, r.program, r.invoices, (Number(r.balance_paise) / 100).toFixed(2), r.earliest_due, r.overdue ? "Yes" : "No"]));
}

export async function receipt(user: SessionUser, paymentId: string) {
  const row = await one<{ institution_id: string; student_id: string }>(
    "SELECT p.institution_id, i.student_id FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE p.id=$1", [paymentId]);
  if (!row || row.institution_id !== user.institutionId) throw notFound();
  if (user.role === "student" || user.role === "parent") await assertPortalAccess(user, row.student_id);
  else authorize(user, "fees.read");
  return one(`SELECT p.receipt_no, p.amount_paise, p.method, p.reference, p.created_at, i.number invoice_no, i.description, s.name student, s.enrolment_no, inst.name institution
    FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN students s ON s.id=i.student_id JOIN institutions inst ON inst.id=p.institution_id
    WHERE p.id=$1 AND p.status='succeeded'`, [paymentId]);
}

export { portalStudentIds };
