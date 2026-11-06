"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function UploadBox({ fields, label = "Attach a document" }: { fields: Record<string, string>; label?: string }) {
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string }>({ kind: "idle" });
  const router = useRouter();
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) return setState({ kind: "err", msg: "Choose a file first." });
    if (file.size > 5 * 1024 * 1024) return setState({ kind: "err", msg: "Files must be 5 MB or smaller." });
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    fd.append("file", file);
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/files/upload", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setState({ kind: "err", msg: res.status === 401 ? "Your session has expired. Sign in again, then retry." : body.error ?? "Upload failed." });
      setState({ kind: "ok", msg: `${body.filename} uploaded.` });
      form.reset();
      router.refresh();
    } catch { setState({ kind: "err", msg: "Network problem. Check your connection and try again." }); }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label className="label" htmlFor="upload-file">{label} <span className="font-normal text-slate-500">(PDF, PNG or JPG, up to 5 MB)</span></label>
      <div className="flex flex-wrap gap-2">
        <input id="upload-file" name="file" type="file" accept="application/pdf,image/png,image/jpeg" className="input max-w-sm" />
        <button className="btn-secondary" disabled={state.kind === "busy"}>{state.kind === "busy" ? "Uploading…" : "Upload"}</button>
      </div>
      {state.kind === "err" && <p role="alert" className="text-sm text-red-600">{state.msg}</p>}
      {state.kind === "ok" && <p role="status" className="text-sm text-emerald-700">{state.msg}</p>}
    </form>
  );
}
