import { z } from "zod";
import { one, query, tx } from "@/lib/db";
import { conflict, invalid, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { authorize, type SessionUser } from "@/lib/session";
import { assertOwned, parse } from "./core";
import { nextNumber } from "./fees";
import { assertPortalAccess } from "./students";

export const FINE_PAISE_PER_DAY = 200; // ₹2 per overdue day
export const MAX_ACTIVE_ISSUES = 3;

export async function addBook(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "library.manage", { write: true });
  const d = parse(z.object({ title: z.string().trim().min(1).max(200), author: z.string().trim().min(1).max(120), isbn: z.string().trim().max(20).optional(), copies: z.coerce.number().int().min(1).max(1000) }), input);
  const r = await one<{ id: string }>("INSERT INTO books (institution_id, title, author, isbn, copies_total, copies_available) VALUES ($1,$2,$3,$4,$5,$5) RETURNING id", [ctx.institutionId, d.title, d.author, d.isbn || null, d.copies]);
  await audit(user, "book.added", "book", r!.id);
  return r!.id;
}

export async function listBooks(user: SessionUser, search?: string) {
  const ctx = authorize(user, "library.manage");
  const p: unknown[] = [ctx.institutionId]; let w = "institution_id=$1";
  if (search) { p.push(`%${search.replace(/[%_]/g, "")}%`); w += " AND (title ILIKE $2 OR author ILIKE $2 OR isbn ILIKE $2)"; }
  return (await query(`SELECT * FROM books WHERE ${w} ORDER BY title LIMIT 200`, p)).rows;
}

export async function issueBook(user: SessionUser, bookId: string, studentId: string, days = 14) {
  const ctx = authorize(user, "library.manage", { write: true });
  if (!(days >= 1 && days <= 60)) throw invalid("Loan period must be between 1 and 60 days.");
  await assertOwned("books", bookId, ctx.institutionId);
  await assertOwned("students", studentId, ctx.institutionId);
  return tx(async (q) => {
    const b = (await q.query<{ copies_available: number; title: string }>("SELECT copies_available, title FROM books WHERE id=$1 FOR UPDATE", [bookId])).rows[0];
    if (b.copies_available < 1) throw conflict("No copies of this book are available right now.");
    const st = (await q.query<{ status: string }>("SELECT status FROM students WHERE id=$1", [studentId])).rows[0];
    if (st.status !== "active") throw conflict("Only active students can borrow books.");
    const active = Number((await q.query<{ n: string }>("SELECT count(*) n FROM book_issues WHERE student_id=$1 AND returned_on IS NULL", [studentId])).rows[0].n);
    if (active >= MAX_ACTIVE_ISSUES) throw conflict(`This student already has ${MAX_ACTIVE_ISSUES} books out. A book must be returned first.`);
    if ((await q.query("SELECT 1 FROM book_issues WHERE student_id=$1 AND book_id=$2 AND returned_on IS NULL", [studentId, bookId])).rowCount) throw conflict("This student already has this book.");
    const r = (await q.query<{ id: string }>("INSERT INTO book_issues (institution_id, book_id, student_id, due_on) VALUES ($1,$2,$3, current_date + $4::int) RETURNING id", [ctx.institutionId, bookId, studentId, days])).rows[0];
    await q.query("UPDATE books SET copies_available = copies_available - 1 WHERE id=$1", [bookId]);
    await audit(user, "book.issued", "book_issue", r.id, { bookId, studentId }, q);
    return r.id;
  });
}

/** Returning a late book calculates the fine and raises an invoice so it flows through normal fee collection. */
export async function returnBook(user: SessionUser, issueId: string) {
  const ctx = authorize(user, "library.manage", { write: true });
  if (!/^[0-9a-f-]{36}$/i.test(issueId)) throw notFound();
  return tx(async (q) => {
    const i = (await q.query<{ book_id: string; student_id: string; due_on: string; returned_on: string | null; days_late: number }>(
      "SELECT book_id, student_id, due_on, returned_on, GREATEST(0, current_date - due_on) days_late FROM book_issues WHERE id=$1 AND institution_id=$2 FOR UPDATE", [issueId, ctx.institutionId])).rows[0];
    if (!i) throw notFound();
    if (i.returned_on) throw conflict("This book has already been returned.");
    const fine = i.days_late * FINE_PAISE_PER_DAY;
    await q.query("UPDATE book_issues SET returned_on=current_date, fine_paise=$2 WHERE id=$1", [issueId, fine]);
    await q.query("UPDATE books SET copies_available = copies_available + 1 WHERE id=$1", [i.book_id]);
    let invoiceNo: string | null = null;
    if (fine > 0) {
      invoiceNo = await nextNumber(q, ctx.institutionId, "INV");
      await q.query("INSERT INTO invoices (institution_id, student_id, number, description, amount_paise, due_on) VALUES ($1,$2,$3,$4,$5,current_date)",
        [ctx.institutionId, i.student_id, invoiceNo, `Library fine (${i.days_late} day${i.days_late === 1 ? "" : "s"} overdue)`, fine]);
    }
    await audit(user, "book.returned", "book_issue", issueId, { fine }, q);
    return { finePaise: fine, invoiceNo };
  });
}

export async function openIssues(user: SessionUser, overdueOnly = false) {
  const ctx = authorize(user, "library.manage");
  return (await query(`SELECT i.id, i.issued_on, i.due_on, (i.due_on < current_date) overdue, GREATEST(0, current_date - i.due_on) days_late, b.title, s.name student, s.enrolment_no
    FROM book_issues i JOIN books b ON b.id=i.book_id JOIN students s ON s.id=i.student_id
    WHERE i.institution_id=$1 AND i.returned_on IS NULL ${overdueOnly ? "AND i.due_on < current_date" : ""} ORDER BY i.due_on`, [ctx.institutionId])).rows;
}

export async function studentBooks(user: SessionUser, studentId: string) {
  await assertPortalAccess(user, studentId);
  return (await query(`SELECT i.id, b.title, b.author, i.issued_on, i.due_on, i.returned_on, i.fine_paise FROM book_issues i JOIN books b ON b.id=i.book_id
    WHERE i.student_id=$1 AND i.institution_id=$2 ORDER BY i.issued_on DESC`, [studentId, user.institutionId])).rows;
}
