import Link from "next/link";
import { Form, Field } from "@/components/form";
import { resetAction } from "@/actions/auth";
import { Notice } from "@/components/ui";
export const metadata = { title: "Choose a password" };
export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <div className="mx-auto max-w-md px-4 py-16"><Notice tone="danger">This link is incomplete. Open the full link from your email, or <Link className="underline" href="/forgot-password">request a new one</Link>.</Notice></div>;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">This also activates new accounts. The link works once.</p>
      <div className="card p-6">
        <Form action={resetAction} submit="Set password" pendingLabel="Saving…">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-4">
            <Field name="password" label="New password" type="password" autoComplete="new-password" hint="At least 10 characters, with letters and a number." />
            <Field name="confirm" label="Confirm password" type="password" autoComplete="new-password" />
          </div>
        </Form>
      </div>
    </div>
  );
}
