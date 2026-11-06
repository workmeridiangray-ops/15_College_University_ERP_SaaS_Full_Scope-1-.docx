import { PortalPage } from "@/components/portal-page";
import { studentAttendance } from "@/services/academics";
import { Table, Empty } from "@/components/ui";
export const metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  return <PortalPage path="/portal/attendance" title="Attendance" child={(await searchParams).child}>{async ({ user, studentId }) => <Table rows={(await studentAttendance(user, studentId)) as any[]} empty={<Empty title="No attendance recorded yet" />} cols={[{ header: "Course", cell: (r) => `${r.code} · ${r.name}` }, { header: "Attended", cell: (r) => `${r.present} of ${r.total} classes` }, { header: "Percentage", cell: (r) => <span className={Number(r.pct) < 75 ? "font-semibold text-red-600" : "font-medium text-emerald-700"}>{r.pct ?? "—"}%{Number(r.pct) < 75 ? " · below 75%" : ""}</span> }]} />}</PortalPage>;
}
