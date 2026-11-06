import { z } from "zod";
import { one, query, tx } from "@/lib/db";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { authorize, type SessionUser } from "@/lib/session";
import { assertOwned, parse } from "./core";

export const ANNUAL_PAID_LEAVE_DAYS = 12;
const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const daysBetweenInclusive = (a: string, b: string) => Math.round((day(b) - day(a)) / 86400000) + 1;

export async function listStaffRecords(user: SessionUser) {
  const ctx = authorize(user, "hr.manage");
  return (await query(`SELECT s.id, s.employee_no, s.designation, s.base_salary_paise, s.joined_on, u.name, u.email, u.role, u.active, d.name department
    FROM staff s JOIN users u ON u.id=s.user_id LEFT JOIN departments d ON d.id=s.department_id WHERE s.institution_id=$1 ORDER BY u.name`, [ctx.institutionId])).rows;
}

export async function updateSalary(user: SessionUser, staffId: string, amountRupees: number) {
  const ctx = authorize(user, "hr.manage", { write: true });
  await assertOwned("staff", staffId, ctx.institutionId);
  if (!(amountRupees >= 0 && amountRupees <= 10_000_000)) throw invalid("Enter a valid monthly salary.");
  await query("UPDATE staff SET base_salary_paise=$2 WHERE id=$1 AND institution_id=$3", [staffId, Math.round(amountRupees * 100), ctx.institutionId]);
  await audit(user, "staff.salary_updated", "staff", staffId);
}

async function myStaffId(user: SessionUser): Promise<string> {
  const r = await one<{ id: string }>("SELECT id FROM staff WHERE user_id=$1 AND institution_id=$2", [user.id, user.institutionId]);
  if (!r) throw forbidden("No staff record is linked to your account.");
  return r.id;
}

export async function requestLeave(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "leave.request", { write: true });
  const d = parse(z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(["paid", "unpaid"]), reason: z.string().trim().max(500).optional() }), input);
  if (d.toDate < d.fromDate) throw invalid("The end date cannot be before the start date.", { toDate: "Before start" });
  const staffId = await myStaffId(user);
  return tx(async (q) => {
    await q.query("SELECT 1 FROM staff WHERE id=$1 FOR UPDATE", [staffId]);
    if ((await q.query("SELECT 1 FROM leave_requests WHERE staff_id=$1 AND status IN ('pending','approved') AND from_date <= $3::date AND to_date >= $2::date", [staffId, d.fromDate, d.toDate])).rowCount)
      throw conflict("You already have a leave request overlapping these dates.");
    if (d.kind === "paid") {
      const year = d.fromDate.slice(0, 4);
      const used = Number((await q.query<{ n: string }>(
        `SELECT COALESCE(sum(to_date - from_date + 1),0) n FROM leave_requests WHERE staff_id=$1 AND kind='paid' AND status IN ('pending','approved') AND extract(year from from_date)=$2::int`, [staffId, year])).rows[0].n);
      const asking = daysBetweenInclusive(d.fromDate, d.toDate);
      if (used + asking > ANNUAL_PAID_LEAVE_DAYS) throw conflict(`Paid leave balance is ${ANNUAL_PAID_LEAVE_DAYS - used} day(s); this request needs ${asking}. Request unpaid leave for the difference.`);
    }
    const r = (await q.query<{ id: string }>("INSERT INTO leave_requests (institution_id, staff_id, from_date, to_date, kind, reason) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [ctx.institutionId, staffId, d.fromDate, d.toDate, d.kind, d.reason || null])).rows[0];
    await q.query(`INSERT INTO notifications (institution_id, user_id, title, body, link) SELECT $1, id, 'Leave request', $2, '/app/hr' FROM users WHERE institution_id=$1 AND role IN ('hr_manager','institution_admin') AND id<>$3`, [ctx.institutionId, `${user.name} requested ${d.kind} leave`, user.id]);
    await audit(user, "leave.requested", "leave_request", r.id, undefined, q);
    return r.id;
  });
}

export async function myLeaves(user: SessionUser) {
  const ctx = authorize(user, "leave.request");
  const sid = await myStaffId(user);
  const rows = (await query("SELECT id, from_date, to_date, kind, reason, status FROM leave_requests WHERE staff_id=$1 AND institution_id=$2 ORDER BY from_date DESC", [sid, ctx.institutionId])).rows;
  const used = Number((await one<{ n: string }>(`SELECT COALESCE(sum(to_date - from_date + 1),0) n FROM leave_requests WHERE staff_id=$1 AND kind='paid' AND status IN ('pending','approved') AND extract(year from from_date)=extract(year from current_date)`, [sid]))!.n);
  return { rows, paidBalance: ANNUAL_PAID_LEAVE_DAYS - used };
}

export async function pendingLeaves(user: SessionUser) {
  const ctx = authorize(user, "hr.manage");
  return (await query(`SELECT l.*, u.name, s.employee_no FROM leave_requests l JOIN staff s ON s.id=l.staff_id JOIN users u ON u.id=s.user_id WHERE l.institution_id=$1 ORDER BY (l.status='pending') DESC, l.from_date DESC LIMIT 100`, [ctx.institutionId])).rows;
}

export async function decideLeave(user: SessionUser, id: string, status: "approved" | "rejected") {
  const ctx = authorize(user, "hr.manage", { write: true });
  await assertOwned("leave_requests", id, ctx.institutionId);
  await tx(async (q) => {
    const l = (await q.query<{ status: string; user_id: string }>("SELECT l.status, s.user_id FROM leave_requests l JOIN staff s ON s.id=l.staff_id WHERE l.id=$1 FOR UPDATE OF l", [id])).rows[0];
    if (l.user_id === user.id) throw forbidden("You cannot decide your own leave request.");
    if (l.status !== "pending") throw conflict(`This request was already ${l.status}.`);
    await q.query("UPDATE leave_requests SET status=$2, decided_by=$3, decided_at=now() WHERE id=$1", [id, status, user.id]);
    await q.query("INSERT INTO notifications (institution_id, user_id, title, body, link) VALUES ($1,$2,$3,$4,'/app/hr')", [ctx.institutionId, l.user_id, `Leave ${status}`, `Your leave request was ${status}.`]);
    await audit(user, "leave." + status, "leave_request", id, undefined, q);
  });
}

/* ---------- Payroll ---------- */
/** Gross − unpaid-leave deduction. Statutory deductions (PF/ESI/TDS) are NOT calculated; see docs/ADMIN_GUIDE.md. */
export function computePayslip(grossPaise: number, unpaidDays: number, daysInMonth: number) {
  const deduction = Math.round((grossPaise * Math.min(unpaidDays, daysInMonth)) / daysInMonth);
  return { grossPaise, deductionsPaise: deduction, netPaise: grossPaise - deduction };
}

export async function runPayroll(user: SessionUser, month: string) {
  const ctx = authorize(user, "hr.manage", { write: true });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw invalid("Choose a month.");
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`, daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  if (month > new Date().toISOString().slice(0, 7)) throw invalid("Payroll cannot be run for a future month.");
  return tx(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["payroll:" + ctx.institutionId]);
    if ((await q.query("SELECT 1 FROM payroll_runs WHERE institution_id=$1 AND month=$2", [ctx.institutionId, month])).rowCount) throw conflict(`Payroll for ${month} has already been run.`);
    const run = (await q.query<{ id: string }>("INSERT INTO payroll_runs (institution_id, month, created_by) VALUES ($1,$2,$3) RETURNING id", [ctx.institutionId, month, user.id])).rows[0];
    const staff = (await q.query<{ id: string; base_salary_paise: string; user_id: string }>("SELECT s.id, s.base_salary_paise, s.user_id FROM staff s JOIN users u ON u.id=s.user_id WHERE s.institution_id=$1 AND u.active AND s.joined_on <= $2::date", [ctx.institutionId, last])).rows;
    let total = 0;
    for (const s of staff) {
      const unpaid = Number((await q.query<{ n: string }>(
        `SELECT COALESCE(sum(LEAST(to_date, $3::date) - GREATEST(from_date, $2::date) + 1),0) n FROM leave_requests WHERE staff_id=$1 AND kind='unpaid' AND status='approved' AND from_date <= $3::date AND to_date >= $2::date`, [s.id, first, last])).rows[0].n);
      const p = computePayslip(Number(s.base_salary_paise), unpaid, daysInMonth);
      await q.query("INSERT INTO payslips (institution_id, run_id, staff_id, gross_paise, deductions_paise, net_paise, unpaid_leave_days) VALUES ($1,$2,$3,$4,$5,$6,$7)", [ctx.institutionId, run.id, s.id, p.grossPaise, p.deductionsPaise, p.netPaise, unpaid]);
      await q.query("INSERT INTO notifications (institution_id, user_id, title, body, link) VALUES ($1,$2,'Payslip ready',$3,'/app/payslips')", [ctx.institutionId, s.user_id, `Your payslip for ${month} is available.`]);
      total += p.netPaise;
    }
    await audit(user, "payroll.run", "payroll_run", run.id, { month, staff: staff.length, totalNetPaise: total }, q);
    return { runId: run.id, staff: staff.length, totalNetPaise: total };
  });
}

export async function payrollRuns(user: SessionUser) {
  const ctx = authorize(user, "hr.manage");
  return (await query(`SELECT r.id, r.month, r.created_at, count(p.id)::int staff, COALESCE(sum(p.net_paise),0)::bigint net_paise FROM payroll_runs r LEFT JOIN payslips p ON p.run_id=r.id WHERE r.institution_id=$1 GROUP BY r.id ORDER BY r.month DESC`, [ctx.institutionId])).rows;
}
export async function runPayslips(user: SessionUser, runId: string) {
  const ctx = authorize(user, "hr.manage");
  const ok = await one("SELECT 1 FROM payroll_runs WHERE id=$1 AND institution_id=$2", [runId, ctx.institutionId]);
  if (!ok) throw notFound();
  return (await query(`SELECT p.*, u.name, s.employee_no FROM payslips p JOIN staff s ON s.id=p.staff_id JOIN users u ON u.id=s.user_id WHERE p.run_id=$1 AND p.institution_id=$2 ORDER BY u.name`, [runId, ctx.institutionId])).rows;
}
export async function myPayslips(user: SessionUser) {
  const ctx = authorize(user, "leave.request");
  const sid = await myStaffId(user);
  return (await query(`SELECT p.*, r.month FROM payslips p JOIN payroll_runs r ON r.id=p.run_id WHERE p.staff_id=$1 AND p.institution_id=$2 ORDER BY r.month DESC`, [sid, ctx.institutionId])).rows;
}
