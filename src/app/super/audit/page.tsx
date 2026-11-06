import { requireUser, fmtDateTime } from "@/lib/web";
import { platformAudit } from "@/services/platform";
import { PageHeader, Table, Empty } from "@/components/ui";
export const metadata = { title: "Platform audit" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const rows = (await platformAudit(await requireUser(["super_admin"]))) as any[];
  return (<><PageHeader title="Platform audit" subtitle="The latest 200 actions across all institutions." /><Table rows={rows} empty={<Empty title="Nothing recorded" />} cols={[{ header: "When", cell: (r) => fmtDateTime(r.created_at) }, { header: "Institution", cell: (r) => r.institution ?? "Platform" }, { header: "Who", cell: (r) => r.actor ?? "System" }, { header: "Action", cell: (r) => <code className="text-xs">{r.action}</code> }]} /></>);
}
