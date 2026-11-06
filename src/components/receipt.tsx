import { inr, fmtDateTime } from "@/lib/web";
export function ReceiptView({ r }: { r: any }) {
  return (
    <div className="card mx-auto max-w-xl p-8 print:border-0 print:shadow-none">
      <div className="border-b border-slate-200 pb-4 text-center"><h1 className="text-xl font-semibold">{r.institution}</h1><p className="text-sm text-slate-500">Fee receipt</p></div>
      <dl className="mt-5 grid grid-cols-2 gap-y-3 text-sm">
        <dt className="text-slate-500">Receipt no.</dt><dd className="font-medium">{r.receipt_no}</dd>
        <dt className="text-slate-500">Date</dt><dd>{fmtDateTime(r.created_at)}</dd>
        <dt className="text-slate-500">Student</dt><dd>{r.student} ({r.enrolment_no})</dd>
        <dt className="text-slate-500">Invoice</dt><dd>{r.invoice_no} · {r.description}</dd>
        <dt className="text-slate-500">Method</dt><dd className="capitalize">{r.method}{r.reference ? ` · ${r.reference}` : ""}</dd>
        <dt className="text-slate-500">Amount paid</dt><dd className="text-lg font-semibold">{inr(r.amount_paise)}</dd>
      </dl>
      <p className="mt-6 text-center text-xs text-slate-400">This is a computer-generated receipt.</p>
    </div>
  );
}
