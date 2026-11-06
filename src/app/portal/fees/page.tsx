import Link from "next/link";
import { inr, fmtDate } from "@/lib/web";
import { PortalPage } from "@/components/portal-page";
import { studentInvoices, onlineConfigured } from "@/services/fees";
import { Table, Empty, Badge, Notice } from "@/components/ui";
import { PayOnline } from "./pay";
export const metadata = { title: "Fees" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  return <PortalPage path="/portal/fees" title="Fees" child={(await searchParams).child}>{async ({ user, studentId }) => {
    const rows = (await studentInvoices(user, studentId)) as any[];
    const online = onlineConfigured();
    return (<>
      {!online && rows.some((r) => Number(r.balance_paise) > 0) && <Notice>Online payment isn&apos;t enabled for your institution yet. Please pay at the accounts office and your balance will update.</Notice>}
      <Table rows={rows} empty={<Empty title="No fees yet" hint="Invoices will appear here when issued." />} cols={[{ header: "Invoice", cell: (r) => <div><p className="font-medium">{r.number}</p><p className="text-xs text-slate-500">{r.description}</p></div> }, { header: "Due", cell: (r) => fmtDate(r.due_on) }, { header: "Amount", cell: (r) => inr(r.amount_paise - r.concession_paise) }, { header: "Balance", cell: (r) => inr(r.balance_paise) }, { header: "Status", cell: (r) => <Badge>{r.status}</Badge> },
        { header: "", cell: (r) => <div className="space-y-1">{Number(r.balance_paise) > 0 && online && <PayOnline invoiceId={r.id} balance={Number(r.balance_paise)} />}{(r.payments ?? []).map((p: any, i: number) => <p key={i} className="text-xs text-slate-500">Paid {inr(p.amount_paise)} · {p.receipt}</p>)}</div> }]} />
    </>);
  }}</PortalPage>;
}
