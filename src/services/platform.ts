import { z } from "zod";
import { one, query, tx } from "@/lib/db";
import { AppError, conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { authorize, type SessionUser } from "@/lib/session";
import { hashPassword, validatePasswordStrength } from "@/lib/crypto";
import { parse } from "./core";

function superOnly(user: SessionUser | null): SessionUser {
  if (!user) throw new AppError("unauthenticated", "Your session has expired. Please sign in again.");
  if (user.role !== "super_admin") throw forbidden();
  return user;
}

export async function platformStats(user: SessionUser | null) {
  superOnly(user);
  const r = await one<Record<string, string>>(`SELECT
    (SELECT count(*) FROM institutions WHERE NOT is_demo) institutions,
    (SELECT count(*) FROM institutions WHERE status='active' AND NOT is_demo) active,
    (SELECT count(*) FROM institutions WHERE status='trial' AND NOT is_demo) trial,
    (SELECT count(*) FROM institutions WHERE status IN ('suspended','past_due')) attention,
    (SELECT count(*) FROM students) students, (SELECT count(*) FROM tickets WHERE status='open') open_tickets`);
  return Object.fromEntries(Object.entries(r!).map(([k, v]) => [k, Number(v)]));
}

export async function listInstitutions(user: SessionUser | null) {
  superOnly(user);
  return (await query(`SELECT i.id, i.name, i.slug, i.status, i.is_demo, i.trial_ends_at, i.created_at, p.name plan, i.contact_email,
    (SELECT count(*)::int FROM students s WHERE s.institution_id=i.id) students, (SELECT count(*)::int FROM staff s WHERE s.institution_id=i.id) staff
    FROM institutions i LEFT JOIN plans p ON p.id=i.plan_id ORDER BY i.created_at DESC`)).rows;
}

export async function setInstitutionStatus(user: SessionUser | null, id: string, status: "trial" | "active" | "past_due" | "suspended" | "cancelled", reason?: string) {
  const u = superOnly(user);
  if (!["trial", "active", "past_due", "suspended", "cancelled"].includes(status)) throw invalid("Unknown status.");
  const r = await query("UPDATE institutions SET status=$2 WHERE id=$1 RETURNING id", [id, status]);
  if (!r.rowCount) throw notFound();
  if (status === "suspended" || status === "cancelled") await query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE institution_id=$1)", [id]);
  await audit({ id: u.id, institutionId: id }, "platform.institution_status", "institution", id, { status, reason });
}

export async function extendTrial(user: SessionUser | null, id: string, days: number) {
  const u = superOnly(user);
  if (!(days >= 1 && days <= 90)) throw invalid("Extend by 1–90 days.");
  const r = await query("UPDATE institutions SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + make_interval(days => $2::int), status = CASE WHEN status='past_due' THEN 'trial' ELSE status END WHERE id=$1 RETURNING id", [id, days]);
  if (!r.rowCount) throw notFound();
  await audit({ id: u.id, institutionId: id }, "platform.trial_extended", "institution", id, { days });
}

export async function changePlan(user: SessionUser | null, id: string, planCode: string) {
  const u = superOnly(user);
  const plan = await one<{ id: string; max_students: number; max_staff: number }>("SELECT id, max_students, max_staff FROM plans WHERE code=$1", [planCode]);
  if (!plan) throw invalid("Unknown plan.");
  const usage = await one<{ s: string; t: string }>("SELECT (SELECT count(*) FROM students WHERE institution_id=$1) s, (SELECT count(*) FROM staff WHERE institution_id=$1) t", [id]);
  if (Number(usage!.s) > plan.max_students || Number(usage!.t) > plan.max_staff) throw conflict("This institution currently exceeds the limits of that plan, so it cannot be downgraded to it.");
  const r = await query("UPDATE institutions SET plan_id=$2 WHERE id=$1 RETURNING id", [id, plan.id]);
  if (!r.rowCount) throw notFound();
  await audit({ id: u.id, institutionId: id }, "platform.plan_changed", "institution", id, { planCode });
}

export async function platformAudit(user: SessionUser | null) {
  superOnly(user);
  return (await query(`SELECT a.id, a.action, a.entity, a.detail, a.created_at, i.name institution, u.name actor FROM audit_log a LEFT JOIN institutions i ON i.id=a.institution_id LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200`)).rows;
}

export async function institutionAudit(user: SessionUser) {
  const ctx = authorize(user, "audit.read");
  return (await query(`SELECT a.id, a.action, a.entity, a.detail, a.created_at, u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.institution_id=$1 ORDER BY a.id DESC LIMIT 200`, [ctx.institutionId])).rows;
}

/** Creates the first platform operator. Refuses if one already exists unless allowAdditional. */
export async function bootstrapSuperAdmin(emailIn: string, password: string, name = "Platform Admin") {
  const email = emailIn.trim().toLowerCase();
  const weak = validatePasswordStrength(password);
  if (weak) throw invalid(weak);
  if (await one("SELECT 1 FROM users WHERE role='super_admin'")) throw conflict("A super admin already exists.");
  const r = await one<{ id: string }>("INSERT INTO users (institution_id, email, name, role, password_hash) VALUES (NULL,$1,$2,'super_admin',$3) RETURNING id", [email, name, hashPassword(password)]);
  await audit({ id: r!.id }, "platform.bootstrap");
  return r!.id;
}

/* ---------- Support tickets ---------- */
export async function createTicket(user: SessionUser, input: unknown) {
  const ctx = authorize(user, "support.create", { write: false });
  const d = parse(z.object({ subject: z.string().trim().min(4).max(140), body: z.string().trim().min(5).max(4000) }), input);
  return tx(async (q) => {
    const t = (await q.query<{ id: string }>("INSERT INTO tickets (institution_id, user_id, subject) VALUES ($1,$2,$3) RETURNING id", [ctx.institutionId, user.id, d.subject])).rows[0];
    await q.query("INSERT INTO ticket_messages (ticket_id, user_id, body) VALUES ($1,$2,$3)", [t.id, user.id, d.body]);
    await audit(user, "ticket.created", "ticket", t.id, undefined, q);
    return t.id;
  });
}

export async function listTickets(user: SessionUser) {
  if (user.role === "super_admin") return (await query("SELECT t.*, i.name institution, u.name author FROM tickets t JOIN institutions i ON i.id=t.institution_id JOIN users u ON u.id=t.user_id ORDER BY (t.status='open') DESC, t.created_at DESC LIMIT 200")).rows;
  const ctx = authorize(user, "support.create");
  const all = user.role === "institution_admin";
  return (await query(`SELECT t.*, u.name author FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.institution_id=$1 ${all ? "" : "AND t.user_id=$2"} ORDER BY t.created_at DESC LIMIT 100`, all ? [ctx.institutionId] : [ctx.institutionId, user.id])).rows;
}

async function ticketAccess(user: SessionUser, id: string) {
  const t = await one<{ id: string; institution_id: string; user_id: string; status: string }>("SELECT id, institution_id, user_id, status FROM tickets WHERE id=$1", [id]);
  if (!t) throw notFound();
  if (user.role !== "super_admin") {
    if (t.institution_id !== user.institutionId) throw notFound();
    if (user.role !== "institution_admin" && t.user_id !== user.id) throw notFound();
  }
  return t;
}

export async function ticketThread(user: SessionUser, id: string) {
  const t = await ticketAccess(user, id);
  const messages = (await query("SELECT m.id, m.body, m.created_at, u.name author, (u.role='super_admin') staff FROM ticket_messages m JOIN users u ON u.id=m.user_id WHERE m.ticket_id=$1 ORDER BY m.created_at", [id])).rows;
  return { ticket: await one("SELECT t.*, i.name institution FROM tickets t JOIN institutions i ON i.id=t.institution_id WHERE t.id=$1", [t.id]), messages };
}

export async function replyTicket(user: SessionUser, id: string, body: string) {
  const t = await ticketAccess(user, id);
  const text = body.trim();
  if (text.length < 2 || text.length > 4000) throw invalid("Write a reply (up to 4,000 characters).");
  if (t.status === "closed") throw conflict("This ticket is closed. Open a new ticket to continue.");
  await tx(async (q) => {
    await q.query("INSERT INTO ticket_messages (ticket_id, user_id, body) VALUES ($1,$2,$3)", [id, user.id, text]);
    await q.query("UPDATE tickets SET status=$2 WHERE id=$1", [id, user.role === "super_admin" ? "answered" : "open"]);
    if (user.role === "super_admin") await q.query("INSERT INTO notifications (institution_id, user_id, title, body, link) VALUES ($1,$2,'Support replied',$3,'/app/support')", [t.institution_id, t.user_id, text.slice(0, 120)]);
    await audit(user, "ticket.reply", "ticket", id, undefined, q);
  });
}

export async function closeTicket(user: SessionUser, id: string) {
  await ticketAccess(user, id);
  await query("UPDATE tickets SET status='closed' WHERE id=$1", [id]);
  await audit(user, "ticket.closed", "ticket", id);
}
