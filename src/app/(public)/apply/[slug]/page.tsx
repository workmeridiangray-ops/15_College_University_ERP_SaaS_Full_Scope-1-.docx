import { notFound } from "next/navigation";
import Link from "next/link";
import { Form, Field } from "@/components/form";
import { applyAction } from "@/actions/public";
import { listPublicPrograms } from "@/services/students";
import { AppError } from "@/lib/errors";
export const dynamic = "force-dynamic";
export const metadata = { title: "Apply for admission" };
export default async function Apply({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let data;
  try { data = await listPublicPrograms(slug); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Apply to {data.institution}</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Takes about three minutes. You can attach documents after you submit. Already applied? <Link className="text-brand-600 hover:underline" href="/track">Track your application</Link>.</p>
      {data.programs.length === 0 ? <div className="card p-6 text-sm text-slate-600">This institution has not opened any programs for applications yet. Please check back soon.</div> : (
        <div className="card p-6">
          <Form action={applyAction} submit="Submit application" pendingLabel="Submitting…" resetOnSuccess reload={false}>
            <input type="hidden" name="institutionSlug" value={slug} />
            <div className="space-y-4">
              <Field name="programId" label="Program" options={(data.programs as any[]).map((p) => ({ value: p.id, label: `${p.name} (${p.duration_years} yr)` }))} />
              <Field name="name" label="Full name" autoComplete="name" />
              <div className="grid gap-4 sm:grid-cols-2"><Field name="email" label="Email" type="email" autoComplete="email" /><Field name="phone" label="Mobile number" type="tel" autoComplete="tel" /></div>
              <div className="grid gap-4 sm:grid-cols-2"><Field name="dob" label="Date of birth" type="date" required={false} /><Field name="previousPercentage" label="Previous exam percentage" type="number" min={0} max={100} step="0.01" /></div>
            </div>
          </Form>
        </div>
      )}
    </div>
  );
}
