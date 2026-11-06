import { requireUser, fmtDateTime } from "@/lib/web";
import { listAnnouncements } from "@/services/academics";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { Form, Field } from "@/components/form";
import { announce } from "@/actions/admin";
import { can } from "@/lib/permissions";
export const metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";
export default async function Announcements() {
  const u = await requireUser();
  const rows = (await listAnnouncements(u)) as any[];
  return (
    <>
      <PageHeader title="Announcements" />
      {can(u.role, "announce.write") && <div className="mb-8"><Panel title="Post an announcement">
        <Form action={announce} submit="Send to everyone selected" pendingLabel="Sending…" resetOnSuccess confirm="Send this announcement now? Recipients are notified immediately.">
          <div className="space-y-4"><Field name="title" label="Title" /><Field name="body" label="Message" rows={4} /><Field name="audience" label="Send to" defaultValue="all" options={[{ value: "all", label: "Everyone" }, { value: "students", label: "Students" }, { value: "parents", label: "Parents" }, { value: "staff", label: "Staff" }]} /></div>
        </Form></Panel></div>}
      {rows.length === 0 ? <Empty title="No announcements yet" /> : <ul className="space-y-3">{rows.map((a) => <li key={a.id} className="card p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{a.title}</h3><span className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(a.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p><p className="mt-2 text-xs text-slate-500">By {a.author} · to {a.audience}</p></li>)}</ul>}
    </>
  );
}
