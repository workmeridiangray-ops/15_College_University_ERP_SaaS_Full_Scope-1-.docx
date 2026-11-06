import { requireUser } from "@/lib/web";
import { platformStats } from "@/services/platform";
import { PageHeader, Stat } from "@/components/ui";
export const metadata = { title: "Platform overview" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const s = await platformStats(await requireUser(["super_admin"]));
  return (<><PageHeader title="Platform overview" subtitle="Real customers only; demo institutions are excluded from these counts." /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Stat label="Institutions" value={s.institutions} /><Stat label="Active (paying)" value={s.active} tone="good" /><Stat label="On trial" value={s.trial} /><Stat label="Need attention" value={s.attention} hint="Suspended or past due" tone={s.attention ? "warn" : undefined} /><Stat label="Students on platform" value={s.students} /><Stat label="Open support tickets" value={s.open_tickets} tone={s.open_tickets ? "warn" : undefined} /></div></>);
}
