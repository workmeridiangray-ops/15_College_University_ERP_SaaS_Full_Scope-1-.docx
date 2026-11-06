import { requireUser, fmtDate } from "@/lib/web";
import { listInstitutions } from "@/services/platform";
import { PageHeader, Table, Badge, Empty } from "@/components/ui";
import { Form, Field, ActionButton } from "@/components/form";
import { setInstStatus, setPlan, extend, adminLink } from "@/actions/admin";
export const metadata = { title: "Institutions" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const rows = (await listInstitutions(await requireUser(["super_admin"]))) as any[];
  return (<><PageHeader title="Institutions" subtitle="Manage subscriptions, access and recovery." /><Table rows={rows} empty={<Empty title="No institutions yet" />} cols={[
    { header: "Institution", cell: (r) => <div><p className="font-medium">{r.name}{r.is_demo && <span className="ml-2 rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">DEMO</span>}</p><p className="text-xs text-slate-500">/{r.slug} · {r.contact_email}</p></div> },
    { header: "Plan", cell: (r) => r.plan }, { header: "Usage", cell: (r) => `${r.students} students · ${r.staff} staff` }, { header: "Status", cell: (r) => <div><Badge>{r.status}</Badge>{r.status === "trial" && <p className="mt-1 text-xs text-slate-500">ends {fmtDate(r.trial_ends_at)}</p>}</div> },
    { header: "Manage", cell: (r) => (
      <div className="space-y-2">
        <Form action={setInstStatus} submit="Set status" pendingLabel="…" className="flex items-end gap-2"><input type="hidden" name="id" value={r.id} /><div className="w-32"><Field name="status" label="Status" defaultValue={r.status} options={["trial", "active", "past_due", "suspended", "cancelled"].map((s) => ({ value: s, label: s.replace("_", " ") }))} /></div></Form>
        <Form action={setPlan} submit="Set plan" pendingLabel="…" className="flex items-end gap-2"><input type="hidden" name="id" value={r.id} /><div className="w-32"><Field name="plan" label="Plan" defaultValue="starter" options={["starter", "growth", "enterprise"].map((s) => ({ value: s, label: s }))} /></div></Form>
        <div className="flex flex-wrap gap-2"><ActionButton action={extend} label="+14-day trial" fields={{ id: r.id, days: "14" }} /><ActionButton action={adminLink} label="Admin reset link" fields={{ id: r.id }} /></div>
      </div>) }]} /></>);
}
