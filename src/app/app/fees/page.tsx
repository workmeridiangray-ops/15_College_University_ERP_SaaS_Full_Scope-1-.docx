import Link from "next/link";
import { requirePerm, inr, fmtDate } from "@/lib/web";
import { listFeeStructures, listInvoices, duesReport, collectionSummary, listPayments } from "@/services/fees";
import { structure } from "@/services/core";
import { PageHeader, Stat, Table, Badge, Empty, Panel, Section } from "@/components/ui";
import { Form, Field, ActionButton, Disclosure } from "@/components/form";
import { addFeeStructure, generate, payOffline, concession, cancelInv } from "@/actions/admin";
import { can } from "@/lib/permissions";
export const metadata = { title: "Fees" };
export const dynamic = "force-dynamic";

export default async function Fees({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const u = await requirePerm("fees.read");
  const { tab = "invoices", status } = await searchParams;
  const write = can(u.role, "fees.write");
  const [sum, s] = await Promise.all([collectionSummary(u), structure(u)]);
  const tabs = [["invoices", "Invoices"], ["structures", "Fee structures"], ["payments", "Receipts"], ["dues", "Dues"]];
  return (
    <>
      <PageHeader title="Fees" subtitle="Structures, invoices, payments and dues." actions={<a className="btn-secondary" href="/api/export/dues" download>Export dues CSV</a>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3"><Stat label="Billed" value={inr(sum.billedPaise)} /><Stat label="Collected" value={inr(sum.collectedPaise)} tone="good" /><Stat label="Outstanding" value={inr(sum.outstandingPaise)} tone={sum.outstandingPaise ? "warn" : undefined} /></div>
      <div className="mb-5 flex gap-2 overflow-x-auto" role="tablist">{tabs.map(([k, l]) => <Link key={k} href={`?tab=${k}`} role="tab" aria-selected={tab === k} className={`btn-sm whitespace-nowrap ${tab === k ? "btn-primary" : "btn-secondary"}`}>{l}</Link>)}</div>

      {tab === "structures" && (<>
        <Table rows={(await listFeeStructures(u)) as any[]} empty={<Empty title="No fee structures yet" hint="Create one, then generate invoices for every student in the program." />}
          cols={[{ header: "Name", cell: (r) => r.name }, { header: "Program", cell: (r) => r.program }, { header: "Amount", cell: (r) => inr(r.amount_paise) }, { header: "Due", cell: (r) => fmtDate(r.due_on) }, { header: "Invoices", cell: (r) => r.invoices }, ...(write ? [{ header: "", cell: (r: any) => <ActionButton action={generate} label="Generate invoices" confirm={`Create an invoice for every active ${r.program} student who doesn't have one?`} fields={{ id: r.id }} /> }] : [])]} />
        {write && <div className="mt-6"><Panel title="New fee structure"><Form action={addFeeStructure} submit="Create" resetOnSuccess><div className="grid gap-4 sm:grid-cols-2"><Field name="programId" label="Program" options={(s.programs as any[]).map((p) => ({ value: p.id, label: p.name }))} /><Field name="name" label="Name" placeholder="Semester 1 tuition" /><Field name="amount" label="Amount (₹)" type="number" min={1} step="0.01" /><Field name="dueOn" label="Due date" type="date" /></div></Form></Panel></div>}
      </>)}

      {tab === "invoices" && (<>
        <div className="mb-4 flex gap-2 text-sm">{["", "unpaid", "partial", "paid", "cancelled"].map((x) => <Link key={x} href={`?tab=invoices${x ? `&status=${x}` : ""}`} className={`btn-sm ${(status ?? "") === x ? "btn-primary" : "btn-secondary"}`}>{x || "All"}</Link>)}</div>
        <Table rows={(await listInvoices(u, { status })) as any[]} empty={<Empty title="No invoices" hint="Generate invoices from a fee structure." />}
          cols={[{ header: "Invoice", cell: (r) => <div><p className="font-medium">{r.number}</p><p className="text-xs text-slate-500">{r.description}</p></div> }, { header: "Student", cell: (r) => <Link className="text-brand-600 hover:underline" href="/app/students">{r.student}</Link> }, { header: "Due", cell: (r) => fmtDate(r.due_on) }, { header: "Net", cell: (r) => inr(r.amount_paise - r.concession_paise) }, { header: "Balance", cell: (r) => <span className={Number(r.balance_paise) > 0 ? "font-medium" : "text-slate-400"}>{inr(r.balance_paise)}</span> }, { header: "Status", cell: (r) => <Badge>{r.status}</Badge> },
            ...(write ? [{ header: "Actions", cell: (r: any) => r.status === "cancelled" ? null : (
              <div className="space-y-2">
                {Number(r.balance_paise) > 0 && <Disclosure label="Record payment">
                  <Form action={payOffline} idem submit="Record" pendingLabel="Recording…" resetOnSuccess className="mt-2 w-64"><input type="hidden" name="invoiceId" value={r.id} /><div className="space-y-2"><Field name="amount" label="Amount (₹)" type="number" min={0.01} step="0.01" defaultValue={Number(r.balance_paise) / 100} /><Field name="method" label="Method" defaultValue="cash" options={["cash", "upi", "card", "bank"].map((m) => ({ value: m, label: m.toUpperCase() }))} /><Field name="reference" label="Reference" required={false} placeholder="UPI ref / cheque no." /></div></Form></Disclosure>}
                <div className="flex gap-2">
                  <Disclosure label="Concession" tone="slate"><Form action={concession} submit="Apply" className="mt-2 w-56"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="version" value={r.version} /><Field name="amount" label="Concession (₹)" type="number" min={0} step="0.01" defaultValue={Number(r.concession_paise) / 100} /></Form></Disclosure>
                  {Number(r.balance_paise) === Number(r.amount_paise - r.concession_paise) && <ActionButton action={cancelInv} label="Cancel" variant="danger" confirm="Cancel this invoice? This cannot be undone." fields={{ id: r.id }} />}
                </div>
              </div>) }] : [])]} />
      </>)}

      {tab === "payments" && <Table rows={(await listPayments(u)) as any[]} empty={<Empty title="No payments recorded yet" />} cols={[{ header: "Receipt", cell: (r) => <Link className="font-medium text-brand-600 hover:underline" href={`/app/fees/receipt/${r.id}`}>{r.receipt_no}</Link> }, { header: "Student", cell: (r) => `${r.student} (${r.enrolment_no})` }, { header: "Invoice", cell: (r) => r.invoice_no }, { header: "Method", cell: (r) => <span className="uppercase">{r.method}</span> }, { header: "Amount", cell: (r) => inr(r.amount_paise) }, { header: "Date", cell: (r) => fmtDate(r.created_at) }]} />}

      {tab === "dues" && <Section title="Students with outstanding balances"><Table rows={(await duesReport(u)) as any[]} empty={<Empty title="No outstanding dues" hint="Every issued invoice is settled." />} cols={[{ header: "Student", cell: (r) => `${r.name} (${r.enrolment_no})` }, { header: "Program", cell: (r) => r.program }, { header: "Open invoices", cell: (r) => r.invoices }, { header: "Earliest due", cell: (r) => fmtDate(r.earliest_due) }, { header: "Outstanding", cell: (r) => <span className="font-semibold">{inr(r.balance_paise)}</span> }, { header: "", cell: (r) => r.overdue ? <Badge tone="unpaid">overdue</Badge> : null }]} /></Section>}
    </>
  );
}
