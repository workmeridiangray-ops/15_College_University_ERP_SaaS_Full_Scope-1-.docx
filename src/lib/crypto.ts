import crypto from "node:crypto";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltHex, keyHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !keyHex) return false;
  const key = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return "Password must contain letters and at least one number.";
  return null;
}
