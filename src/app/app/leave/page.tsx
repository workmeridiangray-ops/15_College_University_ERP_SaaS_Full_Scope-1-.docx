import { requirePerm, inr, fmtDate } from "@/lib/web";
import { myLeaves, myPayslips } from "@/services/hr";
import { PageHeader, Table, Badge, Empty, Panel, Section, Stat } from "@/components/ui";
import { Form, Field } from "@/components/form";
import { requestLeave } from "@/actions/admin";
import { AppError } from "@/lib/errors";
export const metadata = { title: "My leave & payslips" };
export const dynamic = "force-dynamic";
export default async function Leave() {
  const u = await requirePerm("leave.request");
  let data, slips: any[] = [];
  try { data = await myLeaves(u); slips = (await myPayslips(u)) as any[]; } catch (e) { if (e instanceof AppError && e.code === "forbidden") return <><PageHeader title="My leave & payslips" /><Empty title="No staff record is linked to your account" hint="Ask your administrator to create your staff profile." /></>; throw e; }
  return (
    <>
      <PageHeader title="My leave & payslips" />
      <div className="mb-6 max-w-xs"><Stat label="Paid leave remaining" value={`${data.paidBalance} days`} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><Section title="My requests"><Table rows={data.rows as any[]} empty={<Empty title="No leave requests yet" />} cols={[{ header: "Dates", cell: (r) => `${fmtDate(r.from_date)} – ${fmtDate(r.to_date)}` }, { header: "Type", cell: (r) => r.kind }, { header: "Status", cell: (r) => <Badge>{r.status}</Badge> }]} /></Section></div>
        <Panel title="Request leave"><Form action={requestLeave} submit="Send request" resetOnSuccess><div className="space-y-3"><Field name="fromDate" label="From" type="date" /><Field name="toDate" label="To" type="date" /><Field name="kind" label="Type" defaultValue="paid" options={[{ value: "paid", label: "Paid" }, { value: "unpaid", label: "Unpaid" }]} /><Field name="reason" label="Reason" rows={2} required={false} /></div></Form></Panel>
      </div>
      <Section title="Payslips"><Table rows={slips} empty={<Empty title="No payslips yet" />} cols={[{ header: "Month", cell: (r) => r.month }, { header: "Gross", cell: (r) => inr(r.gross_paise) }, { header: "Deductions", cell: (r) => inr(r.deductions_paise) }, { header: "Net pay", cell: (r) => <strong>{inr(r.net_paise)}</strong> }]} /></Section>
    </>
  );
}
