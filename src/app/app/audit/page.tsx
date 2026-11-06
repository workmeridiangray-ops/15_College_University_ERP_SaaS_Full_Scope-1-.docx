import { requirePerm, fmtDateTime } from "@/lib/web";
import { institutionAudit } from "@/services/platform";
import { PageHeader, Table, Empty } from "@/components/ui";
export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";
export default async function Audit() {
  const u = await requirePerm("audit.read");
  const rows = (await institutionAudit(u)) as any[];
  return (<><PageHeader title="Audit log" subtitle="The latest 200 recorded actions in your institution." /><Table rows={rows} empty={<Empty title="Nothing recorded yet" />} cols={[{ header: "When", cell: (r) => fmtDateTime(r.created_at) }, { header: "Who", cell: (r) => r.actor ?? "System" }, { header: "Action", cell: (r) => <code className="text-xs">{r.action}</code> }, { header: "Detail", cell: (r) => r.detail ? <code className="text-xs text-slate-500">{JSON.stringify(r.detail)}</code> : "—" }]} /></>);
}
