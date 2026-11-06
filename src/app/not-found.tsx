import Link from "next/link";
export default function NotFound() {
  return (<div className="mx-auto max-w-md px-4 py-24 text-center"><p className="text-sm font-semibold text-brand-600">404</p><h1 className="mt-2 text-2xl font-semibold">Page not found</h1><p className="mt-2 text-sm text-slate-500">The page may have moved, or you may not have access to it.</p><Link href="/" className="btn-primary mt-6">Go to home</Link></div>);
}
