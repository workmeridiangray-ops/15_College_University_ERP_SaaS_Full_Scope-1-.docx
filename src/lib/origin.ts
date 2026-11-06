/** CSRF defence for cookie-authenticated mutating route handlers: the Origin must match this app. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    const o = new URL(origin);
    if (host && o.host === host) return true;
    const app = process.env.APP_URL ? new URL(process.env.APP_URL) : null;
    return !!app && o.host === app.host;
  } catch { return false; }
}
