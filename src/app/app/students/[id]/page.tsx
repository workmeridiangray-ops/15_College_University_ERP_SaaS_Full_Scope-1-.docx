import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm, fmtDate, inr } from "@/lib/web";
import { getStudent } from "@/services/students";
import { listInvoices } from "@/services/fees";
import { studentAttendance, transcript } from "@/services/academics";
import { AppError } from "@/lib/errors";
import { PageHeader, Panel, Badge, Table, Section, Empty } from "@/components/ui";
import { Form, Field, ActionButton } from "@/components/form";
import { UploadBox } from "@/components/upload";
import { addGuardian, setStudentStatus } from "@/actions/admin";
import { can } from "@/lib/permissions";
export const dynamic = "force-dynamic";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePerm("students.read");
  const { id } = await params;
  let data;
  try { data = await getStudent(u, id); } catch (e) { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; }
  const s = data.student as any;
  const canWrite = can(u.role, "students.write");
  const [att, tr, inv] = await Promise.all([can(u.role, "attendance.read") ? studentAttendance(u, id) : [], transcript(u, id), can(u.role, "fees.read") ? listInvoices(u, { studentId: id }) : []]);
  return (
    <>
      <PageHeader title={s.name} subtitle={`${s.enrolment_no} · ${s.program}${s.section ? ` · Section ${s.section}` : ""}`} actions={<><Badge>{s.status}</Badge><Link className="btn-secondary" href="/app/students">← All students</Link></>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Details"><dl className="space-y-2 text-sm"><div><dt className="text-slate-500">Email</dt><dd>{s.email ?? "—"}</dd></div><div><dt className="text-slate-500">Phone</dt><dd>{s.phone ?? "—"}</dd></div><div><dt className="text-slate-500">Date of birth</dt><dd>{fmtDate(s.dob)}</dd></div><div><dt className="text-slate-500">Admitted</dt><dd>{fmtDate(s.admitted_on)}</dd></div></dl>
          {canWrite && <div className="mt-4 flex flex-wrap gap-2">{s.status === "active" ? <><ActionButton action={setStudentStatus} label="Mark withdrawn" confirm="Mark this student as withdrawn? They will lose portal access." fields={{ id, status: "withdrawn" }} /><ActionButton action={setStudentStatus} label="Mark graduated" fields={{ id, status: "graduated" }} /></> : <ActionButton action={setStudentStatus} label="Reactivate" fields={{ id, status: "active" }} />}</div>}
        </Panel>
        <div className="lg:col-span-2"><Panel title="Guardians">
          {(data.guardians as any[]).length === 0 ? <p className="mb-4 text-sm text-slate-500">No guardians linked yet. Add one so a parent can follow progress in the parent portal.</p> : <ul className="mb-4 divide-y divide-slate-100 text-sm">{(data.guardians as any[]).map((g) => <li key={g.id} className="py-2"><span className="font-medium">{g.name}</span> · {g.relation} · {g.email} {g.phone && `· ${g.phone}`}</li>)}</ul>}
          {canWrite && <Form action={addGuardian} submit="Add guardian" pendingLabel="Adding…" resetOnSuccess><input type="hidden" name="studentId" value={id} /><div className="grid gap-3 sm:grid-cols-2"><Field name="name" label="Name" /><Field name="relation" label="Relation" placeholder="Mother, Father…" /><Field name="email" label="Email" type="email" /><Field name="phone" label="Phone" type="tel" required={false} /></div></Form>}
        </Panel></div>
      </div>
      <Section title="Documents"><div className="card p-5">
        {(data.documents as any[]).length === 0 ? <p className="mb-3 text-sm text-slate-500">No documents uploaded.</p> : <ul className="mb-4 divide-y divide-slate-100 text-sm">{(data.documents as any[]).map((d) => <li key={d.id} className="flex items-center justify-between py-2"><span>{d.filename} <span className="text-slate-400">({Math.round(d.size_bytes / 1024)} KB)</span></span><a className="text-brand-600 hover:underline" href={`/api/files/${d.id}`}>Download</a></li>)}</ul>}
        {canWrite && <UploadBox fields={{ studentId: id }} />}
      </div></Section>
      {(att as any[]).length > 0 && <Section title="Attendance"><Table rows={att as any[]} empty={null} cols={[{ header: "Course", cell: (r) => `${r.code} · ${r.name}` }, { header: "Attended", cell: (r) => `${r.present}/${r.total}` }, { header: "%", cell: (r) => <span className={Number(r.pct) < 75 ? "font-semibold text-red-600" : ""}>{r.pct ?? "—"}</span> }]} /></Section>}
      {tr.courses.length > 0 && <Section title={`Results · GPA ${tr.gpa}`}><Table rows={tr.courses} empty={null} cols={[{ header: "Course", cell: (r) => `${r.code} · ${r.name}` }, { header: "Credits", cell: (r) => r.credits }, { header: "%", cell: (r) => r.percentage }, { header: "Grade", cell: (r) => r.grade }]} /></Section>}
      {(inv as any[]).length > 0 && <Section title="Fees"><Table rows={inv as any[]} empty={null} cols={[{ header: "Invoice", cell: (r) => r.number }, { header: "For", cell: (r) => r.description }, { header: "Amount", cell: (r) => inr(r.amount_paise - r.concession_paise) }, { header: "Balance", cell: (r) => inr(r.balance_paise) }, { header: "Status", cell: (r) => <Badge>{r.status}</Badge> }]} /></Section>}
    </>
  );
}
