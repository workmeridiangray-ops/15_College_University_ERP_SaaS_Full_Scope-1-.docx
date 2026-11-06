import Link from "next/link";
import { requireUser, inr } from "@/lib/web";
import { staffDashboard } from "@/services/dashboard";
import { getInstitution } from "@/services/core";
import { PageHeader, Stat, Section, Notice, Table, Empty } from "@/components/ui";
import { can } from "@/lib/permissions";
import { one } from "@/lib/db";
export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const u = await requireUser();
  const d = await staffDashboard(u);
  const inst = await getInstitution(u);
  const empty = u.role === "institution_admin" && (d.programs ?? 0) === 0;
  const slug = (await one<{ slug: string }>("SELECT slug FROM institutions WHERE id=$1", [u.institutionId]))?.slug ?? "";
  return (
    <>
      <PageHeader title={`Welcome, ${u.name.split(" ")[0]}`} subtitle={inst?.name} />
      {(await searchParams).welcome && <Notice>Your workspace is ready. Follow the setup steps below to get your institution running.</Notice>}
      {empty && (
        <Section title="Get started">
          <ol className="card divide-y divide-slate-100 text-sm">
            {[["1. Add departments, programs and sections", "/app/academics"], ["2. Add your staff and faculty", "/app/users"], ["3. Open admissions or add students", "/app/students"], ["4. Set up fee structures", "/app/fees"], ["5. Build the timetable", "/app/timetable"]].map(([t, h]) => <li key={h}><Link href={h} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"><span>{t}</span><span className="text-brand-600">Open →</span></Link></li>)}
          </ol>
        </Section>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {d.students !== undefined && <Stat label="Active students" value={d.students} />}
        {d.pendingApps !== undefined && <Stat label="Applications to review" value={d.pendingApps} tone={d.pendingApps ? "warn" : undefined} />}
        {d.fees && <Stat label="Fees collected" value={inr(d.fees.collectedPaise)} hint={`Outstanding ${inr(d.fees.outstandingPaise)}`} tone="good" />}
        {d.lowAttendance !== undefined && <Stat label="Low-attendance records" value={d.lowAttendance} hint="Below 75%" tone={d.lowAttendance ? "warn" : undefined} />}
        {d.pendingLeaves !== undefined && <Stat label="Leave requests pending" value={d.pendingLeaves} />}
        {d.overdueBooks !== undefined && <Stat label="Overdue library books" value={d.overdueBooks} tone={d.overdueBooks ? "warn" : undefined} />}
      </div>
      {d.today && (
        <Section title="Your classes today">
          <Table rows={d.today} empty={<Empty title="No classes scheduled for you today" />} cols={[{ header: "Time", cell: (r) => `${r.start_time}–${r.end_time}` }, { header: "Course", cell: (r) => `${r.code} · ${r.course}` }, { header: "Section", cell: (r) => r.section }, { header: "Room", cell: (r) => r.room }, { header: "", cell: () => <Link className="btn-secondary btn-sm" href="/app/attendance">Mark attendance</Link> }]} />
        </Section>
      )}
      {can(u.role, "admissions.manage") && <Section title="Public application page"><p className="text-sm text-slate-600">Share this link so applicants can apply online: <code className="rounded bg-slate-100 px-1.5 py-0.5">/apply/{slug}</code></p></Section>}
    </>
  );
}

