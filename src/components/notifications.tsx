import Link from "next/link";
import { listNotifications } from "@/services/academics";
import type { SessionUser } from "@/lib/session";
import { Empty, PageHeader } from "./ui";
import { ActionButton } from "./form";
import { readAll } from "@/actions/admin";
import { fmtDateTime } from "@/lib/web";

export async function NotificationList({ user }: { user: SessionUser }) {
  const rows = (await listNotifications(user)) as any[];
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <>
      <PageHeader title="Notifications" actions={unread ? <ActionButton action={readAll} label="Mark all as read" /> : undefined} />
      {rows.length === 0 ? <Empty title="You're all caught up" hint="New announcements, results and alerts will appear here." /> : (
        <ul className="space-y-2">{rows.map((n) => <li key={n.id} className={`card p-4 ${n.read_at ? "" : "border-brand-200 bg-brand-50/40"}`}><div className="flex justify-between gap-3"><p className="text-sm font-medium">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</p><span className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(n.created_at)}</span></div>{n.body && <p className="mt-1 text-sm text-slate-600">{n.body}</p>}</li>)}</ul>
      )}
    </>
  );
}
