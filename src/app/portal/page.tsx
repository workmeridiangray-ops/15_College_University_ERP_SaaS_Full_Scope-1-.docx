import Link from "next/link";
import { inr, fmtDateTime } from "@/lib/web";
import { PortalPage } from "@/components/portal-page";
import { portalOverview } from "@/services/portal";
import { Stat, Section, Table, Empty } from "@/components/ui";
export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";
export default async function Overview({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const { child } = await searchParams;
  return <PortalPage path="/portal" title="Overview" child={child}>{async ({ user, studentId }) => {
    const o = await portalOverview(user, studentId);
    const q = child ? `?child=${child}` : "";
    return (<>
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Attendance" value={o.attendancePct === null ? "—" : `${o.attendancePct}%`} tone={o.attendancePct !== null && o.attendancePct < 75 ? "warn" : undefined} hint={o.attendancePct !== null && o.attendancePct < 75 ? "Below the 75% requirement" : undefined} /><Stat label="GPA (published results)" value={o.gpa ?? "—"} /><Stat label="Fees due" value={inr(o.dueRupeesPaise)} tone={o.dueRupeesPaise ? "warn" : "good"} /></div>
      <Section title="Upcoming assignments"><Table rows={o.upcoming as any[]} empty={<Empty title="Nothing due" hint="You're up to date." />} cols={[{ header: "Assignment", cell: (r) => <Link className="text-brand-600 hover:underline" href={`/portal/assignments${q}`}>{r.title}</Link> }, { header: "Course", cell: (r) => r.code }, { header: "Due", cell: (r) => fmtDateTime(r.due_at) }]} /></Section>
    </>);
  }}</PortalPage>;
}
