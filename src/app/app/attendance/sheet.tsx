"use client";
import { useState } from "react";
import { Form } from "@/components/form";
import { saveAttendance } from "@/actions/admin";

type Row = { id: string; name: string; enrolment: string; status: string | null };
const STATUSES = [["present", "Present"], ["absent", "Absent"], ["late", "Late"], ["excused", "Excused"]] as const;

export function AttendanceSheet({ courseId, sectionId, date, roster }: { courseId: string; sectionId: string; date: string; roster: Row[] }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(roster.map((r) => [r.id, r.status ?? "present"])));
  const setAll = (s: string) => setVals(Object.fromEntries(roster.map((r) => [r.id, s])));
  const absent = Object.values(vals).filter((v) => v === "absent").length;
  return (
    <Form action={saveAttendance} submit={`Save attendance (${roster.length - absent} present, ${absent} absent)`} pendingLabel="Saving…" className="card p-5">
      <input type="hidden" name="courseId" value={courseId} /><input type="hidden" name="sectionId" value={sectionId} /><input type="hidden" name="date" value={date} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="text-slate-500">Mark all:</span>{STATUSES.map(([v, l]) => <button type="button" key={v} onClick={() => setAll(v)} className="btn-secondary btn-sm">{l}</button>)}{roster.some((r) => r.status) && <span className="ml-auto text-xs text-amber-700">Attendance was already saved for this date. Saving updates it.</span>}</div>
      <ul className="divide-y divide-slate-100">
        {roster.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div><p className="text-sm font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.enrolment}</p></div>
            <fieldset className="flex gap-1" aria-label={`Attendance for ${r.name}`}>
              {STATUSES.map(([v, l]) => (
                <label key={v} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${vals[r.id] === v ? (v === "absent" ? "border-red-500 bg-red-50 text-red-700" : "border-brand-500 bg-brand-50 text-brand-700") : "border-slate-200 text-slate-600"}`}>
                  <input type="radio" className="sr-only" name={`s_${r.id}`} value={v} checked={vals[r.id] === v} onChange={() => setVals({ ...vals, [r.id]: v })} />{l}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ul>
    </Form>
  );
}
