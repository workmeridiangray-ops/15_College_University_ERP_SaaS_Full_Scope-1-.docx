import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm, fmtDateTime } from "@/lib/web";
import { assignmentSubmissions } from "@/services/academics";
import { AppError } from "@/lib/errors";
import { PageHeader, Table, Badge } from "@/components/ui";
import { Form, Field } from "@/components/form";
import { grade } from "@/actions/admin";
export const dynamic = "force-dynamic";
export default async function Submissions({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePerm("assignments.manage");
  const { id } = await params;
  let rows: any[];
  try { rows = (await assignmentSubmissions(u, id)) as any[]; } catch (e) { if (e instanceof AppError && (e.code === "not_found" || e.code === "forbidden")) notFound(); throw e; }
  return (
    <>
      <PageHeader title="Submissions" actions={<Link className="btn-secondary" href="/app/assignments">← Assignments</Link>} />
      <Table rows={rows} empty={null} cols={[{ header: "Student", cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.enrolment_no}</p></div> }, { header: "Status", cell: (r) => r.submission_id ? <Badge tone={r.marks !== null ? "approved" : "submitted"}>{r.marks !== null ? "graded" : "submitted"}</Badge> : <Badge tone="pending">not submitted</Badge> },
        { header: "Answer", cell: (r) => r.body ? <details><summary className="cursor-pointer text-brand-600">View ({fmtDateTime(r.submitted_at)})</summary><p className="mt-2 max-w-md whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{r.body}</p></details> : "—" },
        { header: "Grade", cell: (r) => r.submission_id ? <Form action={grade} submit="Save" pendingLabel="…" className="flex items-end gap-2"><input type="hidden" name="id" value={r.submission_id} /><div className="w-20"><Field name="marks" label="Marks" type="number" step="0.01" min={0} defaultValue={r.marks ?? ""} /></div><div className="w-44"><Field name="feedback" label="Feedback" required={false} defaultValue={r.feedback ?? ""} /></div></Form> : "—" }]} />
    </>
  );
}
