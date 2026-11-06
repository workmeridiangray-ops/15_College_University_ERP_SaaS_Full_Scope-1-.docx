import { Form, Field } from "@/components/form";
import { changePasswordAction } from "@/actions/auth";
import { requireSession } from "@/lib/web";
import { Notice } from "@/components/ui";
import { homeFor } from "@/lib/permissions";
import Link from "next/link";
export const metadata = { title: "Change password" };
export default async function ChangePassword({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const u = await requireSession();
  const first = (await searchParams).first === "1";
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">{first ? "Set your own password" : "Change password"}</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Signed in as {u.email}</p>
      {first && <Notice tone="warn">Your account was created with a temporary password. Choose a new one to continue.</Notice>}
      <div className="card p-6">
        <Form action={changePasswordAction} submit="Update password" pendingLabel="Updating…" resetOnSuccess reload={false}>
          <input type="hidden" name="first" value={first ? "1" : ""} />
          <div className="space-y-4">
            <Field name="current" label={first ? "Temporary password" : "Current password"} type="password" autoComplete="current-password" />
            <Field name="password" label="New password" type="password" autoComplete="new-password" hint="At least 10 characters, with letters and a number." />
            <Field name="confirm" label="Confirm new password" type="password" autoComplete="new-password" />
          </div>
        </Form>
      </div>
      {!first && <p className="mt-4 text-sm"><Link className="text-brand-600 hover:underline" href={homeFor(u.role)}>← Back</Link></p>}
    </div>
  );
}
