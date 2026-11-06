import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/actions/auth";
import { institutionAccess, type SessionUser } from "@/lib/session";
import { can, type Permission } from "@/lib/permissions";
import { unreadCount } from "@/services/academics";

type Item = { href: string; label: string; perm?: Permission };
const STAFF_NAV: Item[] = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/students", label: "Students", perm: "students.read" },
  { href: "/app/admissions", label: "Admissions", perm: "admissions.manage" },
  { href: "/app/academics", label: "Academics", perm: "students.read" },
  { href: "/app/timetable", label: "Timetable", perm: "attendance.read" },
  { href: "/app/attendance", label: "Attendance", perm: "attendance.mark" },
  { href: "/app/assignments", label: "Assignments", perm: "assignments.manage" },
  { href: "/app/exams", label: "Exams & marks", perm: "marks.enter" },
  { href: "/app/fees", label: "Fees", perm: "fees.read" },
  { href: "/app/library", label: "Library", perm: "library.manage" },
  { href: "/app/hr", label: "HR & payroll", perm: "hr.manage" },
  { href: "/app/leave", label: "My leave & payslips", perm: "leave.request" },
  { href: "/app/announcements", label: "Announcements", perm: "leave.request" },
  { href: "/app/users", label: "Staff accounts", perm: "users.manage" },
  { href: "/app/reports", label: "Reports", perm: "reports.read" },
  { href: "/app/audit", label: "Audit log", perm: "audit.read" },
  { href: "/app/settings", label: "Settings", perm: "org.manage" },
  { href: "/app/support", label: "Support", perm: "support.create" },
];
const PORTAL_NAV: Item[] = [
  { href: "/portal", label: "Overview" }, { href: "/portal/timetable", label: "Timetable" }, { href: "/portal/attendance", label: "Attendance" },
  { href: "/portal/results", label: "Results" }, { href: "/portal/fees", label: "Fees" }, { href: "/portal/assignments", label: "Assignments" },
  { href: "/portal/library", label: "Library" }, { href: "/portal/announcements", label: "Announcements" }, { href: "/portal/support", label: "Support" },
];
const SUPER_NAV: Item[] = [
  { href: "/super", label: "Overview" }, { href: "/super/institutions", label: "Institutions" }, { href: "/super/support", label: "Support inbox" }, { href: "/super/audit", label: "Platform audit" },
];

export async function Shell({ user, children, area }: { user: SessionUser; children: ReactNode; area: "app" | "portal" | "super" }) {
  const nav = (area === "super" ? SUPER_NAV : area === "portal" ? PORTAL_NAV : STAFF_NAV).filter((i) => !i.perm || can(user.role, i.perm));
  const unread = area === "super" ? 0 : await unreadCount(user);
  const access = institutionAccess(user);
  const trialLeft = user.institution?.status === "trial" && user.institution.trialEndsAt ? Math.ceil((+new Date(user.institution.trialEndsAt) - Date.now()) / 86400000) : null;
  const notifHref = area === "portal" ? "/portal/notifications" : "/app/notifications";
  const Nav = (
    <nav aria-label="Main" className="flex flex-col gap-0.5 p-3">
      {nav.map((i) => <Link key={i.href} href={i.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">{i.label}</Link>)}
    </nav>
  );
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="border-b border-slate-200 px-5 py-4"><Link href="/" className="text-lg font-semibold text-brand-600">Campus ERP</Link><p className="mt-0.5 truncate text-xs text-slate-500">{user.institution?.name ?? "Platform"}</p></div>
        {Nav}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-8">
          <details className="relative md:hidden">
            <summary className="btn-secondary btn-sm cursor-pointer list-none" aria-label="Open menu">☰ Menu</summary>
            <div className="absolute left-0 top-10 z-30 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">{Nav}</div>
          </details>
          <div className="hidden text-sm text-slate-500 md:block">{user.institution?.name ?? "Platform administration"}{user.institution?.isDemo && <span className="ml-2 rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">DEMO DATA</span>}</div>
          <div className="flex items-center gap-3">
            {area !== "super" && <Link href={notifHref} className="relative btn-secondary btn-sm" aria-label={`Notifications, ${unread} unread`}>🔔{unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">{unread}</span>}</Link>}
            <div className="text-right leading-tight"><p className="text-sm font-medium text-slate-800">{user.name}</p><p className="text-xs capitalize text-slate-500">{user.role.replace(/_/g, " ")}</p></div>
            <Link href="/account/password" className="btn-secondary btn-sm">Account</Link>
            <form action={logoutAction}><button className="btn-secondary btn-sm">Sign out</button></form>
          </div>
        </header>
        {access === "read_only" && <div role="alert" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 md:px-8">Your subscription has lapsed, so the system is <strong>read-only</strong>. Contact support to renew and restore editing.</div>}
        {access === "blocked" && <div role="alert" className="bg-red-100 px-4 py-2 text-center text-sm text-red-900 md:px-8">This institution is <strong>suspended</strong>. Contact platform support to restore access.</div>}
        {trialLeft !== null && trialLeft >= 0 && access === "ok" && <div className="bg-brand-50 px-4 py-2 text-center text-sm text-brand-700 md:px-8">Free trial: {trialLeft} day{trialLeft === 1 ? "" : "s"} left.</div>}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
