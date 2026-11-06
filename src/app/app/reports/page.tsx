import { requirePerm, inr } from "@/lib/web";
import { lowAttendance } from "@/services/academics";
import { collectionSummary } from "@/services/fees";
import { PageHeader, Stat, Table, Empty, Section } from "@/components/ui";
import { can } from "@/lib/permissions";
import { query } from "@/lib/db";
export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";
export default async function Reports() {
  const u = await requirePerm("reports.read");
  const low = (await lowAttendance(u)) as any[];
  const fees = can(u.role, "fees.read") ? await collectionSummary(u) : null;
  const byProgram = (await query(`SELECT p.name, count(s.id)::int students, p.seats FROM programs p LEFT JOIN students s ON s.program_id=p.id AND s.status='active' WHERE p.institution_id=$1 GROUP BY p.id ORDER BY p.name`, [u.institutionId])).rows as any[];
  return (
    <>
      <PageHeader title="Reports" actions={<a className="btn-secondary" href="/api/export/low-attendance" download>Export low attendance CSV</a>} />
      {fees && <div className="mb-8 grid gap-4 sm:grid-cols-3"><Stat label="Billed" value={inr(fees.billedPaise)} /><Stat label="Collected" value={inr(fees.collectedPaise)} tone="good" /><Stat label="Outstanding" value={inr(fees.outstandingPaise)} tone="warn" /></div>}
      <Section title="Enrolment by program"><Table rows={byProgram} empty={<Empty title="No programs yet" />} cols={[{ header: "Program", cell: (r) => r.name }, { header: "Active students", cell: (r) => r.students }, { header: "Seats", cell: (r) => r.seats }, { header: "Filled", cell: (r) => `${Math.round((r.students / r.seats) * 100)}%` }]} /></Section>
      <Section title="Attendance below 75%"><Table rows={low} empty={<Empty title="No attendance concerns" hint="Everyone with recorded attendance is at or above 75%." />} cols={[{ header: "Student", cell: (r) => `${r.name} (${r.enrolment_no})` }, { header: "Course", cell: (r) => r.course }, { header: "Attendance", cell: (r) => <span className="font-semibold text-red-600">{r.pct}%</span> }]} /></Section>
    </>
  );
}
