import { requirePerm } from "@/lib/web";
import { structure } from "@/services/core";
import { PageHeader, Panel, Table, Empty } from "@/components/ui";
import { Form, Field } from "@/components/form";
import { addDepartment, addProgram, addSection, addCourse } from "@/actions/admin";
import { can } from "@/lib/permissions";
export const metadata = { title: "Academics" };
export const dynamic = "force-dynamic";

export default async function Academics() {
  const u = await requirePerm("students.read");
  const s = await structure(u);
  const edit = can(u.role, "academics.manage");
  const deps = s.departments as any[], progs = s.programs as any[];
  return (
    <>
      <PageHeader title="Academics" subtitle="Departments, programs, sections and courses." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4"><h2 className="font-semibold">Departments</h2>
          <Table rows={deps} empty={<Empty title="No departments yet" hint="Start by adding your first department." />} cols={[{ header: "Code", cell: (r) => r.code }, { header: "Name", cell: (r) => r.name }]} />
          {edit && <Panel title="Add department"><Form action={addDepartment} submit="Add department" resetOnSuccess><div className="grid gap-3 sm:grid-cols-2"><Field name="name" label="Name" /><Field name="code" label="Code" placeholder="CS" /></div></Form></Panel>}
        </div>
        <div className="space-y-4"><h2 className="font-semibold">Programs</h2>
          <Table rows={progs} empty={<Empty title="No programs yet" hint="Add a department, then a program inside it." />} cols={[{ header: "Code", cell: (r) => r.code }, { header: "Program", cell: (r) => r.name }, { header: "Department", cell: (r) => r.department }, { header: "Years", cell: (r) => r.duration_years }, { header: "Seats", cell: (r) => r.seats }]} />
          {edit && deps.length > 0 && <Panel title="Add program"><Form action={addProgram} submit="Add program" resetOnSuccess><div className="grid gap-3 sm:grid-cols-2"><Field name="name" label="Name" /><Field name="code" label="Code" /><Field name="departmentId" label="Department" options={deps.map((d) => ({ value: d.id, label: d.name }))} /><Field name="durationYears" label="Duration (years)" type="number" defaultValue={3} min={1} max={8} /><Field name="seats" label="Seats" type="number" defaultValue={60} min={1} /></div></Form></Panel>}
        </div>
        <div className="space-y-4"><h2 className="font-semibold">Sections</h2>
          <Table rows={s.sections as any[]} empty={<Empty title="No sections yet" hint="Sections group students into classes for timetables and attendance." />} cols={[{ header: "Program", cell: (r) => r.program }, { header: "Year", cell: (r) => r.year_no }, { header: "Section", cell: (r) => r.name }]} />
          {edit && progs.length > 0 && <Panel title="Add section"><Form action={addSection} submit="Add section" resetOnSuccess><div className="grid gap-3 sm:grid-cols-3"><Field name="programId" label="Program" options={progs.map((p) => ({ value: p.id, label: p.name }))} /><Field name="yearNo" label="Year" type="number" defaultValue={1} min={1} max={8} /><Field name="name" label="Section" placeholder="A" /></div></Form></Panel>}
        </div>
        <div className="space-y-4"><h2 className="font-semibold">Courses</h2>
          <Table rows={s.courses as any[]} empty={<Empty title="No courses yet" hint="Courses are the subjects taught in a program." />} cols={[{ header: "Code", cell: (r) => r.code }, { header: "Course", cell: (r) => r.name }, { header: "Program", cell: (r) => r.program }, { header: "Credits", cell: (r) => r.credits }, { header: "Sem", cell: (r) => r.semester }]} />
          {edit && progs.length > 0 && <Panel title="Add course"><Form action={addCourse} submit="Add course" resetOnSuccess><div className="grid gap-3 sm:grid-cols-2"><Field name="programId" label="Program" options={progs.map((p) => ({ value: p.id, label: p.name }))} /><Field name="code" label="Code" /><Field name="name" label="Name" /><Field name="credits" label="Credits" type="number" defaultValue={3} min={1} /><Field name="semester" label="Semester" type="number" defaultValue={1} min={1} /></div></Form></Panel>}
        </div>
      </div>
    </>
  );
}
