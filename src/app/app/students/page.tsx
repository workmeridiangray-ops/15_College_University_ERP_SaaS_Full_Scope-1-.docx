import Link from "next/link";
import { requirePerm } from "@/lib/web";
import { listStudents } from "@/services/students";
import { structure } from "@/services/core";
import { PageHeader, Table, Badge, Empty, Pager, Panel } from "@/components/ui";
import { Form, Field } from "@/components/form";
import { addStudent } from "@/actions/admin";
import { can } from "@/lib/permissions";
export const metadata = { title: "Students" };
export const dynamic = "force-dynamic";

export default async function Students({ searchParams }: { searchParams: Promise<{ q?: string; program?: string; section?: string; status?: string; page?: string }> }) {
  const u = await requirePerm("students.read");
  const sp = await searchParams;
  const [list, s] = await Promise.all([listStudents(u, { search: sp.q, programId: sp.program, sectionId: sp.section, status: sp.status, page: Number(sp.page) || 1 }), structure(u)]);
  const qs = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Students" subtitle={`${list.total} student${list.total === 1 ? "" : "s"}`} actions={<a className="btn-secondary" href="/api/export/students" download>Export CSV</a>} />
      <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Search name, enrolment, email" className="input lg:col-span-2" aria-label="Search students" />
        <select name="program" defaultValue={sp.program ?? ""} className="input" aria-label="Program"><option value="">All programs</option>{(s.programs as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input" aria-label="Status"><option value="">Any status</option>{["active", "graduated", "withdrawn", "suspended"].map((x) => <option key={x}>{x}</option>)}</select>
        <button className="btn-primary">Filter</button>
      </form>
      <Table rows={list.rows as any[]} empty={<Empty title={sp.q || sp.program || sp.status ? "No students match these filters" : "No students yet"} hint="Add a student below, or accept applications from the Admissions page." />}
        cols={[{ header: "Enrolment", cell: (r) => <Link className="font-medium text-brand-600 hover:underline" href={`/app/students/${r.id}`}>{r.enrolment_no}</Link> }, { header: "Name", cell: (r) => r.name }, { header: "Program", cell: (r) => r.program }, { header: "Section", cell: (r) => r.section ? `Y${r.year_no} · ${r.section}` : "—" }, { header: "Status", cell: (r) => <Badge>{r.status}</Badge> }]} />
      <Pager page={list.page} pages={list.pages} href={qs} />
      {can(u.role, "students.write") && (
        <div className="mt-8"><Panel title="Add a student">
          {(s.programs as any[]).length === 0 ? <p className="text-sm text-slate-600">Create a program under <Link className="text-brand-600 underline" href="/app/academics">Academics</Link> first.</p> : (
            <Form action={addStudent} submit="Create student" pendingLabel="Creating…" resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="name" label="Full name" /><Field name="email" label="Email" type="email" />
                <Field name="phone" label="Phone" type="tel" required={false} /><Field name="dob" label="Date of birth" type="date" required={false} />
                <Field name="programId" label="Program" options={(s.programs as any[]).map((p) => ({ value: p.id, label: p.name }))} />
                <Field name="sectionId" label="Section" required={false} options={(s.sections as any[]).map((x) => ({ value: x.id, label: `${x.program} · Year ${x.year_no} · ${x.name}` }))} />
              </div>
            </Form>)}
        </Panel></div>
      )}
    </>
  );
}
