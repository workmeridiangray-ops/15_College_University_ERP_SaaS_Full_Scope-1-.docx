import { one, query } from "./db";
import { randomToken, sha256, verifyPassword } from "./crypto";
import { AppError } from "./errors";
import { can, type Permission, type Role } from "./permissions";
import { audit } from "./audit";

export const SESSION_COOKIE = "erp_session";
const SESSION_HOURS = 12;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export interface SessionUser {
  id: string;
  institutionId: string | null;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  institution: { id: string; name: string; status: string; trialEndsAt: Date | null; isDemo: boolean } | null;
}

/** Throttle by IP+email to slow credential stuffing, independent of account lockout. */
export async function throttle(key: string): Promise<void> {
  const row = await one<{ attempts: number; window_start: Date }>("SELECT attempts, window_start FROM login_attempts WHERE key=$1", [key]);
  if (row && Date.now() - new Date(row.window_start).getTime() < 15 * 60_000 && row.attempts >= 20)
    throw new AppError("rate_limited", "Too many attempts. Please wait 15 minutes and try again.");
}
export async function noteAttempt(key: string, ok: boolean) {
  if (ok) { await query("DELETE FROM login_attempts WHERE key=$1", [key]); return; }
  await query(
    `INSERT INTO login_attempts (key, attempts, window_start) VALUES ($1,1,now())
     ON CONFLICT (key) DO UPDATE SET
       attempts = CASE WHEN login_attempts.window_start < now() - interval '15 minutes' THEN 1 ELSE login_attempts.attempts + 1 END,
       window_start = CASE WHEN login_attempts.window_start < now() - interval '15 minutes' THEN now() ELSE login_attempts.window_start END`,
    [key]
  );
}

export async function login(email: string, password: string, ip = "unknown"): Promise<{ token: string; user: SessionUser }> {
  const e = email.trim().toLowerCase();
  const key = `${ip}|${e}`;
  await throttle(key);
  const u = await one<{ id: string; password_hash: string; active: boolean; failed_logins: number; locked_until: Date | null; institution_id: string | null }>(
    "SELECT id, password_hash, active, failed_logins, locked_until, institution_id FROM users WHERE lower(email)=$1", [e]);
  const generic = new AppError("invalid", "Incorrect email or password.");
  if (!u) { verifyPassword(password, "scrypt$00$00"); await noteAttempt(key, false); throw generic; }
  if (u.locked_until && new Date(u.locked_until) > new Date())
    throw new AppError("rate_limited", "This account is temporarily locked after too many failed attempts. Try again in a few minutes or reset your password.");
  if (!verifyPassword(password, u.password_hash)) {
    const failed = u.failed_logins + 1;
    await query("UPDATE users SET failed_logins=$2::int, locked_until=CASE WHEN $2::int >= $3::int THEN now() + make_interval(mins => $4::int) ELSE NULL END WHERE id=$1", [u.id, failed, MAX_ATTEMPTS, LOCK_MINUTES]);
    await noteAttempt(key, false);
    await audit({ id: u.id, institutionId: u.institution_id }, "auth.login_failed");
    throw generic;
  }
  if (!u.active) throw new AppError("forbidden", "This account has been deactivated. Contact your administrator.");
  await query("UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=$1", [u.id]);
  await noteAttempt(key, true);
  const token = randomToken();
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2, now() + make_interval(hours => $3::int))", [sha256(token), u.id, SESSION_HOURS]);
  const user = await userFromToken(token);
  if (!user) throw generic;
  await audit({ id: user.id, institutionId: user.institutionId }, "auth.login");
  return { token, user };
}

export async function logout(token: string) {
  await query("DELETE FROM sessions WHERE token_hash=$1", [sha256(token)]);
}

export async function userFromToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const r = await one<{
    id: string; institution_id: string | null; email: string; name: string; role: Role; must_change_password: boolean;
    i_id: string | null; i_name: string | null; i_status: string | null; i_trial: Date | null; i_demo: boolean | null;
  }>(
    `SELECT u.id, u.institution_id, u.email, u.name, u.role, u.must_change_password,
            i.id i_id, i.name i_name, i.status i_status, i.trial_ends_at i_trial, i.is_demo i_demo
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN institutions i ON i.id = u.institution_id
     WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active`, [sha256(token)]);
  if (!r) return null;
  return {
    id: r.id, institutionId: r.institution_id, email: r.email, name: r.name, role: r.role, mustChangePassword: r.must_change_password,
    institution: r.i_id ? { id: r.i_id, name: r.i_name!, status: r.i_status!, trialEndsAt: r.i_trial, isDemo: !!r.i_demo } : null,
  };
}

/** Subscription gate. Suspended/cancelled institutions are fully blocked; expired trials are read-only. */
export function institutionAccess(u: SessionUser): "ok" | "read_only" | "blocked" {
  const i = u.institution;
  if (!i) return "ok";
  if (i.status === "suspended" || i.status === "cancelled") return "blocked";
  if (i.status === "past_due") return "read_only";
  if (i.status === "trial" && i.trialEndsAt && i.trialEndsAt < new Date()) return "read_only";
  return "ok";
}

export interface Ctx { user: SessionUser; institutionId: string }

/** Authorise a staff-facing server operation. Returns a tenant-scoped context. */
export function authorize(user: SessionUser | null, perm: Permission, opts: { write?: boolean } = {}): Ctx {
  if (!user) throw new AppError("unauthenticated", "Your session has expired. Please sign in again.");
  if (!user.institutionId) throw new AppError("forbidden", "This action is only available inside an institution.");
  if (!can(user.role, perm)) throw new AppError("forbidden", "You do not have permission to do that.");
  const access = institutionAccess(user);
  if (access === "blocked") throw new AppError("suspended", "This institution's subscription is suspended. Contact support.");
  if (access === "read_only" && opts.write) throw new AppError("suspended", "Your subscription has lapsed, so changes are disabled. Renew the plan to continue.");
  return { user, institutionId: user.institutionId };
}
