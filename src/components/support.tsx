import Link from "next/link";
import { notFound } from "next/navigation";
import type { SessionUser } from "@/lib/session";
import { listTickets, ticketThread } from "@/services/platform";
import { AppError } from "@/lib/errors";
import { PageHeader, Table, Badge, Empty, Panel } from "./ui";
import { Form, Field, ActionButton } from "./form";
import { newTicket, reply, closeTicket } from "@/actions/admin";
import { fmtDateTime } from "@/lib/web";

export async function SupportList({ user, base }: { user: SessionUser; base: string }) {
  const rows = (await listTickets(user)) as any[];
  const isSuper = user.role === "super_admin";
  return (
    <>
      <PageHeader title={isSuper ? "Support inbox" : "Support"} subtitle={isSuper ? "Tickets from every institution." : "Ask for help, report a problem, or request a plan change."} />
      <Table rows={rows} empty={<Empty title="No tickets" hint={isSuper ? "Nothing waiting." : "Create a ticket below and we will reply here."} />} cols={[{ header: "Subject", cell: (r) => <Link className="font-medium text-brand-600 hover:underline" href={`${base}/${r.id}`}>{r.subject}</Link> }, ...(isSuper ? [{ header: "Institution", cell: (r: any) => r.institution }] : []), { header: "From", cell: (r) => r.author }, { header: "Opened", cell: (r) => fmtDateTime(r.created_at) }, { header: "Status", cell: (r) => <Badge>{r.status}</Badge> }]} />
      {!isSuper && <div className="mt-8"><Panel title="New ticket"><Form action={newTicket} submit="Send" resetOnSuccess><div className="space-y-4"><Field name="subject" label="Subject" /><Field name="body" label="Describe the problem or request" rows={4} /></div></Form></Panel></div>}
    </>
  );
}

export async function TicketView({ user, id, base }: { user: SessionUser; id: string; base: string }) {
  let t;
  try { t = await ticketThread(user, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const tk = t.ticket as any;
  return (
    <>
      <PageHeader title={tk.subject} subtitle={`${tk.institution} · ${tk.status}`} actions={<Link href={base} className="btn-secondary">← All tickets</Link>} />
      <ul className="mb-6 space-y-3">{(t.messages as any[]).map((m) => <li key={m.id} className={`card p-4 ${m.staff ? "border-brand-200 bg-brand-50/40" : ""}`}><div className="flex justify-between text-xs text-slate-500"><span className="font-medium text-slate-700">{m.author}{m.staff ? " · Support" : ""}</span><span>{fmtDateTime(m.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p></li>)}</ul>
      {tk.status === "closed" ? <p className="text-sm text-slate-500">This ticket is closed.</p> : (
        <div className="space-y-3"><Panel title="Reply"><Form action={reply} submit="Send reply" resetOnSuccess><input type="hidden" name="id" value={id} /><Field name="body" label="Message" rows={4} /></Form></Panel><ActionButton action={closeTicket} label="Close ticket" confirm="Close this ticket?" fields={{ id }} /></div>
      )}
    </>
  );
}
