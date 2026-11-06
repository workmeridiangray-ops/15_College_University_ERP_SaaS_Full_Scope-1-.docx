import { requirePerm, fmtDate } from "@/lib/web";
import { listBooks, openIssues, FINE_PAISE_PER_DAY, MAX_ACTIVE_ISSUES } from "@/services/library";
import { listStudents } from "@/services/students";
import { PageHeader, Table, Badge, Empty, Panel, Section, Notice } from "@/components/ui";
import { Form, Field, ActionButton } from "@/components/form";
import { addBook, issue, giveBack } from "@/actions/admin";
export const metadata = { title: "Library" };
export const dynamic = "force-dynamic";
export default async function Library({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requirePerm("library.manage");
  const q = (await searchParams).q;
  const [books, issues, studs] = await Promise.all([listBooks(u, q), openIssues(u), listStudents(u, { status: "active" })]);
  const avail = (books as any[]).filter((b) => b.copies_available > 0);
  return (
    <>
      <PageHeader title="Library" subtitle="Catalogue, issue and return." />
      <Notice>Loans default to 14 days. A student may hold {MAX_ACTIVE_ISSUES} books. Late returns are fined ₹{FINE_PAISE_PER_DAY / 100}/day and appear as an invoice on the student&apos;s fees.</Notice>
      <Section title="Books out"><Table rows={issues as any[]} empty={<Empty title="No books are out" />} cols={[{ header: "Book", cell: (r) => r.title }, { header: "Student", cell: (r) => `${r.student} (${r.enrolment_no})` }, { header: "Issued", cell: (r) => fmtDate(r.issued_on) }, { header: "Due", cell: (r) => <span className={r.overdue ? "font-semibold text-red-600" : ""}>{fmtDate(r.due_on)}{r.overdue ? ` · ${r.days_late}d late` : ""}</span> }, { header: "", cell: (r) => <ActionButton action={giveBack} label="Return" confirm={r.overdue ? `This book is ${r.days_late} day(s) late and a fine invoice will be raised. Continue?` : undefined} fields={{ id: r.id }} /> }]} /></Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Issue a book">{avail.length === 0 || studs.rows.length === 0 ? <p className="text-sm text-slate-600">{avail.length === 0 ? "No copies are available to issue." : "No active students yet."}</p> : (
          <Form action={issue} submit="Issue" resetOnSuccess><div className="space-y-4"><Field name="bookId" label="Book" options={avail.map((b) => ({ value: b.id, label: `${b.title} (${b.copies_available} left)` }))} /><Field name="studentId" label="Student" options={(studs.rows as any[]).map((s) => ({ value: s.id, label: `${s.name} (${s.enrolment_no})` }))} /><Field name="days" label="Loan period (days)" type="number" defaultValue={14} min={1} max={60} /></div></Form>)}</Panel>
        <Panel title="Add a book"><Form action={addBook} submit="Add book" resetOnSuccess><div className="space-y-4"><Field name="title" label="Title" /><Field name="author" label="Author" /><Field name="isbn" label="ISBN" required={false} /><Field name="copies" label="Copies" type="number" defaultValue={1} min={1} /></div></Form></Panel>
      </div>
      <Section title="Catalogue" aside={<form><input name="q" defaultValue={q} placeholder="Search title, author, ISBN" className="input w-64" aria-label="Search books" /></form>}><Table rows={books as any[]} empty={<Empty title={q ? "No books match that search" : "No books yet"} />} cols={[{ header: "Title", cell: (r) => r.title }, { header: "Author", cell: (r) => r.author }, { header: "ISBN", cell: (r) => r.isbn ?? "—" }, { header: "Available", cell: (r) => <Badge tone={r.copies_available ? "active" : "unpaid"}>{`${r.copies_available}/${r.copies_total}`}</Badge> }]} /></Section>
    </>
  );
}
