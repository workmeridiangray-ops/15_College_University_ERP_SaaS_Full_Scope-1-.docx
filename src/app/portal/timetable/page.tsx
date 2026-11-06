import { WEEKDAYS } from "@/lib/web";
import { PortalPage } from "@/components/portal-page";
import { studentTimetable } from "@/services/academics";
import { Table, Empty } from "@/components/ui";
export const metadata = { title: "Timetable" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  return <PortalPage path="/portal/timetable" title="Timetable" child={(await searchParams).child}>{async ({ user, studentId }) => <Table rows={(await studentTimetable(user, studentId)) as any[]} empty={<Empty title="No timetable yet" hint="Your classes will appear once the institution schedules them." />} cols={[{ header: "Day", cell: (r) => WEEKDAYS[r.weekday] }, { header: "Time", cell: (r) => `${r.start_time}–${r.end_time}` }, { header: "Course", cell: (r) => `${r.course_code} · ${r.course}` }, { header: "Faculty", cell: (r) => r.faculty }, { header: "Room", cell: (r) => r.room }]} />}</PortalPage>;
}
