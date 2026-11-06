import { requirePerm } from "@/lib/web";
import { listStaff, structure } from "@/services/core";
import { PageHeader, Table, Badge, Panel, Notice } from "@/components/ui";
import { Form, Field, ActionButton } from "@/components/form";
import { createStaff, toggleUser, resetLinkFor } from "@/actions/admin";
export const metadata = { title: "Staff accounts" };
export const dynamic = "force-dynamic";
const ROLES = [["faculty", "Faculty"], ["hod", "Head of department"], ["admissions_officer", "Admissions officer"], ["accountant", "Accountant"], ["librarian", "Librarian"], ["hr_manager", "HR manager"], ["institution_admin", "Administrator"]];

export default async function Users() {
  const u = await requirePerm("users.manage");
  const [staff, s] = await Promise.all([listStaff(u), structure(u)]);
  return (
    <>
      <PageHeader title="Staff accounts" subtitle="Create logins and control what each person can do." />
      <Table rows={staff as any[]} empty={null} cols={[{ header: "Name", cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.email}</p></div> }, { header: "Role", cell: (r) => <span className="capitalize">{String(r.role).replace(/_/g, " ")}</span> }, { header: "Employee no.", cell: (r) => r.employee_no ?? "—" }, { header: "Department", cell: (r) => r.department ?? "—" }, { header: "Status", cell: (r) => <Badge tone={r.active ? "active" : "cancelled"}>{r.active ? "active" : "deactivated"}</Badge> },
        { header: "Actions", cell: (r) => <div className="flex flex-wrap gap-2"><ActionButton action={resetLinkFor} label="Reset link" fields={{ id: r.id, email: r.email }} />{r.id !== u.id && <ActionButton action={toggleUser} label={r.active ? "Deactivate" : "Reactivate"} variant={r.active ? "danger" : "secondary"} confirm={r.active ? `Deactivate ${r.name}? They will be signed out immediately.` : undefined} fields={{ id: r.id, active: String(!r.active) }} />}</div> }]} />
      <div className="mt-8"><Panel title="Create a staff account">
        <Notice tone="warn">Give the person this temporary password securely. They will be forced to choose their own at first sign-in.</Notice>
        <Form action={createStaff} submit="Create account" pendingLabel="Creating…" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="name" label="Full name" /><Field name="email" label="Email" type="email" />
            <Field name="role" label="Role" options={ROLES.map(([value, label]) => ({ value, label }))} defaultValue="faculty" />
            <Field name="designation" label="Designation" placeholder="Assistant Professor" />
            <Field name="departmentId" label="Department" required={false} options={(s.departments as any[]).map((d) => ({ value: d.id, label: d.name }))} />
            <Field name="baseSalary" label="Monthly salary (₹)" type="number" min={0} defaultValue={0} required={false} />
            <Field name="phone" label="Phone" type="tel" required={false} />
            <Field name="password" label="Temporary password" type="text" autoComplete="off" hint="At least 10 characters, with letters and a number." />
          </div>
        </Form>
      </Panel></div>
    </>
  );
}
