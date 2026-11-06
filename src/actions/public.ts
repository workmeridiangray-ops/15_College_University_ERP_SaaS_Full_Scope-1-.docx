"use server";
import { guard, str, type FormState } from "@/lib/web";
import { submitApplication, trackApplication } from "@/services/students";

export async function applyAction(_: FormState, fd: FormData): Promise<FormState> {
  return guard(async () => {
    const r = await submitApplication(Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$ACTION")).map(([k, v]) => [k, String(v)])));
    return { message: `Application received. Your tracking code is ${r.trackingCode}. Keep it safe: you need it, with your email, to check status and attach documents.`, data: { code: r.trackingCode } };
  });
}

export async function trackAction(_: FormState, fd: FormData): Promise<FormState> {
  return guard(async () => {
    const r = await trackApplication(str(fd, "code"), str(fd, "email"));
    return { data: { status: r.status, name: r.name, program: r.program, remarks: r.remarks, created: String(r.created_at) } };
  });
}
