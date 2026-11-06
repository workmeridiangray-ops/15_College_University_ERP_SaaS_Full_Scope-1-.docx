import Link from "next/link";
import type { ReactNode } from "react";
import { currentUser } from "@/lib/web";
import { homeFor } from "@/lib/permissions";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const u = await currentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-semibold text-brand-600">Campus ERP</Link>
          <nav className="flex items-center gap-2 text-sm" aria-label="Public">
            <Link href="/pricing" className="px-3 py-2 text-slate-600 hover:text-slate-900">Pricing</Link>
            <Link href="/track" className="hidden px-3 py-2 text-slate-600 hover:text-slate-900 sm:block">Track application</Link>
            {u ? <Link href={homeFor(u.role)} className="btn-primary">Open my workspace</Link> : (<><Link href="/login" className="btn-secondary">Sign in</Link><Link href="/signup" className="btn-primary">Start free trial</Link></>)}
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">© {new Date().getFullYear()} Campus ERP · <Link href="/pricing" className="underline">Pricing</Link> · <Link href="/login" className="underline">Sign in</Link></footer>
    </div>
  );
}
