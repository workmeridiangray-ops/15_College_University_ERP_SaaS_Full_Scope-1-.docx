import { fmtDateTime } from "@/lib/web";
import { PortalPage } from "@/components/portal-page";
import { studentAssignments } from "@/services/academics";
import { Empty, Badge } from "@/components/ui";
import { Form, Field } from "@/components/form";
import { submitWork } from "@/actions/admin";
export const metadata = { title: "Assignments" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  return <PortalPage path="/portal/assignments" title="Assignments" child={(await searchParams).child}>{async ({ user, studentId }) => {
    const rows = (await studentAssignments(user, studentId)) as any[];
    if (!rows.length) return <Empty title="No assignments yet" />;
    return <ul className="space-y-4">{rows.map((a) => { const late = new Date(a.due_at) < new Date(); return (
      <li key={a.id} className="card p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{a.title}</h3><p className="text-xs text-slate-500">{a.code} · due {fmtDateTime(a.due_at)} · {a.max_marks} marks</p></div>{a.marks !== null ? <Badge tone="approved">{`graded ${a.marks}/${a.max_marks}`}</Badge> : a.submitted_at ? <Badge tone="submitted">submitted</Badge> : late ? <Badge tone="unpaid">missed</Badge> : <Badge tone="pending">to do</Badge>}</div>
        {a.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.description}</p>}
        {a.feedback && <p className="mt-2 rounded bg-emerald-50 p-2 text-sm text-emerald-800">Feedback: {a.feedback}</p>}
        {user.role === "student" && !late && a.marks === null && <div className="mt-3"><Form action={submitWork} submit={a.submitted_at ? "Resubmit" : "Submit"} pendingLabel="Submitting…"><input type="hidden" name="id" value={a.id} /><Field name="body" label="Your answer" rows={4} defaultValue={a.body ?? ""} /></Form></div>}
        {user.role === "parent" && a.body && <p className="mt-2 text-xs text-slate-500">Submitted {fmtDateTime(a.submitted_at)}</p>}
      </li>); })}</ul>;
  }}</PortalPage>;
}
