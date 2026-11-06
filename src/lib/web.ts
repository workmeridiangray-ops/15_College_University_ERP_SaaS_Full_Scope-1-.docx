import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, userFromToken, type SessionUser } from "./session";
import { can, homeFor, type Permission, type Role } from "./permissions";
import { AppError } from "./errors";
import { log } from "./log";

export type FormState = { ok?: boolean; message?: string; error?: string; fields?: Record<string, string>; expired?: boolean; data?: Record<string, unknown> } | null;

export async function currentUser(): Promise<SessionUser | null> {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  return userFromToken(t);
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login?expired=1");
  if (u.mustChangePassword) redirect("/account/password?first=1");
  if (roles && !roles.includes(u.role)) redirect(homeFor(u.role));
  return u;
}

export async function requirePerm(perm: Permission): Promise<SessionUser> {
  const u = await requireUser();
  if (!u.institutionId) redirect(homeFor(u.role));
  if (!can(u.role, perm)) redirect("/forbidden");
  return u;
}

export async function requireSession(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login?expired=1");
  return u;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/** Wraps a server action: converts expected errors to user messages, hides unexpected ones. */
export async function guard(fn: () => Promise<Partial<NonNullable<FormState>> | void>): Promise<FormState> {
  try {
    const r = await fn();
    return { ok: true, ...(r ?? {}) };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof AppError) return { ok: false, error: e.message, fields: e.fields, expired: e.code === "unauthenticated" };
    const ref = Math.random().toString(36).slice(2, 10);
    log("error", "unhandled action error", { ref, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split("\n").slice(0, 4).join(" | ") : undefined });
    return { ok: false, error: `Something went wrong on our side. Nothing was lost, please try again. If it keeps happening, quote reference ${ref} to support.` };
  }
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
export const inr = (paise: number | string | bigint | null | undefined) => "₹" + (Number(paise ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
