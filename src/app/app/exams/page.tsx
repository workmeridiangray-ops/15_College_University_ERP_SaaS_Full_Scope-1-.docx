import Link from "next/link";
import { requirePerm, fmtDate } from "@/lib/web";
import { listExams, teachingOptions } from "@/services/academics";
import { PageHeader, Table, Badge, Empty, Panel } from "@/components/ui";
import { Form, Field, ActionButton } from "@/components/form";
import { addExam, publish } from "@/actions/admin";
import { can } from "@/lib/permissions";
export const metadata = { title: "Exams & marks" };
export const dynamic = "force-dynamic";
export default async function Exams() {
  const u = await requirePerm("marks.enter");
  const [rows, opts] = await Promise.all([listExams(u), teachingOptions(u)]);
  const mine = u.role === "faculty" ? new Set(opts.map((o) => `${o.course_id}|${o.section_id}`)) : null;
  const visible = (rows as any[]).filter((r) => !mine || mine.has(`${r.course_id}|${r.section_id}`));
  return (
    <>
      <PageHeader title="Exams & marks" subtitle="Create assessments, enter marks, then publish results to students and parents." />
      <Table rows={visible} empty={<Empty title="No exams yet" hint="Create an exam below, then enter marks." />} cols={[{ header: "Exam", cell: (r) => <Link className="font-medium text-brand-600 hover:underline" href={`/app/exams/${r.id}`}>{r.name}</Link> }, { header: "Course", cell: (r) => `${r.course_code} · ${r.section}` }, { header: "Date", cell: (r) => fmtDate(r.exam_date) }, { header: "Max / weight", cell: (r) => `${r.max_marks} / ${r.weight_pct}%` }, { header: "Marks entered", cell: (r) => `${r.entered}/${r.total}` }, { header: "Results", cell: (r) => <Badge tone={r.published ? "approved" : "pending"}>{r.published ? "published" : "draft"}</Badge> },
        { header: "", cell: (r) => can(u.role, "exams.manage") ? <ActionButton action={publish} label={r.published ? "Unpublish" : "Publish"} confirm={r.published ? "Hide these results from students and parents?" : "Publish results? Students and parents will be notified."} variant={r.published ? "secondary" : "primary"} fields={{ id: r.id, publish: String(!r.published) }} /> : null }]} />
      {can(u.role, "exams.manage") && <div className="mt-8"><Panel title="New exam">
        {opts.length === 0 ? <p className="text-sm text-slate-600">You need a class assigned before creating exams.</p> : (
          <Form action={addExam} submit="Create exam" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="courseId" label="Course" options={[...new Map(opts.map((o) => [o.course_id, { value: o.course_id, label: `${o.code} · ${o.course}` }])).values()]} />
              <Field name="sectionId" label="Section" options={[...new Map(opts.map((o) => [o.section_id, { value: o.section_id, label: `${o.program} · Y${o.year_no} ${o.section}` }])).values()]} />
              <Field name="name" label="Name" placeholder="Midterm" /><Field name="examDate" label="Date" type="date" required={false} />
              <Field name="maxMarks" label="Maximum marks" type="number" defaultValue={100} min={1} /><Field name="weightPct" label="Weight in final grade (%)" type="number" defaultValue={50} min={1} max={100} hint="Weights for one course must total 100%." />
            </div>
          </Form>)}
      </Panel></div>}
    </>
  );
}
