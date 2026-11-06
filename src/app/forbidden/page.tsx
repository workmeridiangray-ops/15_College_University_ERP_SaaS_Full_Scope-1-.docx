import Link from "next/link";
import { requireSession } from "@/lib/web";
import { homeFor } from "@/lib/permissions";
export const metadata = { title: "No access" };
export default async function Forbidden() {
  const u = await requireSession();
  return (<div className="mx-auto max-w-md px-4 py-24 text-center"><h1 className="text-2xl font-semibold">You don&apos;t have access to this page</h1><p className="mt-2 text-sm text-slate-500">Your role ({u.role.replace(/_/g, " ")}) doesn&apos;t include this area. If you need it, ask your institution administrator to change your role.</p><Link href={homeFor(u.role)} className="btn-primary mt-6">Back to my dashboard</Link></div>);
}
