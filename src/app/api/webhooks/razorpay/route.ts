import { handleWebhook } from "@/services/fees";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const r = await handleWebhook(raw, req.headers.get("x-razorpay-signature"), req.headers.get("x-razorpay-event-id"));
    return Response.json({ ok: true, result: r.status });
  } catch (e) {
    if (e instanceof AppError && e.code === "forbidden") return Response.json({ ok: false }, { status: 401 });
    log("error", "webhook failed", { error: e instanceof Error ? e.message : String(e) });
    // 5xx makes the provider retry; the handler is idempotent so retries are safe.
    return Response.json({ ok: false }, { status: e instanceof AppError && e.code === "invalid" ? 400 : 500 });
  }
}
