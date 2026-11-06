import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/web";
import { examSheet } from "@/services/academics";
import { AppError } from "@/lib/errors";
import { PageHeader, Notice } from "@/components/ui";
import { Form } from "@/components/form";
import { saveMarks } from "@/actions/admin";
export const dynamic = "force-dynamic";
export default async function MarksSheet({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePerm("marks.enter");
  const { id } = await params;
  let sheet;
  try { sheet = await examSheet(u, id); } catch (e) { if (e instanceof AppError && (e.code === "not_found" || e.code === "forbidden")) notFound(); throw e; }
  const { exam, rows } = sheet as { exam: { name: string; max_marks: number; published: boolean }; rows: any[] };
  return (
    <>
      <PageHeader title={`${exam.name}: marks`} subtitle={`Out of ${exam.max_marks}`} actions={<Link className="btn-secondary" href="/app/exams">← Exams</Link>} />
      {exam.published && <Notice tone="warn">Results are published. Unpublish from the Exams page before changing marks.</Notice>}
      <Form action={saveMarks} submit="Save marks" pendingLabel="Saving…" className="card p-5">
        <input type="hidden" name="examId" value={id} />
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.student_id} className="flex items-center justify-between gap-3 py-2">
              <div><p className="text-sm font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.enrolment_no}</p></div>
              <div className="flex items-center gap-2"><input type="hidden" name={`v_${r.student_id}`} value={r.version ?? ""} />
                <label className="sr-only" htmlFor={`m_${r.student_id}`}>Marks for {r.name}</label>
                <input id={`m_${r.student_id}`} name={`m_${r.student_id}`} type="number" step="0.01" min={0} max={exam.max_marks} defaultValue={r.marks_obtained ?? ""} disabled={exam.published} className="input w-28 text-right" /><span className="text-sm text-slate-500">/ {exam.max_marks}</span></div>
            </li>
          ))}
        </ul>
      </Form>
    </>
  );
}
