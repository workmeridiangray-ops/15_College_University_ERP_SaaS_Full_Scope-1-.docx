"use client";
import { useActionState, useState } from "react";
import { trackAction } from "@/actions/public";
import { Badge } from "@/components/ui";
import { UploadBox } from "@/components/upload";

const MESSAGES: Record<string, string> = {
  submitted: "We have received your application and it is waiting for review.",
  under_review: "Your application is being reviewed.",
  shortlisted: "You have been shortlisted. A final decision will follow.",
  accepted: "Congratulations, you have been admitted. Check your email for your account activation link, or contact the admissions office.",
  rejected: "Unfortunately your application was not successful this time.",
};

export function TrackClient() {
  const [state, action, pending] = useActionState(trackAction, null);
  const [vals, setVals] = useState({ code: "", email: "" });
  const d = state?.ok ? (state.data as { status: string; name: string; program: string; remarks: string | null }) : null;
  return (
    <div className="space-y-5">
      <form action={action} className="card space-y-4 p-6" onChange={(e) => { const f = e.currentTarget; setVals({ code: (f.elements.namedItem("code") as HTMLInputElement).value, email: (f.elements.namedItem("email") as HTMLInputElement).value }); }}>
        {state?.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</div>}
        <div><label className="label" htmlFor="code">Tracking code</label><input id="code" name="code" required className="input uppercase" placeholder="APP-XXXXXXXX" autoComplete="off" /></div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" /></div>
        <button className="btn-primary" disabled={pending}>{pending ? "Checking…" : "Check status"}</button>
      </form>
      {d && (
        <div className="card space-y-3 p-6" aria-live="polite">
          <div className="flex items-center justify-between"><div><p className="font-semibold">{d.name}</p><p className="text-sm text-slate-500">{d.program}</p></div><Badge>{d.status}</Badge></div>
          <p className="text-sm text-slate-700">{MESSAGES[d.status]}</p>
          {d.remarks && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><span className="font-medium">Note from admissions:</span> {d.remarks}</p>}
          {d.status !== "rejected" && <div className="border-t border-slate-100 pt-4"><UploadBox label="Attach a document (marksheet, ID)" fields={{ mode: "applicant", code: vals.code, email: vals.email }} /></div>}
        </div>
      )}
    </div>
  );
}
