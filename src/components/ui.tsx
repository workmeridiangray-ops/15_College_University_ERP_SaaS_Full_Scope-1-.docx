import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200", active: "bg-emerald-50 text-emerald-700 ring-emerald-200", accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200", approved: "bg-emerald-50 text-emerald-700 ring-emerald-200", present: "bg-emerald-50 text-emerald-700 ring-emerald-200", answered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  partial: "bg-amber-50 text-amber-700 ring-amber-200", pending: "bg-amber-50 text-amber-700 ring-amber-200", trial: "bg-amber-50 text-amber-700 ring-amber-200", under_review: "bg-amber-50 text-amber-700 ring-amber-200", late: "bg-amber-50 text-amber-700 ring-amber-200", past_due: "bg-amber-50 text-amber-700 ring-amber-200",
  unpaid: "bg-red-50 text-red-700 ring-red-200", rejected: "bg-red-50 text-red-700 ring-red-200", suspended: "bg-red-50 text-red-700 ring-red-200", absent: "bg-red-50 text-red-700 ring-red-200", cancelled: "bg-slate-100 text-slate-600 ring-slate-200", withdrawn: "bg-slate-100 text-slate-600 ring-slate-200", closed: "bg-slate-100 text-slate-600 ring-slate-200",
  shortlisted: "bg-sky-50 text-sky-700 ring-sky-200", submitted: "bg-sky-50 text-sky-700 ring-sky-200", open: "bg-sky-50 text-sky-700 ring-sky-200", graduated: "bg-sky-50 text-sky-700 ring-sky-200",
};
export function Badge({ children, tone }: { children: string; tone?: string }) {
  const k = tone ?? children;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${TONES[k] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>{children.replace(/_/g, " ")}</span>;
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export type Col<T> = { header: string; cell: (row: T) => ReactNode; className?: string };
export function Table<T>({ cols, rows, empty }: { cols: Col<T>[]; rows: T[]; empty: ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50"><tr>{cols.map((c) => <th key={c.header} scope="col" className="th">{c.header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((r, i) => <tr key={i} className="hover:bg-slate-50/60">{cols.map((c) => <td key={c.header} className={`td ${c.className ?? ""}`}>{c.cell(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "warn" | "good" }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="mb-8"><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-slate-900">{title}</h2>{aside}</div>{children}</section>;
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      {page > 1 ? <Link className="btn-secondary btn-sm" href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="text-slate-500">Page {page} of {pages}</span>
      {page < pages ? <Link className="btn-secondary btn-sm" href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  const c = tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : tone === "danger" ? "border-red-200 bg-red-50 text-red-900" : "border-sky-200 bg-sky-50 text-sky-900";
  return <div role="status" className={`mb-5 rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return <div className="card p-5">{title && <h3 className="mb-4 text-sm font-semibold text-slate-900">{title}</h3>}{children}</div>;
}
