/** Structured JSON logs to stdout; collected by the host's log pipeline. Never log secrets or personal data. */
export function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
  (level === "error" ? console.error : console.log)(line);
}
