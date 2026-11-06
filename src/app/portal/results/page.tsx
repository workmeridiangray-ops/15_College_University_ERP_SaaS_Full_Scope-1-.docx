import { PortalPage } from "@/components/portal-page";
import { transcript } from "@/services/academics";
import { Table, Empty, Stat } from "@/components/ui";
export const metadata = { title: "Results" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  return <PortalPage path="/portal/results" title="Results" child={(await searchParams).child}>{async ({ user, studentId }) => {
    const t = await transcript(user, studentId);
    if (!t.courses.length) return <Empty title="No results published yet" hint="Results appear here as soon as your institution publishes them." />;
    return (<><div className="mb-5 max-w-xs"><Stat label="GPA (out of 10)" value={t.gpa ?? "—"} /></div>
      <Table rows={t.courses} empty={null} cols={[{ header: "Course", cell: (r) => <div><p className="font-medium">{r.code} · {r.name}</p><p className="text-xs text-slate-500">{r.exams.map((e) => `${e.exam}: ${e.obtained}/${e.max}`).join(" · ")}</p></div> }, { header: "Credits", cell: (r) => r.credits }, { header: "Score", cell: (r) => `${r.percentage}%` }, { header: "Grade", cell: (r) => <strong>{r.grade}</strong> }]} /></>);
  }}</PortalPage>;
}
