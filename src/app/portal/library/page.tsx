import { inr, fmtDate } from "@/lib/web";
import { PortalPage } from "@/components/portal-page";
import { studentBooks } from "@/services/library";
import { Table, Empty, Badge } from "@/components/ui";
export const metadata = { title: "Library" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  return <PortalPage path="/portal/library" title="Library" child={(await searchParams).child}>{async ({ user, studentId }) => <Table rows={(await studentBooks(user, studentId)) as any[]} empty={<Empty title="No library history" hint="Books you borrow will be listed here." />} cols={[{ header: "Book", cell: (r) => <div><p className="font-medium">{r.title}</p><p className="text-xs text-slate-500">{r.author}</p></div> }, { header: "Issued", cell: (r) => fmtDate(r.issued_on) }, { header: "Due", cell: (r) => fmtDate(r.due_on) }, { header: "Returned", cell: (r) => r.returned_on ? fmtDate(r.returned_on) : <Badge tone={new Date(r.due_on) < new Date() ? "unpaid" : "open"}>{new Date(r.due_on) < new Date() ? "overdue" : "on loan"}</Badge> }, { header: "Fine", cell: (r) => Number(r.fine_paise) ? inr(r.fine_paise) : "—" }]} />}</PortalPage>;
}
