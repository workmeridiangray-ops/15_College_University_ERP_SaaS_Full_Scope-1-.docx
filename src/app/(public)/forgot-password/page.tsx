import { Form, Field } from "@/components/form";
import { forgotAction } from "@/actions/auth";
export const metadata = { title: "Reset password" };
export default function Forgot() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Enter your account email and we will send a link.</p>
      <div className="card p-6"><Form action={forgotAction} submit="Send reset link" pendingLabel="Sending…" reload={false}><Field name="email" label="Email" type="email" /></Form></div>
    </div>
  );
}
