import { requireUser, fmtDateTime } from "@/lib/web";
import { listAnnouncements } from "@/services/academics";
import { PageHeader, Empty } from "@/components/ui";
export const metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const rows = (await listAnnouncements(await requireUser(["student", "parent"]))) as any[];
  return (<><PageHeader title="Announcements" />{rows.length === 0 ? <Empty title="No announcements" /> : <ul className="space-y-3">{rows.map((a) => <li key={a.id} className="card p-4"><div className="flex justify-between gap-3"><h3 className="font-semibold">{a.title}</h3><span className="text-xs text-slate-500">{fmtDateTime(a.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p></li>)}</ul>}</>);
}
