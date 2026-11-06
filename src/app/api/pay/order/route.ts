import { requireSession } from "@/lib/web";
import { createOnlineOrder } from "@/services/fees";
import { AppError } from "@/lib/errors";
import { sameOrigin } from "@/lib/origin";
import { userFromToken, SESSION_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Blocked cross-site request." }, { status: 403 });
  const user = await userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  try {
    const b = (await req.json()) as { invoiceId?: string; amount?: number };
    return Response.json(await createOnlineOrder(user, String(b.invoiceId ?? ""), b.amount));
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.code === "forbidden" || e.code === "not_found" ? 404 : 400 });
    return Response.json({ error: "Could not start the payment. Please try again." }, { status: 500 });
  }
}
