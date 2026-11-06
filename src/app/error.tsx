"use client";
import Link from "next/link";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center" role="alert">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-500">We could not load this page. Your data is safe. Try again, and if it continues contact support{error.digest ? <> with reference <code className="rounded bg-slate-100 px-1">{error.digest}</code></> : null}.</p>
      <div className="mt-6 flex justify-center gap-3"><button onClick={reset} className="btn-primary">Try again</button><Link href="/" className="btn-secondary">Home</Link></div>
    </div>
  );
}
