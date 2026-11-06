import { appUrl, mailConfigured, sendMail } from "@/lib/mail";

/** Emails a one-time link if mail is set up, otherwise returns it for the administrator to share. */
export async function deliverLink(toEmail: string, subject: string, intro: string, token: string, path = "/reset-password") {
  const link = `${appUrl()}${path}?token=${token}`;
  if (mailConfigured() && (await sendMail(toEmail, subject, `${intro}\n\n${link}\n\nThe link can be used once.`))) return { message: `An email with the link was sent to ${toEmail}.`, data: { link: undefined as string | undefined } };
  return { message: `Share this one-time link with ${toEmail} (email is not configured, so it was not sent):`, data: { link } };
}
