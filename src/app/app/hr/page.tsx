import { requirePerm, inr, fmtDate } from "@/lib/web";
import { listStaffRecords, pendingLeaves, payrollRuns, runPayslips, ANNUAL_PAID_LEAVE_DAYS } from "@/services/hr";
import { PageHeader, Table, Badge, Empty, Panel, Section, Notice } from "@/components/ui";
import { Form, Field, ActionButton } from "@/components/form";
import { decideLeave, payroll, salary } from "@/actions/admin";
export const metadata = { title: "HR & payroll" };
export const dynamic = "force-dynamic";
export default async function Hr({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const u = await requirePerm("hr.manage");
  const runId = (await searchParams).run;
  const [staff, leaves, runs] = await Promise.all([listStaffRecords(u), pendingLeaves(u), payrollRuns(u)]);
  const slips = runId ? ((await runPayslips(u, runId).catch(() => [])) as any[]) : [];
  const prev = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  return (
    <>
      <PageHeader title="HR & payroll" />
      <Section title="Leave requests"><Table rows={leaves as any[]} empty={<Empty title="No leave requests" />} cols={[{ header: "Staff", cell: (r) => `${r.name} (${r.employee_no})` }, { header: "Dates", cell: (r) => `${fmtDate(r.from_date)} – ${fmtDate(r.to_date)}` }, { header: "Type", cell: (r) => r.kind }, { header: "Reason", cell: (r) => r.reason ?? "—" }, { header: "Status", cell: (r) => <Badge>{r.status}</Badge> }, { header: "", cell: (r) => r.status === "pending" ? <div className="flex gap-2"><ActionButton action={decideLeave} label="Approve" variant="primary" fields={{ id: r.id, status: "approved" }} /><ActionButton action={decideLeave} label="Reject" variant="danger" confirm="Reject this leave request?" fields={{ id: r.id, status: "rejected" }} /></div> : null }]} /></Section>
      <Section title="Staff & salaries"><Table rows={staff as any[]} empty={<Empty title="No staff records" hint="Create staff accounts to see them here." />} cols={[{ header: "Employee", cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.employee_no} · {r.designation}</p></div> }, { header: "Department", cell: (r) => r.department ?? "—" }, { header: "Monthly salary", cell: (r) => inr(r.base_salary_paise) }, { header: "Update", cell: (r) => <Form action={salary} submit="Save" pendingLabel="…" className="flex items-end gap-2"><input type="hidden" name="id" value={r.id} /><div className="w-32"><Field name="amount" label="₹ / month" type="number" min={0} defaultValue={Number(r.base_salary_paise) / 100} /></div></Form> }]} /></Section>
      <Section title="Payroll">
        <Notice tone="warn">Payslips apply unpaid-leave deductions only. Statutory deductions (PF, ESI, TDS) are <strong>not</strong> calculated. Handle them in your accounting process.</Notice>
        <div className="grid gap-6 lg:grid-cols-3"><div className="lg:col-span-2"><Table rows={runs as any[]} empty={<Empty title="No payroll runs yet" />} cols={[{ header: "Month", cell: (r) => <a className="font-medium text-brand-600 hover:underline" href={`?run=${r.id}`}>{r.month}</a> }, { header: "Staff", cell: (r) => r.staff }, { header: "Net payable", cell: (r) => inr(r.net_paise) }]} /></div>
          <Panel title="Run payroll"><Form action={payroll} submit="Generate payslips" pendingLabel="Generating…" confirm="Generate payslips for this month? A month can only be run once."><Field name="month" label="Month" type="month" defaultValue={prev} max={new Date().toISOString().slice(0, 7)} /></Form></Panel></div>
        {slips.length > 0 && <div className="mt-6"><Table rows={slips} empty={null} cols={[{ header: "Employee", cell: (r) => `${r.name} (${r.employee_no})` }, { header: "Gross", cell: (r) => inr(r.gross_paise) }, { header: "Unpaid leave days", cell: (r) => r.unpaid_leave_days }, { header: "Deductions", cell: (r) => inr(r.deductions_paise) }, { header: "Net", cell: (r) => <strong>{inr(r.net_paise)}</strong> }]} /></div>}
      </Section>
      <p className="text-xs text-slate-500">Paid leave allowance: {ANNUAL_PAID_LEAVE_DAYS} days per calendar year.</p>
    </>
  );
}
