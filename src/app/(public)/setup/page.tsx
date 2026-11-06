import Link from "next/link";
import { Form, Field } from "@/components/form";
import { setupAction } from "@/actions/auth";
import { setupState } from "@/services/platform";

export const metadata = { title: "First-time setup" };
export const dynamic = "force-dynamic";

export default async function Setup() {
  const state = await setupState();
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">First-time setup</h1>
      {state === "open" && (
        <>
          <p className="mb-6 mt-1 text-sm text-slate-500">Create the platform administrator. You need the <code>SETUP_TOKEN</code> secret you configured for this deployment. This page closes itself once the administrator exists.</p>
          <div className="card p-6">
            <Form action={setupAction} submit="Create administrator" pendingLabel="Creating…" reload={false}>
              <Field name="token" label="Setup token" type="password" autoComplete="off" />
              <Field name="name" label="Your name" autoComplete="name" />
              <Field name="email" label="Email" type="email" autoComplete="email" />
              <Field name="password" label="Password" type="password" autoComplete="new-password" hint="At least 10 characters, with letters and numbers." />
              <Field name="confirm" label="Confirm password" type="password" autoComplete="new-password" />
            </Form>
            <p className="mt-4 text-sm"><Link className="text-brand-600 hover:underline" href="/login">Go to sign in</Link></p>
          </div>
        </>
      )}
      {state === "done" && (
        <div className="card mt-6 p-6 text-sm">Setup is already complete. <Link className="font-medium text-brand-600 hover:underline" href="/login">Sign in</Link>.</div>
      )}
      {state === "disabled" && (
        <div className="card mt-6 p-6 text-sm text-slate-600">Setup is not enabled on this deployment. To enable it, set a <code>SETUP_TOKEN</code> secret of at least 16 characters, then reload this page.</div>
      )}
    </div>
  );
}
