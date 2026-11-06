import nodemailer from "nodemailer";
import { log } from "./log";

export const mailConfigured = () => !!process.env.SMTP_URL;
export const devLinksAllowed = () => process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LINKS === "1";
export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!mailConfigured()) { log("warn", "mail not configured; message not sent", { subject }); return false; }
  try {
    const t = nodemailer.createTransport(process.env.SMTP_URL!);
    await t.sendMail({ from: process.env.MAIL_FROM || "Campus ERP <no-reply@localhost>", to, subject, text });
    return true;
  } catch (e) {
    log("error", "mail send failed", { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
