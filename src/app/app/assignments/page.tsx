import Link from "next/link";
import { requirePerm, fmtDateTime } from "@/lib/web";
import { listAssignmentsForStaff, teachingOptions } from "@/services/academics";
import { PageHeader, Table, Empty, Panel } from "@/components/ui";
import { Form, Field } from "@/components/form";
import { addAssignment } from "@/actions/admin";
export const metadata = { title: "Assignments" };
export const dynamic = "force-dynamic";
export default async function Assignments() {
  const u = await requirePerm("assignments.manage");
  const [rows, opts] = await Promise.all([listAssignmentsForStaff(u), teachingOptions(u)]);
  return (
    <>
      <PageHeader title="Assignments" subtitle="Publish work to a section and grade submissions." />
      <Table rows={rows as any[]} empty={<Empty title="No assignments yet" hint="Publish the first one below. Students are notified immediately." />} cols={[{ header: "Title", cell: (r) => <Link className="font-medium text-brand-600 hover:underline" href={`/app/assignments/${r.id}`}>{r.title}</Link> }, { header: "Class", cell: (r) => `${r.code} · ${r.section}` }, { header: "Due", cell: (r) => fmtDateTime(r.due_at) }, { header: "Submitted", cell: (r) => `${r.submitted}/${r.total}` }, { header: "Max", cell: (r) => r.max_marks }]} />
      <div className="mt-8"><Panel title="New assignment">
        {opts.length === 0 ? <p className="text-sm text-slate-600">You need a class to publish to. Ask your administrator to assign you in the timetable.</p> : (
          <Form action={addAssignment} submit="Publish" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="courseId" label="Course" options={[...new Map(opts.map((o) => [o.course_id, { value: o.course_id, label: `${o.code} · ${o.course}` }])).values()]} />
              <Field name="sectionId" label="Section" options={[...new Map(opts.map((o) => [o.section_id, { value: o.section_id, label: `${o.program} · Y${o.year_no} ${o.section}` }])).values()]} />
              <Field name="title" label="Title" /><Field name="maxMarks" label="Max marks" type="number" defaultValue={10} min={1} />
              <Field name="dueAt" label="Due" type="datetime-local" />
              <div className="sm:col-span-2"><Field name="description" label="Instructions" rows={3} required={false} /></div>
            </div>
          </Form>)}
      </Panel></div>
    </>
  );
}
