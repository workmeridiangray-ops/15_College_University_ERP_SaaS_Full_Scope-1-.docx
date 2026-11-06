import { requirePerm, fmtDate } from "@/lib/web";
import { listApplications } from "@/services/students";
import { PageHeader, Table, Badge, Empty, Notice } from "@/components/ui";
import { ActionButton, Form, Field } from "@/components/form";
import { decideApp } from "@/actions/admin";
import { one } from "@/lib/db";
export const metadata = { title: "Admissions" };
export const dynamic = "force-dynamic";

const NEXT: Record<string, { to: string; label: string; variant?: "primary" | "danger" }[]> = {
  submitted: [{ to: "under_review", label: "Start review", variant: "primary" }, { to: "rejected", label: "Reject", variant: "danger" }],
  under_review: [{ to: "shortlisted", label: "Shortlist", variant: "primary" }, { to: "rejected", label: "Reject", variant: "danger" }],
  shortlisted: [{ to: "accepted", label: "Accept & enrol", variant: "primary" }, { to: "rejected", label: "Reject", variant: "danger" }],
};

export default async function Admissions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const u = await requirePerm("admissions.manage");
  const status = (await searchParams).status;
  const apps = (await listApplications(u, status)) as any[];
  const slug = (await one<{ slug: string }>("SELECT slug FROM institutions WHERE id=$1", [u.institutionId]))?.slug;
  return (
    <>
      <PageHeader title="Admissions" subtitle="Review applications and enrol accepted students." />
      <Notice>Applicants apply at <code className="rounded bg-white px-1.5 py-0.5">/apply/{slug}</code>. Accepting an application creates the student record and a one-time account activation link.</Notice>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">{["", "submitted", "under_review", "shortlisted", "accepted", "rejected"].map((s) => <a key={s} href={s ? `?status=${s}` : "?"} className={`btn-sm ${((status ?? "") === s) ? "btn-primary" : "btn-secondary"}`}>{s ? s.replace("_", " ") : "All"}</a>)}</div>
      <Table rows={apps} empty={<Empty title="No applications yet" hint="Once applicants submit the public form, they appear here." />}
        cols={[{ header: "Applicant", cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.email} · {r.phone}</p></div> }, { header: "Program", cell: (r) => r.program }, { header: "Score", cell: (r) => r.previous_percentage ? `${r.previous_percentage}%` : "—" }, { header: "Applied", cell: (r) => fmtDate(r.created_at) }, { header: "Status", cell: (r) => <Badge>{r.status}</Badge> }, { header: "Documents", cell: (r) => (r.docs as { id: string; name: string }[]).length ? <ul className="space-y-1 text-xs">{(r.docs as { id: string; name: string }[]).map((d) => <li key={d.id}><a className="text-brand-600 hover:underline" href={`/api/files/${d.id}`} download>{d.name}</a></li>)}</ul> : <span className="text-xs text-slate-400">None</span> },
          { header: "Action", cell: (r) => (NEXT[r.status] ?? []).length ? (
            <div className="flex flex-wrap gap-2">{NEXT[r.status].map((n) => <ActionButton key={n.to} action={decideApp} label={n.label} variant={n.variant ?? "secondary"} confirm={n.to === "rejected" ? `Reject ${r.name}'s application?` : n.to === "accepted" ? `Accept ${r.name} and create their student account?` : undefined} fields={{ id: r.id, status: n.to, email: r.email }} />)}</div>
          ) : <span className="text-xs text-slate-400">Final</span> }]} />
    </>
  );
}
