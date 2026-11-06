import { requirePerm } from "@/lib/web";
import { teachingOptions, sectionRoster } from "@/services/academics";
import { PageHeader, Empty, Notice } from "@/components/ui";
import { AttendanceSheet } from "./sheet";
import { AppError } from "@/lib/errors";
export const metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

export default async function Attendance({ searchParams }: { searchParams: Promise<{ pick?: string; date?: string }> }) {
  const u = await requirePerm("attendance.mark");
  const sp = await searchParams;
  const opts = await teachingOptions(u);
  const date = sp.date ?? new Date().toISOString().slice(0, 10);
  const chosen = opts.find((o) => `${o.course_id}|${o.section_id}` === sp.pick);
  let roster: any[] = [], err: string | null = null;
  if (chosen) { try { roster = (await sectionRoster(u, chosen.section_id, chosen.course_id, date)) as any[]; } catch (e) { if (e instanceof AppError) err = e.message; else throw e; } }
  return (
    <>
      <PageHeader title="Attendance" subtitle="Pick a class and date, mark who is present, and save." />
      {opts.length === 0 ? <Empty title="You have no classes to mark" hint={u.role === "faculty" ? "Ask your administrator to assign you to a class in the timetable." : "Create sections and courses under Academics first."} /> : (
        <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-4">
          <div className="sm:col-span-2"><label className="label" htmlFor="pick">Class</label><select id="pick" name="pick" defaultValue={sp.pick ?? ""} className="input" required><option value="" disabled>Select a class</option>{opts.map((o) => <option key={`${o.course_id}|${o.section_id}`} value={`${o.course_id}|${o.section_id}`}>{o.code} · {o.course} — {o.program} Y{o.year_no} {o.section}</option>)}</select></div>
          <div><label className="label" htmlFor="date">Date</label><input id="date" name="date" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={date} className="input" required /></div>
          <div className="flex items-end"><button className="btn-primary w-full">Load class</button></div>
        </form>)}
      {err && <Notice tone="danger">{err}</Notice>}
      {chosen && !err && (roster.length === 0 ? <Empty title="No active students in this section" hint="Add students to the section from their profiles." /> : <AttendanceSheet courseId={chosen.course_id} sectionId={chosen.section_id} date={date} roster={roster.map((r) => ({ id: r.id, name: r.name, enrolment: r.enrolment_no, status: r.status }))} />)}
    </>
  );
}
