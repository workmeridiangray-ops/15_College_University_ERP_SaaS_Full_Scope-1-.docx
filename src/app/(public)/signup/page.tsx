import { Form, Field } from "@/components/form";
import { signupAction } from "@/actions/auth";
export const metadata = { title: "Start free trial" };
export default async function Signup({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-semibold">Start your 14-day free trial</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Create your institution&apos;s workspace. You will be its administrator.</p>
      <div className="card p-6">
        <Form action={signupAction} submit="Create workspace" pendingLabel="Creating your workspace…">
          <div className="space-y-4">
            <Field name="institutionName" label="Institution name" placeholder="e.g. Sunrise College of Arts & Science" />
            <Field name="adminName" label="Your name" autoComplete="name" />
            <Field name="email" label="Work email" type="email" autoComplete="username" />
            <Field name="planCode" label="Plan" defaultValue={sp.plan ?? "starter"} options={[{ value: "starter", label: "Starter, up to 500 students" }, { value: "growth", label: "Growth, up to 3,000 students" }, { value: "enterprise", label: "Enterprise, up to 100,000 students" }]} />
            <Field name="password" label="Password" type="password" autoComplete="new-password" hint="At least 10 characters, with letters and a number." />
            <Field name="confirm" label="Confirm password" type="password" autoComplete="new-password" />
            <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" name="terms" className="mt-1" /> I agree to the terms of service and privacy policy.</label>
          </div>
        </Form>
      </div>
    </div>
  );
}
