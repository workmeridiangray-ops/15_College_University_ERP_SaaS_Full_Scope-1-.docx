import { requirePerm, WEEKDAYS } from "@/lib/web";
import { structure } from "@/services/core";
import { sectionTimetable, myTeachingTimetable, facultyList } from "@/services/academics";
import { PageHeader, Panel, Table, Empty } from "@/components/ui";
import { Form, Field, ActionButton } from "@/components/form";
import { addSlot, removeSlot } from "@/actions/admin";
import { can } from "@/lib/permissions";
export const metadata = { title: "Timetable" };
export const dynamic = "force-dynamic";

export default async function Timetable({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const u = await requirePerm("attendance.read");
  const manage = can(u.role, "timetable.manage");
  const sectionId = (await searchParams).section;
  const s = can(u.role, "students.read") ? await structure(u) : { sections: [], courses: [] };
  const rows = sectionId ? await sectionTimetable(u, sectionId) : u.role === "faculty" ? await myTeachingTimetable(u) : [];
  const faculty = manage ? await facultyList(u) : [];
  return (
    <>
      <PageHeader title="Timetable" subtitle={sectionId ? "Weekly schedule for the selected section." : u.role === "faculty" ? "Your weekly teaching schedule." : "Choose a section to view or edit its schedule."} />
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4"><div className="min-w-60 flex-1"><label className="label" htmlFor="section">Section</label><select id="section" name="section" defaultValue={sectionId ?? ""} className="input"><option value="">{u.role === "faculty" ? "My teaching schedule" : "Select a section"}</option>{(s.sections as any[]).map((x) => <option key={x.id} value={x.id}>{x.program} · Year {x.year_no} · {x.name}</option>)}</select></div><button className="btn-primary">View</button></form>
      <Table rows={rows as any[]} empty={<Empty title="Nothing scheduled" hint={manage ? "Add the first class below." : "No classes are scheduled yet."} />}
        cols={[{ header: "Day", cell: (r) => WEEKDAYS[r.weekday] }, { header: "Time", cell: (r) => `${r.start_time}–${r.end_time}` }, { header: "Course", cell: (r) => `${r.course_code} · ${r.course}` }, { header: "Section", cell: (r) => r.section }, { header: "Faculty", cell: (r) => r.faculty }, { header: "Room", cell: (r) => r.room },
          ...(manage ? [{ header: "", cell: (r: any) => <ActionButton action={removeSlot} label="Remove" variant="danger" confirm="Remove this class from the timetable?" fields={{ id: r.id }} /> }] : [])]} />
      {manage && (
        <div className="mt-8"><Panel title="Add a class">
          {(s.sections as any[]).length === 0 || (s.courses as any[]).length === 0 || faculty.length === 0 ? <p className="text-sm text-slate-600">You need at least one section, one course and one faculty member before scheduling. Set them up under Academics and Staff accounts.</p> : (
            <Form action={addSlot} submit="Add to timetable" resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field name="sectionId" label="Section" defaultValue={sectionId} options={(s.sections as any[]).map((x) => ({ value: x.id, label: `${x.program} · Year ${x.year_no} · ${x.name}` }))} />
                <Field name="courseId" label="Course" options={(s.courses as any[]).map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))} />
                <Field name="facultyUserId" label="Faculty" options={faculty.map((f) => ({ value: f.id, label: f.name }))} />
                <Field name="weekday" label="Day" options={WEEKDAYS.slice(1, 7).map((d, i) => ({ value: String(i + 1), label: d }))} />
                <Field name="startTime" label="Start" type="time" /><Field name="endTime" label="End" type="time" />
                <Field name="room" label="Room" placeholder="R-101" />
              </div>
            </Form>)}
        </Panel></div>
      )}
    </>
  );
}
