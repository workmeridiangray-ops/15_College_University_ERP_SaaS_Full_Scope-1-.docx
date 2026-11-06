import Link from "next/link";
import { query } from "@/lib/db";
import { inr } from "@/lib/web";
export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";
export default async function Pricing() {
  const plans = (await query<{ code: string; name: string; price_inr_monthly: number; max_students: number; max_staff: number }>("SELECT code, name, price_inr_monthly, max_students, max_staff FROM plans ORDER BY price_inr_monthly")).rows;
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-center text-3xl font-semibold">Simple pricing for every campus</h1>
      <p className="mt-3 text-center text-slate-600">All plans include every module. Start with a 14-day free trial.</p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.code} className="card flex flex-col p-6">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-3 text-3xl font-semibold">{inr(p.price_inr_monthly * 100).replace(".00", "")}<span className="text-sm font-normal text-slate-500"> / month</span></p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600"><li>Up to {p.max_students.toLocaleString("en-IN")} students</li><li>Up to {p.max_staff.toLocaleString("en-IN")} staff accounts</li><li>Student and parent portals</li><li>Email support</li></ul>
            <Link href={`/signup?plan=${p.code}`} className="btn-primary mt-6">Start free trial</Link>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">Prices exclude GST. Billing is arranged with our team at the end of your trial.</p>
    </div>
  );
}
