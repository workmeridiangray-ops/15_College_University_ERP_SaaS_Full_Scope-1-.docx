"use client";
import { createContext, useActionState, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { FormState } from "@/lib/web";

const FLASH_KEY = "erp_flash";
/** After a successful save, reload so every list/number on the page is fresh, and carry the success message across the reload. */
function flashAndReload(s: NonNullable<FormState>) {
  try {
    const link = typeof s.data?.link === "string" ? s.data.link : undefined;
    if (s.message || link) sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message: s.message, link, at: Date.now() }));
  } catch { /* storage unavailable: the page still reloads with fresh data */ }
  window.location.reload();
}

/** Shows the message left by the save that triggered the last reload. */
export function FlashBanner() {
  const [flash, setFlash] = useState<{ message?: string; link?: string } | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FLASH_KEY);
      if (!raw) return;
      sessionStorage.removeItem(FLASH_KEY);
      const f = JSON.parse(raw) as { message?: string; link?: string; at: number };
      if (Date.now() - f.at < 30000) setFlash(f);
    } catch { /* ignore */ }
  }, []);
  if (!flash) return null;
  return (
    <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <div className="min-w-0 flex-1">{flash.message}{flash.link && <LinkBox link={flash.link} />}</div>
      <button type="button" aria-label="Dismiss message" className="text-emerald-700 hover:text-emerald-900" onClick={() => setFlash(null)}>✕</button>
    </div>
  );
}

const Ctx = createContext<{ fields: Record<string, string>; pending: boolean }>({ fields: {}, pending: false });

/** Form with pending state, field + banner errors, success message, expired-session recovery and unsaved-work protection. */
export function Form({ action, children, submit = "Save", pendingLabel = "Saving…", resetOnSuccess = false, reload = true, className = "", confirm, secondary, idem }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>; children: ReactNode; submit?: string; pendingLabel?: string;
  resetOnSuccess?: boolean; /** Reload the page after a save so lists are fresh and show the message in the shell banner. Turn off for pages without the app shell. */ reload?: boolean; className?: string; confirm?: string; secondary?: ReactNode; idem?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [dirty, setDirty] = useState(false);
  const [key, setKey] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())));
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useEffect(() => {
    if (state?.ok) {
      setDirty(false);
      if (resetOnSuccess) { ref.current?.reset(); setKey(crypto.randomUUID()); }
      if (reload) flashAndReload(state);
    }
  }, [state, resetOnSuccess, reload]);

  return (
    <Ctx.Provider value={{ fields: state?.fields ?? {}, pending }}>
      <form ref={ref} action={formAction} onChange={() => setDirty(true)} className={className}
        onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} aria-busy={pending}>
        {idem && <input type="hidden" name="idempotencyKey" value={key} />}
        {state?.error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {state.error}
            {state.expired && <> <a className="font-semibold underline" href="/login?expired=1">Sign in again</a>. Your changes on this page are still here; copy anything important first.</>}
          </div>
        )}
        {state?.ok && state.message && (
          <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {state.message}
            {typeof state.data?.link === "string" && <LinkBox link={state.data.link} />}
          </div>
        )}
        {children}
        <div className="mt-5 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {pending ? pendingLabel : submit}
          </button>
          {secondary}
        </div>
      </form>
    </Ctx.Provider>
  );
}

export function Field({ name, label, type = "text", required = true, placeholder, defaultValue, hint, options, rows, min, max, step, autoComplete }: {
  name: string; label: string; type?: string; required?: boolean; placeholder?: string; defaultValue?: string | number; hint?: string;
  options?: { value: string; label: string }[]; rows?: number; min?: string | number; max?: string | number; step?: string | number; autoComplete?: string;
}) {
  const { fields } = useContext(Ctx);
  const uid = useId();
  const id = `${uid}-${name}`; // unique per field instance, so several forms on one page never share ids
  const err = fields[name];
  const common = { id, name, required, "aria-invalid": !!err, "aria-describedby": err ? id + "-err" : hint ? id + "-hint" : undefined, className: "input" + (err ? " !border-red-500" : ""), defaultValue, autoComplete };
  return (
    <div>
      <label htmlFor={id} className="label">{label}{required && <span className="text-red-500"> *</span>}</label>
      {options ? (
        <select {...common}>{!required && <option value="">— none —</option>}{required && defaultValue === undefined && <option value="" disabled>Select…</option>}{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      ) : rows ? (
        <textarea {...common} rows={rows} placeholder={placeholder} />
      ) : (
        <input {...common} type={type} placeholder={placeholder} min={min} max={max} step={step} />
      )}
      {hint && !err && <p id={id + "-hint"} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {err && <p id={id + "-err"} className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

/** One-click action button (approve, return, delete…) with confirmation, pending state and inline result. */
export function ActionButton({ action, label, pendingLabel = "Working…", confirm, variant = "secondary", small = true, fields }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>; label: string; pendingLabel?: string; confirm?: string;
  variant?: "primary" | "secondary" | "danger"; small?: boolean; fields?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  useEffect(() => { if (state?.ok) flashAndReload(state); }, [state]);
  return (
    <form action={formAction} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} className="inline-flex flex-col items-start gap-1">
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className={`btn-${variant} ${small ? "btn-sm" : ""}`} disabled={pending}>{pending ? pendingLabel : label}</button>
      {state?.error && <span role="alert" className="max-w-xs text-xs text-red-600">{state.error}</span>}
      {state?.ok && state.message && <span role="status" className="max-w-xs text-xs text-emerald-700">{state.message}</span>}
      {typeof state?.data?.link === "string" && <LinkBox link={state.data.link} />}
    </form>
  );
}

function LinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex gap-2">
      <input readOnly value={link} aria-label="One-time link" onFocus={(e) => e.currentTarget.select()} className="input !py-1 font-mono text-xs" />
      <button type="button" className="btn-secondary btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* user can copy manually */ } }}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

/** Expandable panel whose open state lives in React, so it stays open (and success messages stay visible) when the page re-renders after a save. */
export function Disclosure({ label, children, tone = "brand" }: { label: string; children: ReactNode; tone?: "brand" | "slate" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className={`cursor-pointer text-xs font-medium ${tone === "brand" ? "text-brand-600" : "text-slate-600"}`}>{label}</button>
      <div id={id} hidden={!open}>{children}</div>
    </div>
  );
}
