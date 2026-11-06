import Link from "next/link";
import { requirePerm } from "@/lib/web";
import { getInstitution } from "@/services/core";
import { PageHeader, Panel, Badge, Stat } from "@/components/ui";
import { Form, Field } from "@/components/form";
import { updateProfile } from "@/actions/admin";
import { fmtDate } from "@/lib/web";
import { query } from "@/lib/db";
export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function Settings() {
  const u = await requirePerm("org.manage");
  const i = (await getInstitution(u))!;
  const usage = (await query<{ s: string; t: string }>("SELECT (SELECT count(*) FROM students WHERE institution_id=$1) s, (SELECT count(*) FROM staff WHERE institution_id=$1) t", [u.institutionId])).rows[0];
  return (
    <>
      <PageHeader title="Settings" subtitle="Institution profile and subscription." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Plan" value={i.plan_name} hint={`Status: ${i.status}${i.trial_ends_at && i.status === "trial" ? ` · trial ends ${fmtDate(i.trial_ends_at)}` : ""}`} />
        <Stat label="Students" value={`${usage.s} / ${i.max_students.toLocaleString("en-IN")}`} />
        <Stat label="Staff accounts" value={`${usage.t} / ${i.max_staff.toLocaleString("en-IN")}`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Institution profile">
          <Form action={updateProfile} submit="Save profile">
            <div className="space-y-4"><Field name="name" label="Institution name" defaultValue={i.name} /><Field name="contactEmail" label="Contact email" type="email" defaultValue={i.contact_email ?? ""} /><Field name="address" label="Address" rows={3} required={false} defaultValue={i.address ?? ""} /></div>
          </Form>
        </Panel>
        <Panel title="Subscription">
          <p className="text-sm text-slate-600">To upgrade, renew, or change your plan, open a request on the <Link className="text-brand-600 underline" href="/app/support">Support</Link> page. Plan limits are enforced automatically when you add students or staff.</p>
          <p className="mt-3 text-sm">Status: <Badge>{i.status}</Badge></p>
        </Panel>
      </div>
    </>
  );
}
