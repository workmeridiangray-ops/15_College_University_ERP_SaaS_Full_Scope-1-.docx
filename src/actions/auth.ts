"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { guard, str, clientIp, currentUser, requireSession, type FormState } from "@/lib/web";
import { login, logout, SESSION_COOKIE } from "@/lib/session";
import { homeFor } from "@/lib/permissions";
import { changeOwnPassword, requestPasswordReset, resetPassword, signupInstitution } from "@/services/core";
import { appUrl, devLinksAllowed, mailConfigured, sendMail } from "@/lib/mail";

const secureCookie = () => (process.env.APP_URL ?? "").startsWith("https://") || process.env.NODE_ENV === "production";

function safeNext(n: string): string | null { return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : null; }

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  let dest = "/";
  const res = await guard(async () => {
    const { token, user } = await login(str(fd, "email"), str(fd, "password"), await clientIp());
    (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/", maxAge: 12 * 3600 });
    dest = user.mustChangePassword ? "/account/password?first=1" : safeNext(str(fd, "next")) ?? homeFor(user.role);
  });
  if (res?.ok) redirect(dest);
  return res;
}

export async function logoutAction() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) await logout(t);
  jar.delete(SESSION_COOKIE);
  redirect("/login?out=1");
}

export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await guard(async () => {
    if (str(fd, "password") !== str(fd, "confirm")) { const { invalid } = await import("@/lib/errors"); throw invalid("Passwords do not match.", { confirm: "Does not match" }); }
    if (str(fd, "terms") !== "on") { const { invalid } = await import("@/lib/errors"); throw invalid("Please accept the terms to continue.", { terms: "Required" }); }
    await signupInstitution({ institutionName: str(fd, "institutionName"), adminName: str(fd, "adminName"), email: str(fd, "email"), password: str(fd, "password"), planCode: str(fd, "planCode") || "starter" });
    const { token, user } = await login(str(fd, "email"), str(fd, "password"), await clientIp());
    (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/", maxAge: 12 * 3600 });
    return { data: { home: homeFor(user.role) } };
  });
  if (res?.ok) redirect("/app?welcome=1");
  return res;
}

export async function forgotAction(_: FormState, fd: FormData): Promise<FormState> {
  return guard(async () => {
    if (!mailConfigured() && !devLinksAllowed())
      return { message: "Password reset email is not set up for this system. Ask your institution administrator to issue you a reset link (institution administrators: contact platform support)." };
    const { token } = await requestPasswordReset(str(fd, "email"));
    if (token) {
      const link = `${appUrl()}/reset-password?token=${token}`;
      if (mailConfigured()) await sendMail(str(fd, "email").trim().toLowerCase(), "Reset your Campus ERP password", `Use this link within 1 hour to choose a new password:\n\n${link}\n\nIf you did not ask for this, ignore this email.`);
      else return { message: `Development mode: ${link}` };
    }
    return { message: "If an account exists for that email, a reset link is on its way. It expires in one hour." };
  });
}

export async function resetAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await guard(async () => {
    if (str(fd, "password") !== str(fd, "confirm")) { const { invalid } = await import("@/lib/errors"); throw invalid("Passwords do not match.", { confirm: "Does not match" }); }
    await resetPassword(str(fd, "token"), str(fd, "password"));
  });
  if (res?.ok) redirect("/login?reset=1");
  return res;
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireSession();
  const first = str(fd, "first") === "1";
  const res = await guard(async () => {
    if (str(fd, "password") !== str(fd, "confirm")) { const { invalid } = await import("@/lib/errors"); throw invalid("Passwords do not match.", { confirm: "Does not match" }); }
    await changeOwnPassword(user, str(fd, "current"), str(fd, "password"));
  });
  if (res?.ok && first) { const u = await currentUser(); redirect(u ? homeFor(u.role) : "/login"); }
  return res?.ok ? { ...res, message: "Password updated." } : res;
}
