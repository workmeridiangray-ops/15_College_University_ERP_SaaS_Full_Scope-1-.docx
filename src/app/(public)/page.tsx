import Link from "next/link";
const FEATURES = [
  ["Admissions", "Online applications, document upload, shortlisting and one-click enrolment with seat control."],
  ["Student records", "Profiles, guardians, sections and a parent portal that shows only their own children."],
  ["Fees & payments", "Fee structures, invoices, concessions, receipts, dues reports and online payment."],
  ["Attendance & timetable", "Clash-free timetables, quick attendance marking and automatic low-attendance alerts."],
  ["Exams & results", "Weighted marks, grades, GPA, publish-when-ready results and transcripts."],
  ["Library, HR & payroll", "Issue and return with fines, leave approvals and monthly payslips."],
];
export default function Home() {
  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Run your whole college from one calm workspace</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">From the first application to the final transcript: admissions, fees, attendance, exams, library and HR, with separate secure portals for staff, students and parents.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/signup" className="btn-primary px-6 py-3 text-base">Start 14-day free trial</Link><Link href="/pricing" className="btn-secondary px-6 py-3 text-base">See pricing</Link></div>
          <p className="mt-3 text-xs text-slate-500">No card needed. Each institution&apos;s data is kept strictly separate.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold">Everything a campus needs</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, d]) => <div key={t} className="card p-5"><h3 className="font-semibold text-slate-900">{t}</h3><p className="mt-2 text-sm text-slate-600">{d}</p></div>)}
        </div>
      </section>
    </>
  );
}
