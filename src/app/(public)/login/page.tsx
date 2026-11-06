import Link from "next/link";
import { Form, Field } from "@/components/form";
import { loginAction } from "@/actions/auth";
import { Notice } from "@/components/ui";
export const metadata = { title: "Sign in" };
export default async function Login({ searchParams }: { searchParams: Promise<{ expired?: string; out?: string; reset?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Staff, students and parents use the same page.</p>
      {sp.expired && <Notice tone="warn">Your session has ended. Please sign in again to continue.</Notice>}
      {sp.out && <Notice>You have been signed out.</Notice>}
      {sp.reset && <Notice>Password updated. Sign in with your new password.</Notice>}
      <div className="card p-6">
        <Form action={loginAction} submit="Sign in" pendingLabel="Signing in…">
          <input type="hidden" name="next" value={sp.next ?? ""} />
          <div className="space-y-4">
            <Field name="email" label="Email" type="email" autoComplete="username" />
            <Field name="password" label="Password" type="password" autoComplete="current-password" />
          </div>
        </Form>
        <p className="mt-4 text-sm"><Link href="/forgot-password" className="text-brand-600 hover:underline">Forgot your password?</Link></p>
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">New institution? <Link href="/signup" className="text-brand-600 hover:underline">Start a free trial</Link></p>
    </div>
  );
}
